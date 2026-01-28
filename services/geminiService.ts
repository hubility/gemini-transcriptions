
import { GoogleGenAI } from "@google/genai";
import { TRANSCRIPTION_PROMPT, PROPOSAL_PROMPT, UPSELLING_PROMPT } from "../constants";

export async function transcribeAudioChunk(
  base64Data: string, 
  mimeType: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            { 
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.1, // Lower temperature for more accurate transcription
        topP: 0.95,
        topK: 40,
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

export async function generateBusinessDocument(
  transcriptText: string,
  type: 'proposal' | 'upselling'
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const promptTemplate = type === 'proposal' ? PROPOSAL_PROMPT : UPSELLING_PROMPT;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Using Flash for speed, can switch to 'gemini-3-pro-preview' for higher reasoning
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptTemplate },
            { text: `\n\n--- TRANSCRIPCIÓN DE LA REUNIÓN ---\n${transcriptText}` }
          ]
        }
      ],
      config: {
        temperature: 0.7, // Higher temperature for creative business writing
      }
    });

    return response.text || "Error generating document.";
  } catch (error) {
    console.error("Document generation error:", error);
    throw error;
  }
}
