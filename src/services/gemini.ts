import { GoogleGenAI } from "@google/genai";

const API_KEY = "AIzaSyBaXrwyvYrgl5AificQRUGw03ze9DBKG_E";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function analyzeAgriculturalImage(base64: string) {
  try {
    const base64String = base64.includes(',') ? base64.split(',')[1] : base64;
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: base64String, mimeType: "image/jpeg" } },
          { text: "You are an expert agricultural consultant for Pakistani farmers. Analyze this crop/field image.\n\nFirst, provide these exact technical fields for the dashboard:\nCROP: [Type]\nHEALTH: [0-100]\nMOISTURE: [Dry/Optimal/Wet]\nDISEASE: [Yes/No]\nACTION: [Specific Action]\n\nThen, provide a natural analysis in plain text only, no markdown, no symbols. One paragraph English then one paragraph Roman Urdu. Be as specific as possible based on the visual evidence." }
        ]
      }]
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}

export async function chatWithExpert(
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  userMessage: string,
  scanContext?: string
) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        ...history,
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: `You are Zar'ai Mahir, a friendly Pakistani farming expert. ${scanContext ? `Crop analysis: ${scanContext}` : 'Give general farming advice.'} Reply in same language as user. Max 3 sentences. No markdown.`
      }
    });
    return response.text;
  } catch (error) {
    console.error("Chat Error:", error);
    return "Maafi bhai, thodi der mein dobara poochein.";
  }
}
