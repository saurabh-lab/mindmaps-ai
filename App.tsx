import React, { useState } from 'react';
import Wizard from './components/Wizard';
import DiagramView from './components/DiagramView';
import { DiagramType, LayoutStyle, DiagramNode, DiagramEdge } from './types';
import { generateDiagram } from './services/gemini';
import { applyLayout } from './utils/layout';
import { MarkerType } from 'reactflow';

function App() {
  const [view, setView] = useState<'wizard' | 'diagram'>('wizard');
  const [loading, setLoading] = useState(false);
  const [diagramData, setDiagramData] = useState<{ nodes: DiagramNode[]; edges: DiagramEdge[]; type: DiagramType } | null>(null);

  const handleWizardSubmit = async (type: DiagramType, description: string, layout: LayoutStyle, additionalData: string) => {
    setLoading(true);
    try {
      const rawData = await generateDiagram(type, description, layout, additionalData);
      
      // Transform API response to React Flow format
      const nodes: DiagramNode[] = rawData.nodes.map(n => ({
        id: n.id,
        type: 'default', // can customize based on n.type
        position: { x: 0, y: 0 }, // layout engine will fix this
        data: { label: n.label, details: n.details, type: n.type },
        style: { 
            background: '#fff', 
            border: '1px solid #b1b1b7', 
            borderRadius: '8px', 
            padding: '10px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            minWidth: '100px'
        }
      }));

      const edges: DiagramEdge[] = rawData.edges.map((e, idx) => ({
        id: `e${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'smoothstep',
        markerEnd: {
            type: MarkerType.ArrowClosed,
        },
        animated: true,
      }));

      // Apply Layout Algorithm
      const layoutedData = applyLayout(nodes, edges, layout);

      setDiagramData({
        nodes: layoutedData.nodes,
        edges: layoutedData.edges,
        type
      });
      setView('diagram');
    } catch (error: any) {
      // Show the actual error message so the user knows if it's an API key issue
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to generate diagram: ${msg}`);
      console.error("App Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {view === 'wizard' && (
        <Wizard onSubmit={handleWizardSubmit} loading={loading} />
      )}
      {view === 'diagram' && diagramData && (
        <DiagramView 
            initialNodes={diagramData.nodes} 
            initialEdges={diagramData.edges} 
            diagramType={diagramData.type}
            onReset={() => setView('wizard')}
        />
      )}
    </div>
  );
}

export default App;