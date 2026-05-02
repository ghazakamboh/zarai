import { GoogleGenAI } from "@google/genai";

// Internal helper for lazy initialization
let genAIInstance: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAIInstance) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    console.log("API KEY present:", !!apiKey, "value starts with:", apiKey?.substring(0, 8));
    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY not set in environment variables.");
    }
    genAIInstance = new GoogleGenAI({ apiKey });
  }
  return genAIInstance;
}

export async function analyzeAgriculturalImage(base64: string) {
  const ai = getGenAI();
  // Remove data:image/jpeg;base64, prefix if present
  const base64String = base64.includes(',') ? base64.split(',')[1] : base64;

  // RULE 10: Exact structure for multimodal call
  // @ts-ignore
  const response = await (ai as any).models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: base64String, mimeType: "image/jpeg" } },
        { text: "You are an expert Pakistani agricultural advisor. Analyze this crop/field image and give a SHORT, clean response. No markdown, no ### headers, no ** bold symbols. Write in plain text only. Cover: crop type, health status, moisture condition, and one key action needed. Keep total response under 150 words paragraph in Roman Urdu." }
      ]
    }]
  });
  
  // RULE 11: response.text is a property
  return response.text;
}

export async function chatWithExpert(history: { role: 'user' | 'model', parts: { text: string }[] }[], userMessage: string, scanContext: string) {
  const ai = getGenAI();
  // @ts-ignore
  const response = await (ai as any).models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [{ text: `System instruction: You are Zar'ai Mahir, a friendly Pakistani farming expert who talks like an older brother. STRICT RULES: No markdown. No ### headers. No ** symbols. No bullet points. Write in plain conversational text only. Keep replies short — maximum 4 sentences. Match the user's language exactly. If they write Roman Urdu, reply only in Roman Urdu. If English, reply in English. Never switch languages mid-reply. Never mention that you are reading a report or referencing context. Just talk naturally like a friend.` }]
      },
      ...history,
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ]
  });
  
  return response.text;
}
