import { DiagramNode, DiagramEdge, LayoutStyle, DiagramType } from '../types';

// Constants for layout spacing
const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;
const X_SPACING = 50;
const Y_SPACING = 100;

export const applyLayout = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  style: LayoutStyle,
  diagramType: DiagramType
): { nodes: DiagramNode[]; edges: DiagramEdge[] } => {

  // Clone to avoid mutation issues
  const newNodes = nodes.map(n => ({ ...n }));
  
  // Select layout strategy based on Diagram Type and User Preference
  if (diagramType === DiagramType.MINDMAP && style === LayoutStyle.RADIAL) {
     layoutRadial(newNodes, edges);
  } else if (diagramType === DiagramType.FLOWCHART) {
     layoutLayered(newNodes, edges, 'TB'); // Top-to-Bottom for Flowcharts
  } else if (diagramType === DiagramType.ERD) {
     layoutGrid(newNodes, edges); // Grid/Forest for ERD
  } else {
     // Default Tree/Hierarchical
     layoutLayered(newNodes, edges, 'LR'); // Left-to-Right for Mindmaps/Org Charts by default
  }

  return { nodes: newNodes, edges };
};

/**
 * Layered Layout (Sugiyama-lite)
 * Good for Flowcharts (TB) and Mindmaps/OrgCharts (LR)
 * Handles disconnected graphs (forests).
 */
const layoutLayered = (nodes: DiagramNode[], edges: DiagramEdge[], direction: 'TB' | 'LR') => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const targets = new Set(edges.map(e => e.target));
  
  // 1. Identify Roots (nodes with no incoming edges)
  // If a circular dependency exists, we might have no roots. Fallback to first node.
  let roots = nodes.filter(n => !targets.has(n.id));
  if (roots.length === 0 && nodes.length > 0) roots = [nodes[0]];

  const levels: Record<string, number> = {};
  const visited = new Set<string>();
  
  // 2. BFS to assign levels (ranks)
  const queue: { id: string; level: number }[] = roots.map(r => ({ id: r.id, level: 0 }));
  
  // Handle disconnected components by ensuring all nodes are visited
  let unvisited = new Set(nodes.map(n => n.id));
  
  while (unvisited.size > 0) {
    if (queue.length === 0) {
      // Pick an unvisited node to start a new tree/cluster
      const nextId = unvisited.values().next().value!;
      queue.push({ id: nextId, level: 0 });
    }

    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    
    visited.add(id);
    unvisited.delete(id);
    levels[id] = level;

    // Find children
    const children = edges.filter(e => e.source === id).map(e => e.target);
    children.forEach(childId => {
      queue.push({ id: childId, level: level + 1 });
    });
  }

  // 3. Group nodes by level
  const nodesByLevel: Record<number, DiagramNode[]> = {};
  let maxLevel = 0;
  
  nodes.forEach(node => {
    const level = levels[node.id] ?? 0;
    maxLevel = Math.max(maxLevel, level);
    if (!nodesByLevel[level]) nodesByLevel[level] = [];
    nodesByLevel[level].push(node);
  });

  // 4. Position Nodes
  // We center align parents relative to children roughly by just centering the row
  Object.keys(nodesByLevel).forEach(levelStr => {
    const level = parseInt(levelStr);
    const levelNodes = nodesByLevel[level];
    
    // Calculate Row Width
    const rowWidth = levelNodes.length * NODE_WIDTH + (levelNodes.length - 1) * X_SPACING;
    const startX = -(rowWidth / 2);

    levelNodes.forEach((node, index) => {
      if (direction === 'TB') {
        // Top to Bottom (Flowchart)
        node.position = {
          x: startX + index * (NODE_WIDTH + X_SPACING),
          y: level * (NODE_HEIGHT + Y_SPACING)
        };
      } else {
        // Left to Right (Mindmap)
        node.position = {
          x: level * (NODE_WIDTH + Y_SPACING), // Swap spacing for LR
          y: startX + index * (NODE_HEIGHT - 40) // Tighter vertical packing for mindmaps
        };
      }
    });
  });
};

/**
 * Grid Layout for ERDs
 * Organizes disconnected entities into a neat grid to avoid overlap
 */
const layoutGrid = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
  // Simple grid packing
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacingX = 250;
  const spacingY = 200;

  nodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    node.position = {
      x: col * spacingX,
      y: row * spacingY
    };
  });
};

/**
 * Radial Layout for Mindmaps
 */
const layoutRadial = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
  if (nodes.length === 0) return;

  // Find center (root)
  const targets = new Set(edges.map(e => e.target));
  const roots = nodes.filter(n => !targets.has(n.id));
  const centerNode = roots.length > 0 ? roots[0] : nodes[0];

  const visited = new Set<string>();
  const queue: { id: string; level: number; angleStart: number; angleEnd: number }[] = [
    { id: centerNode.id, level: 0, angleStart: 0, angleEnd: 2 * Math.PI }
  ];

  // Assign basic positions
  while (queue.length > 0) {
    const { id, level, angleStart, angleEnd } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodes.find(n => n.id === id);
    if (!node) continue;

    if (level === 0) {
      node.position = { x: 0, y: 0 };
    } else {
      const radius = level * 250;
      const angle = (angleStart + angleEnd) / 2;
      node.position = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      };
    }

    const children = edges.filter(e => e.source === id).map(e => e.target);
    if (children.length > 0) {
      const angleStep = (angleEnd - angleStart) / children.length;
      children.forEach((childId, idx) => {
        queue.push({
          id: childId,
          level: level + 1,
          angleStart: angleStart + idx * angleStep,
          angleEnd: angleStart + (idx + 1) * angleStep
        });
      });
    }
  }

  // Handle disconnected nodes in radial mode (put them in a list on the side)
  const unvisited = nodes.filter(n => !visited.has(n.id));
  unvisited.forEach((node, idx) => {
    node.position = {
      x: -400,
      y: idx * 100
    };
  });
};