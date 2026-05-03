import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyBaXrwyvYrgl5AificQRUGw03ze9DBKG_E";
const genAI = new GoogleGenerativeAI(API_KEY);

export async function analyzeAgriculturalImage(base64: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const base64String = base64.includes(',') ? base64.split(',')[1] : base64;
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64String,
          mimeType: "image/jpeg"
        }
      },
      "You are an expert agricultural consultant for Pakistani farmers. Analyze this crop/field image. Identify: 1) Crop type 2) Visible diseases or pest damage 3) Soil and moisture condition 4) Immediate action required. Write in plain text only, no markdown, no symbols. One paragraph English then one paragraph Roman Urdu."
    ]);
    const response = await result.response;
    return response.text();
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
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: `You are Zar'ai Mahir, a friendly Pakistani farming expert. ${scanContext ? `Crop analysis: ${scanContext}` : 'Give general farming advice.'} Reply in same language as user. Max 3 sentences. No markdown.`
    });
    const chat = model.startChat({ 
      history: history.map(h => ({
        role: h.role,
        parts: h.parts.map(p => ({ text: p.text }))
      }))
    });
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Chat Error:", error);
    return "Maafi bhai, thodi der mein dobara poochein.";
  }
}
