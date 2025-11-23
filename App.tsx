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

  const getNodeStyle = (type: string | undefined, diagramType: DiagramType) => {
    const baseStyle = {
        background: '#fff',
        border: '1px solid #b1b1b7',
        borderRadius: '8px',
        padding: '10px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        minWidth: '120px',
        fontSize: '12px',
        textAlign: 'center' as const
    };

    if (diagramType === DiagramType.FLOWCHART) {
        if (type?.toLowerCase().includes('decision')) {
            return {
                ...baseStyle,
                background: '#fff0f0',
                border: '2px solid #e53e3e',
                borderRadius: '4px', 
                transform: 'rotate(0deg)', 
                fontWeight: 'bold',
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 
                padding: '24px 12px', 
                width: '140px',
                height: '90px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            };
        }
        if (type?.toLowerCase().includes('start') || type?.toLowerCase().includes('end')) {
            return { ...baseStyle, borderRadius: '25px', background: '#f0fff4', border: '2px solid #38a169', fontWeight: 'bold' };
        }
        return { ...baseStyle, borderRadius: '4px', border: '1px solid #3182ce' };
    }

    if (diagramType === DiagramType.ERD) {
        return {
            ...baseStyle,
            borderRadius: '0px',
            border: '1px solid #4a5568',
            borderTop: '4px solid #4a5568', // Header look
            background: '#f7fafc',
            boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
            textAlign: 'left' as const,
            padding: '8px 12px'
        };
    }

    // Mindmap Styling
    if (diagramType === DiagramType.MINDMAP) {
        return {
            ...baseStyle,
            borderRadius: '12px',
            borderWidth: '2px'
        };
    }

    return baseStyle;
  };

  const handleWizardSubmit = async (type: DiagramType, description: string, layout: LayoutStyle, additionalData: string) => {
    setLoading(true);
    try {
      const rawData = await generateDiagram(type, description, layout, additionalData);
      
      // Determine Edge Type: 'default' (Bezier) for Mindmaps, 'smoothstep' for others
      const edgeType = (type === DiagramType.MINDMAP || type === DiagramType.ORG_CHART) 
          ? 'default' 
          : 'smoothstep';

      // Transform API response to React Flow format
      const nodes: DiagramNode[] = rawData.nodes.map(n => ({
        id: n.id,
        type: 'default', 
        position: { x: 0, y: 0 }, 
        data: { label: n.label, details: n.details, type: n.type },
        style: getNodeStyle(n.type, type)
      }));

      const edges: DiagramEdge[] = rawData.edges.map((e, idx) => ({
        id: `e${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        type: edgeType, 
        markerEnd: {
            type: MarkerType.ArrowClosed,
        },
        animated: false, // Ensure static lines
        style: { strokeWidth: 2 } // Layout will assign colors
      }));

      // Apply Layout & Coloring
      const layoutedData = applyLayout(nodes, edges, layout, type);

      setDiagramData({
        nodes: layoutedData.nodes,
        edges: layoutedData.edges,
        type
      });
      setView('diagram');
    } catch (error: any) {
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