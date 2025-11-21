import type { Node, Edge } from 'reactflow';

export enum DiagramType {
  MINDMAP = 'Mindmap',
  FLOWCHART = 'Flowchart',
  ERD = 'Entity-Relationship Diagram',
  ORG_CHART = 'Organizational Chart'
}

export enum LayoutStyle {
  TREE = 'Tree',
  RADIAL = 'Radial',
  HIERARCHICAL = 'Hierarchical',
  CIRCULAR = 'Circular',
  NETWORK = 'Network'
}

export type DiagramNode = Node<{
  label: string;
  details?: string;
  type?: string; // e.g., 'decision', 'process', 'entity'
}>;

export type DiagramEdge = Edge;

export interface GraphData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

// API Response Types
export interface GeneratedNode {
  id: string;
  label: string;
  type?: string; // For shape logic
  details?: string; // Initial short details
  parentId?: string; // To help link back
}

export interface GeneratedResponse {
  nodes: GeneratedNode[];
  edges: { source: string; target: string; label?: string }[];
}

export interface DrillDownResponse {
  newNodes: GeneratedNode[];
  newEdges: { source: string; target: string; label?: string }[];
  context?: string;
}