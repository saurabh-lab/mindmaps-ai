import { DiagramNode, DiagramEdge, LayoutStyle, DiagramType } from '../types';

// Constants for layout spacing
const NODE_WIDTH = 200; // Slightly wider for ERD/Flowchart nodes
const NODE_HEIGHT = 100;
const X_SPACING = 250; // Increased horizontal spacing
const Y_SPACING = 150; // Increased vertical spacing

export const applyLayout = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  style: LayoutStyle,
  diagramType: DiagramType
): { nodes: DiagramNode[]; edges: DiagramEdge[] } => {

  // Clone to avoid mutation issues
  const newNodes = nodes.map(n => ({ ...n }));
  
  if (diagramType === DiagramType.MINDMAP && style === LayoutStyle.RADIAL) {
     layoutRadial(newNodes, edges);
  } else if (diagramType === DiagramType.ERD) {
     layoutGrid(newNodes, edges);
  } else {
     // Flowcharts, Org Charts, and Tree-like Mindmaps
     // Use TB for Flowcharts/OrgCharts, LR for Mindmaps
     const direction = (diagramType === DiagramType.MINDMAP) ? 'LR' : 'TB';
     layoutLayered(newNodes, edges, direction);
  }

  return { nodes: newNodes, edges };
};

/**
 * Improved Layered Layout (Sugiyama-lite)
 * 1. Rank Assignment (Longest Path to respect dependencies)
 * 2. Crossing Reduction (Barycenter Heuristic)
 * 3. Coordinate Assignment
 */
const layoutLayered = (nodes: DiagramNode[], edges: DiagramEdge[], direction: 'TB' | 'LR') => {
  if (nodes.length === 0) return;

  // --- Step 1: Rank Assignment (Iterative Relaxation) ---
  const ranks = new Map<string, number>();
  nodes.forEach(n => ranks.set(n.id, 0));

  // Iterate to push nodes down based on parents
  // We run strictly limited iterations to handle cycles gracefully
  const iterations = nodes.length + 2; 
  for (let i = 0; i < iterations; i++) {
    let changed = false;
    edges.forEach(e => {
      const sourceRank = ranks.get(e.source) || 0;
      const targetRank = ranks.get(e.target) || 0;
      
      // Force target to be at least source + 1
      if (targetRank < sourceRank + 1) {
        ranks.set(e.target, sourceRank + 1);
        changed = true;
      }
    });
    if (!changed) break;
  }

  // Group nodes by rank
  const maxRank = Math.max(...Array.from(ranks.values()));
  const layers: DiagramNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodes.forEach(n => {
    const r = ranks.get(n.id) || 0;
    layers[r].push(n);
  });

  // --- Step 2: Crossing Reduction (Barycenter Heuristic) ---
  // Sort nodes in each layer based on the average position of their parents in the previous layer
  for (let i = 1; i < layers.length; i++) {
    const prevLayer = layers[i - 1];
    const currentLayer = layers[i];

    // Map node ID to index in previous layer
    const prevIndexMap = new Map(prevLayer.map((n, idx) => [n.id, idx]));

    currentLayer.sort((a, b) => {
      const getBarycenter = (node: DiagramNode) => {
        const parents = edges.filter(e => e.target === node.id && ranks.get(e.source) === i - 1);
        if (parents.length === 0) {
           // If no parents in immediate prev layer, keep relative order or push to side
           return -1; 
        }
        const sum = parents.reduce((acc, e) => acc + (prevIndexMap.get(e.source) ?? 0), 0);
        return sum / parents.length;
      };

      return getBarycenter(a) - getBarycenter(b);
    });
  }

  // --- Step 3: Coordinate Assignment ---
  // Calculate maximum width to help centering
  const maxLayerWidth = Math.max(...layers.map(l => l.length));
  
  layers.forEach((layerNodes, r) => {
    const layerSize = layerNodes.length;
    
    // Calculate offsets to center the layer
    // Width of this specific layer
    const currentLayerWidth = (layerSize - 1) * X_SPACING; 
    const startOffset = -(currentLayerWidth / 2);

    layerNodes.forEach((node, idx) => {
      if (direction === 'TB') {
        node.position = {
          x: startOffset + idx * X_SPACING,
          y: r * Y_SPACING
        };
      } else {
        // Left-to-Right
        // We swap axes. Ranks become X, index within rank becomes Y
        const layerHeight = (layerSize - 1) * 120; // Tighter vertical spacing for lists
        const startY = -(layerHeight / 2);
        
        node.position = {
          x: r * 300, // Wider separation for text
          y: startY + idx * 120
        };
      }
    });
  });
};

/**
 * Grid Layout for ERDs
 * Uses a wider grid to prevent overlapping of large entity boxes
 */
const layoutGrid = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacingX = 300;
  const spacingY = 250;

  // Sort nodes slightly to keep connected ones near each other (simple heuristic)
  // We can use the same Rank logic to roughly order them
  // But simple grid is often clearer for "Database Schema" style than a tree
  
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
 * Improved to handle subtree angle distribution
 */
const layoutRadial = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
  if (nodes.length === 0) return;

  // 1. Find Center
  const targets = new Set(edges.map(e => e.target));
  // Nodes that are not targets of any edge are roots
  let roots = nodes.filter(n => !targets.has(n.id));
  
  // If circular or no clear root, pick the one with most connections
  if (roots.length === 0) {
    roots = nodes.sort((a, b) => {
        const degA = edges.filter(e => e.source === a.id || e.target === a.id).length;
        const degB = edges.filter(e => e.source === b.id || e.target === b.id).length;
        return degB - degA;
    }).slice(0, 1);
  }

  const center = roots[0];
  const visited = new Set<string>();
  visited.add(center.id);
  center.position = { x: 0, y: 0 };

  // We will use a recursive function to layout children
  // allocating sectors of the circle
  
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
          
          // Center angle for this child
          const angle = startAngle + (sectorPerChild * idx) + (sectorPerChild / 2);
          const radius = level * 300;

          child.position = {
              x: radius * Math.cos(angle),
              y: radius * Math.sin(angle)
          };

          // Recurse
          layoutChildren(child.id, startAngle + (sectorPerChild * idx), startAngle + (sectorPerChild * (idx + 1)), level + 1);
      });
  };

  layoutChildren(center.id, 0, 2 * Math.PI, 1);

  // Handle disconnected nodes - stack them
  const unvisited = nodes.filter(n => !visited.has(n.id));
  unvisited.forEach((n, i) => {
      n.position = { x: -500, y: i * 150 };
  });
};