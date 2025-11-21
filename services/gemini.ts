import { GoogleGenAI, Type } from "@google/genai";
import { DiagramType, LayoutStyle, GeneratedResponse, DrillDownResponse } from "../types";

// Switched to 2.5-flash as it is generally faster and more stable for structured tasks without special access
const MODEL_NAME = 'gemini-2.5-flash';

// Lazy initialization to prevent crash if env vars are missing at startup
let aiInstance: GoogleGenAI | null = null;

const getAiClient = () => {
  if (aiInstance) return aiInstance;
  
  const apiKey = process.env.API_KEY;
  
  // Debug logging (masked) to help user verify key loading
  if (!apiKey) {
    console.error("Gemini Service: API Key is missing or empty.");
  } else {
    console.log(`Gemini Service: API Key present (starts with ${apiKey.substring(0, 4)}...)`);
  }

  if (apiKey && apiKey.length > 0) {
    aiInstance = new GoogleGenAI({ apiKey });
    return aiInstance;
  }
  return null;
};

// Helper to clean markdown code blocks from JSON response
const cleanJsonString = (text: string): string => {
  let clean = text.trim();
  // Remove markdown code blocks if present
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return clean;
};

const graphSchema = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Unique short ID (e.g., 'n1')" },
          label: { type: Type.STRING, description: "Text to display on the node" },
          type: { type: Type.STRING, description: "Type of node (e.g., 'default', 'diamond' for decision, 'input', 'output')" },
          details: { type: Type.STRING, description: "A short 1-sentence description of this node." }
        },
        required: ["id", "label"]
      }
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING, description: "Source Node ID" },
          target: { type: Type.STRING, description: "Target Node ID" },
          label: { type: Type.STRING, description: "Optional label for the connection" }
        },
        required: ["source", "target"]
      }
    }
  },
  required: ["nodes", "edges"]
};

export const generateDiagram = async (
  type: DiagramType,
  description: string,
  layout: LayoutStyle,
  additionalData?: string
): Promise<GeneratedResponse> => {

  const ai = getAiClient();
  if (!ai) {
    throw new Error("API Key is missing. Please ensure API_KEY is set in your .env file and RESTART the server.");
  }

  const prompt = `
    Create a ${type} based on the following description: "${description}".
    Layout Style Intention: ${layout}.
    Additional Context: ${additionalData || "None"}.
    
    Requirements:
    1. Create a logical structure suitable for a ${type}.
    2. If it is a Flowchart, use standard node types (decision points, processes).
    3. If it is an ERD, nodes should represent entities.
    4. If it is a Mindmap, use a central topic and branch out.
    5. If it is an Organizational Chart (Org Chart), nodes should represent Roles or Departments with a clear hierarchy.
    6. Limit the initial graph to 10-15 key nodes to avoid clutter.
    7. Return strictly JSON matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: graphSchema,
        systemInstruction: "You are an expert Data Visualization Architect and Systems Engineer. You create structured, logical diagrams."
      }
    });

    if (response.text) {
      try {
        const cleanedText = cleanJsonString(response.text);
        return JSON.parse(cleanedText) as GeneratedResponse;
      } catch (e) {
        console.error("JSON Parse Error. Raw text:", response.text);
        throw new Error("AI returned invalid JSON format.");
      }
    }
    throw new Error("No content generated from Gemini.");
  } catch (error: any) {
    console.error("Generation Error Details:", error);
    // Pass the specific error message up
    throw new Error(error.message || "Unknown AI error");
  }
};

export const updateDiagram = async (
  currentNodes: any[],
  currentEdges: any[],
  userPrompt: string,
  diagramType: DiagramType
): Promise<GeneratedResponse> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API Key missing");

  // Simplify context to save tokens and focus on structure
  const simplifiedNodes = currentNodes.map(n => ({ id: n.id, label: n.data.label, details: n.data.details }));
  const simplifiedEdges = currentEdges.map(e => ({ source: e.source, target: e.target, label: e.label }));
  
  const context = JSON.stringify({ nodes: simplifiedNodes, edges: simplifiedEdges });

  const prompt = `
    You are updating an existing ${diagramType}.
    
    Current Structure (JSON):
    ${context}

    User Request: "${userPrompt}"

    Instructions:
    1. Analyze the User Request and the Current Structure.
    2. Return a FULL updated JSON structure (nodes and edges) that incorporates the changes.
    3. You can add new nodes, remove nodes, rename nodes, or change connections.
    4. PRESERVE existing IDs for nodes that haven't changed significantly to maintain continuity. Generate new IDs for new nodes.
    5. Ensure the output matches the required schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: graphSchema,
        systemInstruction: "You are an intelligent diagram editor. You modify existing structures based on user intent while maintaining graph integrity."
      }
    });

    if (response.text) {
      const cleanedText = cleanJsonString(response.text);
      return JSON.parse(cleanedText) as GeneratedResponse;
    }
    throw new Error("No update generated");
  } catch (error) {
    console.error("Update Error:", error);
    throw error;
  }
};

export const drillDownNode = async (
  nodeLabel: string,
  currentContext: string,
  diagramType: DiagramType
): Promise<DrillDownResponse> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API Key missing");
  
  const prompt = `
    The user wants to drill down into the node labeled: "${nodeLabel}" within a ${diagramType}.
    Current context of the diagram: ${currentContext}.

    Task:
    1. Suggest 3-5 sub-components, child steps, or attributes related to "${nodeLabel}".
    2. Return them as new nodes and edges connecting from the original node ("${nodeLabel}").
    3. The 'source' of the new edges should be the ID of the parent node (but you might not know the ID, so assume the user will map it, or return the source label and we will map it. Actually, for this strict schema, generate new unique IDs for children).
  `;

  // Re-using graph schema but we interpret it as additive
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: graphSchema, // We use the same schema structure
        systemInstruction: "You are an expert analyst expanding a diagram. Provide detailed sub-nodes."
      }
    });

    if (response.text) {
      const cleanedText = cleanJsonString(response.text);
      const data = JSON.parse(cleanedText) as GeneratedResponse;
      return {
        newNodes: data.nodes,
        newEdges: data.edges
      };
    }
    throw new Error("No drill down content");
  } catch (error) {
    console.error("Drill Down Error:", error);
    throw error;
  }
};

export const getNodeDetails = async (nodeLabel: string, context: string): Promise<string[]> => {
  const ai = getAiClient();
  if (!ai) return ["API Key missing. Cannot fetch details."];

  const prompt = `
    Provide 3-4 detailed bullet points explaining the concept or step: "${nodeLabel}".
    Context of the diagram: ${context}.
    Keep it concise but informative.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                points: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        }
      }
    });

    if (response.text) {
        const cleanedText = cleanJsonString(response.text);
        const res = JSON.parse(cleanedText);
        return res.points || [];
    }
    return ["Could not generate details."];
  } catch (error) {
    return ["Error fetching details."];
  }
};