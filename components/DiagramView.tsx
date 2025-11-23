import React, { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  MarkerType,
  Panel,
  Connection,
  addEdge,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { DiagramNode, DiagramEdge, DiagramType, LayoutStyle } from '../types';
import { drillDownNode, getNodeDetails, updateDiagram } from '../services/gemini';
import { applyLayout } from '../utils/layout';
import { 
  PlusCircle, Info, X, Loader2, Download, RotateCcw, Trash2, 
  CornerDownRight, Edit3, Plus, Link as LinkIcon, ChevronDown,
  FileJson, FileImage, FileText, PenTool, Sparkles, Send, Code
} from 'lucide-react';

interface DiagramViewProps {
  initialNodes: DiagramNode[];
  initialEdges: DiagramEdge[];
  diagramType: DiagramType;
  onReset: () => void;
}

// Helper to escape XML characters for Draw.io export
const escapeXml = (unsafe: string) => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

const DiagramView: React.FC<DiagramViewProps> = ({ initialNodes, initialEdges, diagramType, onReset }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [nodeDetails, setNodeDetails] = useState<{ title: string; points: string[] } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Prompt Update State
  const [promptText, setPromptText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Editing State
  const [editLabel, setEditLabel] = useState('');

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Sync selected node label to edit input
  useEffect(() => {
    if (selectedNode) {
      setEditLabel(selectedNode.data.label);
    }
  }, [selectedNode]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setNodeDetails(null); // Close details if open
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setNodeDetails(null);
    setShowExportMenu(false);
  }, []);

  const handleUpdateLabel = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((node) => {
      if (node.id === selectedNode.id) {
        return { ...node, data: { ...node.data, label: editLabel } };
      }
      return node;
    }));
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, label: editLabel } } : null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUpdateLabel();
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const handleAddNode = () => {
    const id = `manual-${Date.now()}`;
    const newNode: DiagramNode = {
      id,
      position: { x: 100, y: 100 }, // Will be fixed if we re-layout, but for manual add, we keep it absolute
      data: { label: 'New Node' },
      type: 'default',
      style: { 
        background: '#fff', 
        border: '1px solid #b1b1b7', 
        borderRadius: '8px', 
        padding: '10px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        minWidth: '100px'
      }
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const handleAddChild = () => {
    if (!selectedNode) return;
    const id = `child-${Date.now()}`;
    const newNode: DiagramNode = {
      id,
      position: { x: selectedNode.position.x, y: selectedNode.position.y + 150 },
      data: { label: 'New Child' },
      type: 'default',
      style: { 
        background: '#fff', 
        border: '1px solid #b1b1b7', 
        borderRadius: '8px', 
        padding: '10px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        minWidth: '100px'
      }
    };
    const newEdge: DiagramEdge = {
      id: `e-${selectedNode.id}-${id}`,
      source: selectedNode.id,
      target: id,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true
    };
    setNodes((nds) => nds.concat(newNode));
    setEdges((eds) => eds.concat(newEdge));
  };

  const handleDrillDown = async () => {
    if (!selectedNode) return;
    setLoadingAction('Drilling down...');

    try {
      const label = selectedNode.data.label;
      const context = `Parent node is ${label}. Diagram type is ${diagramType}.`;

      const result = await drillDownNode(label, context, diagramType);

      // 1. Create new nodes and edges
      const newNodes: DiagramNode[] = result.newNodes.map((n, idx) => ({
        id: `gen-${Date.now()}-${idx}`,
        type: 'default',
        position: { x: 0, y: 0 }, // Layout will fix this
        data: { label: n.label, details: n.details, type: n.type },
        style: { 
            background: '#fff', 
            border: '1px solid #b1b1b7', 
            borderRadius: '8px', 
            padding: '10px',
            minWidth: '120px'
        }
      }));

      const newEdges: DiagramEdge[] = newNodes.map((n) => ({
        id: `e-${selectedNode.id}-${n.id}`,
        source: selectedNode.id,
        target: n.id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
      }));

      // 2. Merge with existing
      const allNodes = [...nodes, ...newNodes];
      const allEdges = [...edges, ...newEdges];

      // 3. RE-APPLY LAYOUT to ensure quality is maintained
      // We determine style based on diagram type
      let layoutStyle = LayoutStyle.TREE;
      if (diagramType === DiagramType.MINDMAP) layoutStyle = LayoutStyle.RADIAL;
      
      // Use the robust layout engine
      const layouted = applyLayout(allNodes, allEdges, layoutStyle, diagramType);

      setNodes(layouted.nodes);
      setEdges(layouted.edges);

    } catch (e) {
      console.error(e);
      alert("Failed to drill down. Try again.");
    } finally {
      setLoadingAction(null);
      setSelectedNode(null);
    }
  };

  const handleGetDetails = async () => {
    if (!selectedNode) return;
    setLoadingAction('Fetching details...');

    try {
      const points = await getNodeDetails(selectedNode.data.label, `Diagram Type: ${diagramType}`);
      setNodeDetails({
        title: selectedNode.data.label,
        points
      });
    } catch (e) {
      alert("Failed to fetch details.");
    } finally {
      setLoadingAction(null);
    }
  };
  
  const handlePromptSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptText.trim() || isUpdating) return;

    setIsUpdating(true);
    try {
      const result = await updateDiagram(nodes, edges, promptText, diagramType);
      
      // Process results
      const newNodes: DiagramNode[] = result.nodes.map(n => ({
        id: n.id,
        type: 'default',
        position: { x: 0, y: 0 }, // Layout will fix
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

      const newEdges: DiagramEdge[] = result.edges.map((e, idx) => ({
        id: `e${idx}-${Date.now()}`, // Ensure unique IDs
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
      }));

      // Re-apply layout on the WHOLE graph
      let layoutStyle = LayoutStyle.TREE;
      if (diagramType === DiagramType.MINDMAP) layoutStyle = LayoutStyle.RADIAL;

      const layouted = applyLayout(newNodes, newEdges, layoutStyle, diagramType);

      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setPromptText('');
    } catch (err) {
      console.error(err);
      alert("Failed to update diagram. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Export Functions ---
  
  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
  };

  const handleExportPNG = async () => {
    if (reactFlowWrapper.current === null) return;
    try {
      const dataUrl = await toPng(reactFlowWrapper.current, { backgroundColor: '#f8fafc' });
      const link = document.createElement('a');
      link.download = `${diagramType.toLowerCase().replace(/\s/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
      alert("Could not export image.");
    }
    setShowExportMenu(false);
  };

  const handleExportPDF = async () => {
    if (reactFlowWrapper.current === null) return;
    try {
      const dataUrl = await toPng(reactFlowWrapper.current, { backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: 'landscape' });
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${diagramType.toLowerCase().replace(/\s/g, '-')}.pdf`);
    } catch (err) {
      console.error("PDF Export failed", err);
      alert("Could not export PDF.");
    }
    setShowExportMenu(false);
  };

  const handleExportDrawIO = () => {
    // We prefix IDs with "node_" and "edge_" to avoid collisions with Draw.io reserved IDs '0' and '1'
    const xmlNodes = nodes.map(node => {
        const width = node.width || 150;
        const height = node.height || 60;
        const label = escapeXml(String(node.data.label || ''));
        const safeId = `node_${node.id}`;
        
        return `<mxCell id="${safeId}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${node.position.x}" y="${node.position.y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>`;
    }).join('\n');

    const xmlEdges = edges.map(edge => {
        const label = escapeXml(String(edge.label || ''));
        const safeId = `edge_${edge.id}`;
        const safeSource = `node_${edge.source}`;
        const safeTarget = `node_${edge.target}`;
        
        return `<mxCell id="${safeId}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="${safeSource}" target="${safeTarget}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
    }).join('\n');

    const mxFile = `<?xml version="1.0" encoding="UTF-8"?>
      <mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="MindGeniusAI" version="21.0.0" type="device">
        <diagram name="Page-1" id="diagram_${Date.now()}">
          <mxGraphModel dx="1000" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
            <root>
              <mxCell id="0" />
              <mxCell id="1" parent="0" />
              ${xmlNodes}
              ${xmlEdges}
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>
    `;

    downloadFile(mxFile, `${diagramType.toLowerCase().replace(/\s+/g, '_')}.drawio`, 'application/xml');
    setShowExportMenu(false);
  };

  const handleExportMarkdown = () => {
    let content = `# ${diagramType} Export\n\n`;
    
    // Simple hierarchy reconstruction
    nodes.forEach(node => {
        content += `## ${node.data.label}\n`;
        if (node.data.details) content += `- ${node.data.details}\n`;
        
        const outgoing = edges.filter(e => e.source === node.id);
        if (outgoing.length > 0) {
            content += `\n**Connects to:**\n`;
            outgoing.forEach(edge => {
                const target = nodes.find(n => n.id === edge.target);
                if (target) content += `- ${target.data.label} ${edge.label ? `(${edge.label})` : ''}\n`;
            });
        }
        content += `\n---\n`;
    });

    downloadFile(content, `${diagramType.toLowerCase().replace(/\s+/g, '_')}.md`, 'text/markdown');
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    const data = {
        type: diagramType,
        nodes: nodes,
        edges: edges,
        generatedAt: new Date().toISOString()
    };
    downloadFile(JSON.stringify(data, null, 2), `${diagramType.toLowerCase().replace(/\s+/g, '_')}.json`, 'application/json');
    setShowExportMenu(false);
  };

  return (
    <div className="w-full h-screen flex flex-col">
        {/* Header Toolbar */}
        <div className="h-14 border-b bg-white flex items-center justify-between px-6 shadow-sm z-10">
            <div className="flex items-center gap-4">
              <h2 className="font-bold text-gray-700 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">{diagramType}</span>
              </h2>
              <div className="h-6 w-px bg-gray-200"></div>
              <button onClick={handleAddNode} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm">
                  <Plus size={14} /> Add Node
              </button>
            </div>
            <div className="flex gap-2">
                <button onClick={onReset} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                    <RotateCcw size={14} /> New
                </button>
                
                {/* Export Dropdown */}
                <div className="relative">
                    <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Download size={14} /> Export <ChevronDown size={14} />
                    </button>
                    
                    {showExportMenu && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-100">
                            <button onClick={handleExportPNG} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <FileImage size={16} className="text-blue-500"/> Download Image (PNG)
                            </button>
                            <button onClick={handleExportPDF} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <FileText size={16} className="text-red-500"/> Download PDF
                            </button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button onClick={handleExportDrawIO} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <PenTool size={16} className="text-orange-500"/> Export to Draw.io
                            </button>
                            <button onClick={handleExportMarkdown} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <FileText size={16} className="text-gray-500"/> Editable Document (MD)
                            </button>
                            <button onClick={handleExportJSON} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <Code size={16} className="text-green-600"/> Download Code (JSON)
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>

      <div className="flex-grow relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          attributionPosition="bottom-right"
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          
          {/* Magic AI Prompt Bar - Bottom Center */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-xl px-4 z-50">
            <form 
                onSubmit={handlePromptSubmit}
                className="flex items-center gap-2 bg-white p-1.5 pr-2 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-200 ring-1 ring-black/5 hover:ring-blue-500/50 transition-all"
            >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0 text-white">
                   {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                </div>
                <input 
                    type="text"
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder={isUpdating ? "Updating diagram..." : "Ask AI to modify chart (e.g., 'Add a pricing section', 'Remove risks')"}
                    disabled={isUpdating}
                    className="flex-grow bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400 px-2"
                />
                <button 
                    type="submit"
                    disabled={!promptText.trim() || isUpdating}
                    className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-blue-600 hover:text-white disabled:opacity-50 disabled:hover:bg-gray-100 disabled:hover:text-gray-500 transition-colors"
                >
                    <Send size={16} />
                </button>
            </form>
          </div>

          {/* Floating Action Panel for Selected Node */}
          {selectedNode && !nodeDetails && (
            <Panel position="top-right" className="bg-white p-4 rounded-lg shadow-xl border border-gray-200 w-80 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-start mb-3 border-b pb-2">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Edit3 size={16} className="text-gray-500"/>
                  Edit Node
                </h3>
                <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                </button>
              </div>
              
              {/* Label Editor */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <button 
                    onClick={handleUpdateLabel}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-2 rounded"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* AI Actions */}
              <div className="mb-4">
                <p className="text-xs font-medium text-blue-600 mb-2 uppercase tracking-wider">AI Assist</p>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                      onClick={handleDrillDown}
                      disabled={!!loadingAction}
                      className="flex flex-col items-center justify-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 p-2 rounded hover:bg-blue-100 transition-colors text-xs font-medium disabled:opacity-50 h-16"
                  >
                      {loadingAction === 'Drilling down...' ? <Loader2 className="animate-spin" size={16}/> : <PlusCircle size={16} />}
                      <span>Drill Down</span>
                  </button>
                  <button 
                      onClick={handleGetDetails}
                      disabled={!!loadingAction}
                      className="flex flex-col items-center justify-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 p-2 rounded hover:bg-purple-100 transition-colors text-xs font-medium disabled:opacity-50 h-16"
                  >
                      {loadingAction === 'Fetching details...' ? <Loader2 className="animate-spin" size={16}/> : <Info size={16} />}
                      <span>Details</span>
                  </button>
                </div>
              </div>

              {/* Manual Actions */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Manual Actions</p>
                <div className="flex flex-col gap-2">
                  <button 
                      onClick={handleAddChild}
                      className="w-full flex items-center justify-start gap-2 text-gray-700 hover:bg-gray-50 p-2 rounded text-sm transition-colors"
                  >
                      <CornerDownRight size={16} className="text-gray-400" />
                      Add Child Node
                  </button>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <button 
                      onClick={handleDeleteNode}
                      className="w-full flex items-center justify-start gap-2 text-red-600 hover:bg-red-50 p-2 rounded text-sm transition-colors"
                  >
                      <Trash2 size={16} />
                      Delete Node
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {/* Detail View Modal Overlay */}
          {nodeDetails && (
            <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-200 max-w-md w-full mx-4 pointer-events-auto">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="text-lg font-bold text-gray-800">{nodeDetails.title}</h3>
                      <button onClick={() => setNodeDetails(null)} className="p-1 rounded-full hover:bg-gray-100">
                          <X size={20} className="text-gray-500" />
                      </button>
                  </div>
                  <ul className="space-y-3">
                      {nodeDetails.points.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-gray-600 text-sm leading-relaxed">
                              <span className="mt-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
                              {point}
                          </li>
                      ))}
                  </ul>
                  <div className="mt-6 flex justify-end">
                      <button 
                        onClick={() => setNodeDetails(null)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium"
                      >
                          Close
                      </button>
                  </div>
              </div>
            </div>
          )}
        </ReactFlow>
      </div>
    </div>
  );
};

export default DiagramView;