import { GoogleGenAI } from "@google/genai";

const getAI = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("VITE_GEMINI_API_KEY missing");
  return new GoogleGenAI({ apiKey: key });
};

export async function analyzeAgriculturalImage(base64: string) {
  try {
    const ai = getAI();
    const base64String = base64.includes(',') ? base64.split(',')[1] : base64;
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: base64String, mimeType: "image/jpeg" } },
          { text: "You are an expert agricultural consultant for Pakistani farmers. Analyze this crop/field image. Identify: 1) Crop type 2) Visible diseases or pest damage 3) Soil and moisture condition 4) Immediate action required. Provide advice in plain text only, no markdown symbols, no headers with #, no bold with **. Write naturally. Give one paragraph in English then one paragraph in Roman Urdu." }
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
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        ...history,
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: `You are Zar'ai Mahir, a friendly Pakistani farming expert. 
        ${scanContext ? `You have analyzed this crop: ${scanContext}` : 'Give general farming advice.'}
        Rules: Reply in same language as user. Roman Urdu for Roman Urdu. 
        Max 3 sentences. No markdown. No bullet points. Talk like a helpful older brother.`
      }
    });
    return response.text;
  } catch (error) {
    console.error("Chat Error:", error);
    return "Maafi bhai, thodi der mein dobara poochein.";
  }
}
