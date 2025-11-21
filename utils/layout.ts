import { DiagramNode, DiagramEdge, LayoutStyle } from '../types';

// Basic Layout Engine to avoid heavy heavy dependencies like Dagre/Elk in this environment
// In a real prod app, use 'dagre' or 'elkjs'

export const applyLayout = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  style: LayoutStyle
): { nodes: DiagramNode[]; edges: DiagramEdge[] } => {
  
  // Reset positions if needed or calculating from scratch
  // We identify the "root" or start nodes (nodes with no incoming edges)
  const nodeIds = new Set(nodes.map(n => n.id));
  const targetIds = new Set(edges.map(e => e.target));
  const roots = nodes.filter(n => !targetIds.has(n.id));
  
  // If no clear root (circular), pick the first one
  const startNodes = roots.length > 0 ? roots : [nodes[0]];
  
  const newNodes = [...nodes];
  
  if (style === LayoutStyle.RADIAL || style === LayoutStyle.CIRCULAR) {
    layoutRadial(newNodes, edges, startNodes[0]?.id);
  } else {
    // Default to Tree/Hierarchical
    layoutTree(newNodes, edges, startNodes);
  }

  return { nodes: newNodes, edges };
};

const layoutTree = (nodes: DiagramNode[], edges: DiagramEdge[], roots: DiagramNode[]) => {
  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 80;
  const LEVEL_HEIGHT = 150;

  const levels: Record<string, number> = {};
  const visited = new Set<string>();

  // BFS to determine levels
  const queue: { id: string; level: number }[] = roots.map(r => ({ id: r.id, level: 0 }));
  
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    levels[item.id] = item.level;

    const children = edges
      .filter(e => e.source === item.id)
      .map(e => e.target);
    
    children.forEach(childId => {
      queue.push({ id: childId, level: item.level + 1 });
    });
  }

  // Group by level
  const nodesByLevel: Record<number, DiagramNode[]> = {};
  nodes.forEach(node => {
    const level = levels[node.id] ?? 0;
    if (!nodesByLevel[level]) nodesByLevel[level] = [];
    nodesByLevel[level].push(node);
  });

  // Assign X, Y
  Object.keys(nodesByLevel).forEach(levelStr => {
    const level = parseInt(levelStr);
    const levelNodes = nodesByLevel[level];
    const totalWidth = levelNodes.length * NODE_WIDTH;
    const startX = -(totalWidth / 2);

    levelNodes.forEach((node, index) => {
      node.position = {
        x: startX + index * NODE_WIDTH,
        y: level * LEVEL_HEIGHT
      };
    });
  });
};

const layoutRadial = (nodes: DiagramNode[], edges: DiagramEdge[], centerId: string) => {
  const RADIUS_INCREMENT = 250;
  const centerNode = nodes.find(n => n.id === centerId);
  
  if (centerNode) {
    centerNode.position = { x: 0, y: 0 };
  }

  const visited = new Set<string>([centerId]);
  let currentLevelNodes = edges.filter(e => e.source === centerId).map(e => e.target);
  let radius = RADIUS_INCREMENT;

  while (currentLevelNodes.length > 0) {
    const angleStep = (2 * Math.PI) / currentLevelNodes.length;
    const nextLevelNodes: string[] = [];

    currentLevelNodes.forEach((nodeId, index) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        node.position = {
          x: radius * Math.cos(index * angleStep),
          y: radius * Math.sin(index * angleStep)
        };
      }

      const children = edges.filter(e => e.source === nodeId).map(e => e.target);
      nextLevelNodes.push(...children);
    });

    currentLevelNodes = nextLevelNodes;
    radius += RADIUS_INCREMENT;
  }
};
