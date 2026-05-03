const API_KEY = "AIzaSyCO8scW-C1ssVO-oCcLZuJSISH2wZ4a5ug";

export async function analyzeAgriculturalImage(base64: string): Promise<string> {
  const base64String = base64.includes(',') ? base64.split(',')[1] : base64;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64String } },
            { text: 'You are an expert agricultural consultant for Pakistani farmers. Analyze this crop/field image. Identify: 1) Crop type 2) Visible diseases or pest damage 3) Soil and moisture condition 4) Immediate action required. Write in plain text only, no markdown. One paragraph English then one paragraph Roman Urdu.' }
          ]
        }]
      })
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.candidates[0].content.parts[0].text;
}

export async function chatWithExpert(
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  userMessage: string,
  scanContext?: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: `You are Zar'ai Mahir, a friendly Pakistani farming expert. ${scanContext ? `Crop analysis: ${scanContext}` : 'Give general farming advice.'} Reply in same language as user. Max 3 sentences. No markdown.` }]
        },
        contents: [
          ...history,
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      })
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.candidates[0].content.parts[0].text;
}
