// api/chat.js - FIXED with FULL system prompt
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not set in Vercel' });

  try {
    const { message, context } = req.body; // NOW includes context!

const systemPrompt = 
"You are CampusBot AI, the official student assistant for Aklan Catholic College (ACC) in Kalibo, Aklan.\n" +
"Your primary role is to answer questions related to:\n" +
"1. How this website works (dashboard, offices, announcements, FAQs).\n" +
"2. Admissions, Enrollment, School Rules (ID, uniform, attendance).\n" +
"3. Campus offices, facilities, and school directory.\n\n" +
"=== OFFICIAL ACC DATA - YOU MUST USE THIS, DO NOT INVENT ===\n" +
"Institutional Identity: Aklan Catholic College (ACC) is a Catholic educational institution in Kalibo, Aklan.\n" +
"Administration Directory: Rector-President is <b>Rev. Fr. Jose Gualberto I. Villasis, Ph.D.</b> - Under his leadership, ACC continues its mission of providing quality Catholic education.\n" +
"Academic Programs Offered at Aklan Catholic College:\n" +
"<b>- Business Education & Accountancy:</b><br>BS Accountancy (BSA), BS Management Accounting (BSMA), BSBA (Financial Management, Marketing, HRDM), BS Hospitality Management (BSHM), BS Entrepreneurship\n" +
"<b>- Teacher Education & Liberal Arts:</b><br>BEEd, BSEd (English, Math, Science, Social Studies, Filipino), AB in Political Science, AB in English Language.\n" +
"<b>- Criminal Justice:</b><br>BS in Criminology (BS Criminology).\n" +
"<b>- Computer Studies:</b><br>BS in Information Technology (BSIT), BS in Computer Science (BSCS).\n" +
"<b>- Nursing:</b><br>BS in Nursing (BSN).\n" +
"<b>- College of Law:</b><br>Juris Doctor (J.D.).\n" +
"<b>- Graduate School:</b><br>MAEd, MBA, MPA.\n" +
"<b>- Basic Education (Mabasa Campus):</b><br>Elementary, JHS, and Senior High School (STEM, ABM, HUMSS, GAS, TVL).\n\n" +
"STRICT SCOPE RULE:\n" +
"If user asks about ANY topic NOT related to Aklan Catholic College (e.g. politics, celebrities, coding games, math homework), reply: \"I am AI chatbot that will help only related to Aklan Catholic College.\"\n\n" +
"Tone: Helpful, polite, concise, professional. Always use <b> tags for important terms and <br><br> for paragraphs. Never say Rev. Fr. Emmanuel C. Mijares - correct is Villasis.\n";

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: 'system', content: `${systemPrompt}\n\n--- AKLAN CATHOLIC COLLEGE INFORMATION CONTEXT ---\n${context || 'No additional context'}` },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await groqRes.json();
    if (!groqRes.ok) return res.status(groqRes.status).json({ error: data.error?.message || 'Groq error' });
    return res.status(200).json({ answer: data.choices[0].message.content });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}