import { DiagramNode, DiagramEdge, LayoutStyle, DiagramType } from '../types';
import { MarkerType } from 'reactflow';

// Constants for layout spacing
const X_SPACING = 300; // Wide spacing to prevent text overlap
const Y_SPACING = 150; 

// Professional Palette for branches
const BRANCH_COLORS = [
  '#2563eb', // Blue
  '#db2777', // Pink
  '#d97706', // Amber
  '#16a34a', // Green
  '#7c3aed', // Violet
  '#0891b2', // Cyan
  '#dc2626', // Red
  '#4f46e5', // Indigo
  '#be185d', // Rose
  '#059669', // Emerald
];

export const applyLayout = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  style: LayoutStyle,
  diagramType: DiagramType
): { nodes: DiagramNode[]; edges: DiagramEdge[] } => {

  // Clone to avoid mutation issues
  const newNodes = nodes.map(n => ({ ...n }));
  let newEdges = edges.map(e => ({ ...e }));
  
  // 1. Apply Positioning
  if (diagramType === DiagramType.MINDMAP && style === LayoutStyle.RADIAL) {
     layoutRadial(newNodes, newEdges);
  } else if (diagramType === DiagramType.ERD) {
     layoutGrid(newNodes, newEdges);
  } else {
     // Flowcharts, Org Charts, and Tree-like Mindmaps
     // Use TB for Flowcharts/OrgCharts, LR for Mindmaps
     const direction = (diagramType === DiagramType.MINDMAP) ? 'LR' : 'TB';
     layoutLayered(newNodes, newEdges, direction);
  }

  // 2. Apply Branch Coloring & Style
  // For Mindmaps/Org Charts, we want colorful branches.
  // For Flowcharts/ERDs, we want professional neutral lines.
  if (diagramType === DiagramType.MINDMAP || diagramType === DiagramType.ORG_CHART) {
    newEdges = assignBranchColors(newNodes, newEdges);
  } else {
    // Uniform professional style for Flowchart/ERD
    newEdges.forEach(e => {
        e.style = { ...e.style, stroke: '#64748b', strokeWidth: 2 };
        e.animated = false;
    });
  }

  return { nodes: newNodes, edges: newEdges };
};

/**
 * Propagates colors from root's children down to leaves.
 */
const assignBranchColors = (nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] => {
    if (nodes.length === 0) return edges;

    const edgeMap = new Map<string, DiagramEdge>();
    edges.forEach(e => edgeMap.set(e.id, e));

    const adj = new Map<string, string[]>();
    edges.forEach(e => {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)?.push(e.target);
    });

    // Find Root (node with 0 incoming edges, or the first one)
    const incomingCount = new Map<string, number>();
    edges.forEach(e => incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1));
    
    let root = nodes.find(n => (incomingCount.get(n.id) || 0) === 0);
    if (!root && nodes.length > 0) root = nodes[0]; // Fallback for circular

    if (!root) return edges;

    const branchColors = new Map<string, string>(); // NodeID -> Color

    // BFS to assign colors
    const queue: { id: string; color?: string }[] = [];
    
    // Initialize root's children with distinct colors
    const rootChildren = adj.get(root.id) || [];
    rootChildren.forEach((childId, idx) => {
        const color = BRANCH_COLORS[idx % BRANCH_COLORS.length];
        branchColors.set(childId, color);
        queue.push({ id: childId, color });
        
        // Color the edge from Root -> Child
        const edge = edges.find(e => e.source === root?.id && e.target === childId);
        if (edge) {
            edge.style = { stroke: color, strokeWidth: 2 };
            edge.animated = false;
        }
    });

    while (queue.length > 0) {
        const { id, color } = queue.shift()!;
        if (!color) continue;

        const children = adj.get(id) || [];
        children.forEach(childId => {
            if (!branchColors.has(childId)) {
                branchColors.set(childId, color);
                queue.push({ id: childId, color });
                
                // Color the edge from Parent -> Child
                const edge = edges.find(e => e.source === id && e.target === childId);
                if (edge) {
                    edge.style = { stroke: color, strokeWidth: 2 };
                    edge.animated = false;
                }
            }
        });
    }

    return edges;
};

// Fallback for individual edge creation without layout
export const getEdgeColor = (sourceId: string, diagramType: DiagramType): string => {
  if (diagramType === DiagramType.FLOWCHART || diagramType === DiagramType.ERD) {
    return '#64748b';
  }
  // This is just a fallback; the layout engine does the real work
  return '#2563eb'; 
};

/**
 * Improved Layered Layout (Sugiyama-lite)
 */
const layoutLayered = (nodes: DiagramNode[], edges: DiagramEdge[], direction: 'TB' | 'LR') => {
  if (nodes.length === 0) return;

  const ranks = new Map<string, number>();
  nodes.forEach(n => ranks.set(n.id, 0));

  const iterations = nodes.length + 2; 
  for (let i = 0; i < iterations; i++) {
    let changed = false;
    edges.forEach(e => {
      const sourceRank = ranks.get(e.source) || 0;
      const targetRank = ranks.get(e.target) || 0;
      if (targetRank < sourceRank + 1) {
        ranks.set(e.target, sourceRank + 1);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const maxRank = Math.max(...Array.from(ranks.values()));
  const layers: DiagramNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodes.forEach(n => {
    const r = ranks.get(n.id) || 0;
    layers[r].push(n);
  });

  // Barycenter Crossing Reduction
  for (let i = 1; i < layers.length; i++) {
    const prevLayer = layers[i - 1];
    const currentLayer = layers[i];
    const prevIndexMap = new Map(prevLayer.map((n, idx) => [n.id, idx]));

    currentLayer.sort((a, b) => {
      const getBarycenter = (node: DiagramNode) => {
        const parents = edges.filter(e => e.target === node.id && ranks.get(e.source) === i - 1);
        if (parents.length === 0) return -1; 
        const sum = parents.reduce((acc, e) => acc + (prevIndexMap.get(e.source) ?? 0), 0);
        return sum / parents.length;
      };
      return getBarycenter(a) - getBarycenter(b);
    });
  }

  // Coordinate Assignment
  layers.forEach((layerNodes, r) => {
    const layerSize = layerNodes.length;
    
    layerNodes.forEach((node, idx) => {
      if (direction === 'TB') {
        // Center the layer
        const width = (layerSize - 1) * X_SPACING;
        const xOffset = -(width / 2);
        node.position = {
          x: xOffset + idx * X_SPACING,
          y: r * Y_SPACING
        };
      } else {
        // LR Layout
        const height = (layerSize - 1) * 120;
        const yOffset = -(height / 2);
        node.position = {
          x: r * 350,
          y: yOffset + idx * 120
        };
      }
    });
  });
};

/**
 * Grid Layout for ERDs
 */
const layoutGrid = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacingX = 350;
  const spacingY = 250;

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

  const incoming = new Set(edges.map(e => e.target));
  let center = nodes.find(n => !incoming.has(n.id)) || nodes[0];
  
  const visited = new Set<string>();
  visited.add(center.id);
  center.position = { x: 0, y: 0 };
  
  const layoutChildren = (parentId: string, startAngle: number, endAngle: number, level: number) => {
      const children = edges
        .filter(e => e.source === parentId)
        .map(e => nodes.find(n => n.id === e.target))
        .filter((n): n is DiagramNode => !!n && !visited.has(n.id));

      if (children.length === 0) return;

      const totalSector = endAngle - startAngle;
      const sectorPerChild = totalSector / children.length;

      children.forEach((child, idx) => {
          visited.add(child.id);
          // Center the angle in the sector
          const angle = startAngle + (sectorPerChild * idx) + (sectorPerChild / 2);
          const radius = level * 350; // Increased radius for better separation

          child.position = {
              x: radius * Math.cos(angle),
              y: radius * Math.sin(angle)
          };
          
          layoutChildren(
            child.id, 
            startAngle + (sectorPerChild * idx), 
            startAngle + (sectorPerChild * (idx + 1)), 
            level + 1
          );
      });
  };

  layoutChildren(center.id, 0, 2 * Math.PI, 1);

  // Handle disconnected islands
  const unvisited = nodes.filter(n => !visited.has(n.id));
  unvisited.forEach((n, i) => {
      n.position = { x: -600, y: i * 200 };
  });
};