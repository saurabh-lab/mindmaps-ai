import { GoogleGenAI, Type } from "@google/genai";
import { DiagramType, LayoutStyle, GeneratedResponse, DrillDownResponse } from "../types";

// Upgraded to 3-pro for complex reasoning and detailed generation
const MODEL_NAME = 'gemini-3-pro-preview';

// Lazy initialization to prevent crash if env vars are missing at startup
let aiInstance: GoogleGenAI | null = null;

const getAiClient = () => {
  if (aiInstance) return aiInstance;
  
  const apiKey = process.env.API_KEY;
  // Check for empty string as well, since we default to '' in vite.config.ts
  if (apiKey && apiKey.length > 0) {
    aiInstance = new GoogleGenAI({ apiKey });
    return aiInstance;
  }
  return null;
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
          label: { type: Type.STRING, description: "Text to display on the node. Be specific." },
          type: { type: Type.STRING, description: "Type of node (e.g., 'default', 'decision', 'process', 'entity')" },
          details: { type: Type.STRING, description: "A detailed description or list of attributes for this node." }
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
    throw new Error("API Key is missing. Please create a .env file with API_KEY=your_key and restart the server.");
  }

  const prompt = `
    Create a highly detailed and exhaustive ${type} based on the following description: "${description}".
    Layout Intention: ${layout}.
    Additional Context: ${additionalData || "None"}.
    
    CRITICAL INSTRUCTIONS FOR COMPLETENESS:
    1. **Exhaustive Breakdown**: Do not summarize. Break down every topic into granular sub-topics.
    2. **Depth**: For Mindmaps, generate at least 4 levels of hierarchy (Root -> Main Branch -> Sub-branch -> Leaf Details).
    3. **Quantity**: Aim for a high number of nodes (30+) to fully cover the subject.
    4. **Details**: Populate the 'details' field for every node with specific attributes, examples, or data points.

    Type Specific Rules:
    - **Mindmap**: Central topic must branch into major categories, then into sub-categories, then into specific examples.
    - **Flowchart**: Include all decision points (Yes/No), error handling steps, and specific process actions.
    - **ERD**: Nodes must represent specific tables/entities. 'Details' field should list key attributes (PK, FK, etc).
    - **Org Chart**: specific roles, not just departments.
    
    Return strictly JSON matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: graphSchema,
        systemInstruction: "You are a meticulous Data Architect. You hate brevity. You love depth, nested structures, and comprehensive details. You always expand topics fully."
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as GeneratedResponse;
    }
    throw new Error("No content generated from Gemini.");
  } catch (error: any) {
    console.error("Generation Error:", error);
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

  // We send a simplified context but ask for a detailed update
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
    2. Return a FULL updated JSON structure.
    3. **Preserve Depth**: Do not simplify existing branches unless asked. 
    4. **Add Detail**: If adding new nodes, ensure they are as detailed as the rest of the diagram.
    5. PRESERVE existing IDs where possible.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: graphSchema,
        systemInstruction: "You are an intelligent diagram editor. You modify existing structures based on user intent while maintaining graph integrity and depth."
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as GeneratedResponse;
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
    1. Generate 8-12 granular sub-nodes related to "${nodeLabel}".
    2. Include specific examples, attributes, or sub-process steps.
    3. Return them as new nodes and edges connecting from "${nodeLabel}".
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: graphSchema,
        systemInstruction: "You are an expert analyst expanding a diagram. Provide highly detailed sub-nodes."
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as GeneratedResponse;
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
    Provide 5-7 detailed, actionable bullet points explaining: "${nodeLabel}".
    Context: ${context}.
    Include technical details, pros/cons, or specific data points where applicable.
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
        const res = JSON.parse(response.text);
        return res.points || [];
    }
    return ["Could not generate details."];
  } catch (error) {
    return ["Error fetching details."];
  }
};