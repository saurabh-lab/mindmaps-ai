import { DiagramNode, DiagramEdge, LayoutStyle, DiagramType } from '../types';

// Constants for layout spacing
const MINDMAP_H_SPACING = 250; // Horizontal reach for branches
const MINDMAP_NODE_HEIGHT_SLOT = 60; // Base height slot per node
const LAYERED_X_SPACING = 200; // Flowchart Horizontal
const LAYERED_Y_SPACING = 100; // Flowchart Vertical

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
  if (diagramType === DiagramType.MINDMAP) {
     layoutMindmap(newNodes, newEdges);
  } else if (diagramType === DiagramType.ERD) {
     layoutGrid(newNodes, newEdges);
  } else {
     // Flowcharts, Org Charts
     const direction = (style === LayoutStyle.RADIAL) ? 'LR' : 'TB';
     layoutLayered(newNodes, newEdges, direction);
  }

  // 2. Apply Branch Coloring & Style
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

    const adj = new Map<string, string[]>();
    edges.forEach(e => {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)?.push(e.target);
    });

    // Find Root (node with 0 incoming edges, or the first one)
    const incomingCount = new Map<string, number>();
    edges.forEach(e => incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1));
    
    let root = nodes.find(n => (incomingCount.get(n.id) || 0) === 0);
    if (!root && nodes.length > 0) root = nodes[0];

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

export const getEdgeColor = (sourceId: string, diagramType: DiagramType): string => {
  if (diagramType === DiagramType.FLOWCHART || diagramType === DiagramType.ERD) {
    return '#64748b';
  }
  return '#2563eb'; 
};

/**
 * Balanced Horizontal Tree Layout (Miro-style)
 */
const layoutMindmap = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
    if (nodes.length === 0) return;

    // 1. Build Adjacency List
    const adj = new Map<string, string[]>();
    edges.forEach(e => {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)?.push(e.target);
    });

    // 2. Find Root
    const incoming = new Set(edges.map(e => e.target));
    const root = nodes.find(n => !incoming.has(n.id)) || nodes[0];

    // 3. Compute Subtree Sizes
    // We map each node to the vertical space it requires (height)
    const nodeData = new Map<string, { height: number }>();
    const visited = new Set<string>(); // Prevent cycles

    const calculateSubtreeHeight = (nodeId: string): number => {
        if (visited.has(nodeId)) return MINDMAP_NODE_HEIGHT_SLOT;
        visited.add(nodeId);

        const children = adj.get(nodeId) || [];
        if (children.length === 0) {
            const h = MINDMAP_NODE_HEIGHT_SLOT;
            nodeData.set(nodeId, { height: h });
            return h;
        }

        let totalHeight = 0;
        children.forEach(childId => {
            totalHeight += calculateSubtreeHeight(childId);
        });

        nodeData.set(nodeId, { height: totalHeight });
        return totalHeight;
    };

    calculateSubtreeHeight(root.id);

    // 4. Position Nodes
    const positioned = new Set<string>();
    
    // Recursive placement function
    const placeNode = (nodeId: string, x: number, y: number, direction: 1 | -1) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            node.position = { x, y };
        }
        positioned.add(nodeId);

        const children = adj.get(nodeId) || [];
        if (children.length === 0) return;

        // Calculate starting Y for children to be centered relative to parent
        // The children block starts at: CurrentY - (TotalChildrenHeight / 2)
        const childrenTotalHeight = children.reduce((acc, cid) => acc + (nodeData.get(cid)?.height || MINDMAP_NODE_HEIGHT_SLOT), 0);
        let currentChildY = y - (childrenTotalHeight / 2);

        children.forEach(childId => {
            const childHeight = nodeData.get(childId)?.height || MINDMAP_NODE_HEIGHT_SLOT;
            const childCenterY = currentChildY + (childHeight / 2);
            
            // X offset is constant spacing
            const childX = x + (direction * MINDMAP_H_SPACING);

            if (!positioned.has(childId)) {
                placeNode(childId, childX, childCenterY, direction);
            }
            
            currentChildY += childHeight;
        });
    };

    // 5. Layout Root and Split Level 1 Children
    root.position = { x: 0, y: 0 };
    positioned.add(root.id);

    const rootChildren = adj.get(root.id) || [];
    
    // Split alternatingly to balance
    const rightChildren = rootChildren.filter((_, i) => i % 2 === 0);
    const leftChildren = rootChildren.filter((_, i) => i % 2 !== 0);

    // Calculate total heights for the main branches to center them on the root
    const rightTotal = rightChildren.reduce((acc, id) => acc + (nodeData.get(id)?.height || 0), 0);
    const leftTotal = leftChildren.reduce((acc, id) => acc + (nodeData.get(id)?.height || 0), 0);

    // Place Right Branch
    let currentY = -(rightTotal / 2);
    rightChildren.forEach(childId => {
        const h = nodeData.get(childId)?.height || MINDMAP_NODE_HEIGHT_SLOT;
        placeNode(childId, MINDMAP_H_SPACING, currentY + (h/2), 1);
        currentY += h;
    });

    // Place Left Branch
    currentY = -(leftTotal / 2);
    leftChildren.forEach(childId => {
        const h = nodeData.get(childId)?.height || MINDMAP_NODE_HEIGHT_SLOT;
        placeNode(childId, -MINDMAP_H_SPACING, currentY + (h/2), -1);
        currentY += h;
    });

    // Handle any disconnected nodes (islands)
    const unpositioned = nodes.filter(n => !positioned.has(n.id));
    unpositioned.forEach((n, i) => {
        n.position = { x: 0, y: (rootChildren.length * 100) + (i * 100) };
    });
};

/**
 * Improved Layered Layout (Sugiyama-lite) for Flowcharts
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
        const width = (layerSize - 1) * LAYERED_X_SPACING;
        const xOffset = -(width / 2);
        node.position = {
          x: xOffset + idx * LAYERED_X_SPACING,
          y: r * LAYERED_Y_SPACING
        };
      } else {
        const height = (layerSize - 1) * 100;
        const yOffset = -(height / 2);
        node.position = {
          x: r * 300,
          y: yOffset + idx * 100
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
  const spacingX = 300;
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