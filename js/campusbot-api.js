

const CampusBotAPI = (function () {
  const OUT_OF_SCOPE_MESSAGE = "I am AI chatbot that will help only related to Aklan Catholic College.";

  // Out of domain patterns (general knowledge, politics, coding, games, etc.)
  const OUT_OF_DOMAIN_PATTERNS = [
    /\b(who is (the )?president|prime minister|senator|governor|mayor of|congressman|politics|election)\b/i,
    /\b(code a|write (a )?code|write (a )?program|python script|javascript code|html code|create a game|hack|minecraft|roblox|valorant)\b/i,
    /\b(capital of|weather in|recipe for|cook|lyrics to|movie review|tell me a joke|horoscope|crypto|bitcoin)\b/i,
    /\b(solve this math|calculus derivative|quantum physics)\b/i
  ];

  /**
   * Check if a query is clearly outside the scope of Aklan Catholic College
   */
  function isOutOfDomain(query) {
    const q = query.trim().toLowerCase();
    for (const pattern of OUT_OF_DOMAIN_PATTERNS) {
      if (pattern.test(q)) {
        // Exception: if specifically asking about ACC's School President
        if (q.includes("acc president") || q.includes("college president") || q.includes("president of acc") || q.includes("school president") || q.includes("rector")) {
          return false;
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Builds the comprehensive school knowledge context string from Firestore DATA
   */
  function buildRAGContext() {
    const data = window.DATA || window.DEFAULTS || {};
    const schoolName = (data.school && data.school.name) || "Aklan Catholic College";
    const parts = [];

    parts.push(`=== INSTITUTION ===\nSchool Name: ${schoolName}\nMotto: Peace and Goodness\nCollege President: Rev. Fr. Emmanuel C. Mijares\nLocation: Kalibo, Aklan, Philippines`);

    // Website operation guide
    parts.push(`=== WEBSITE OVERVIEW & HOW THE WEBSITE WORKS ===
- System Name: CampusBot AI & Official Student Information Portal.
- Unified Access: Students, Staff, and Super Admins sign in or register with their school email and password.
- Student Dashboard: Displays real-time Campus Announcements at the top, a Quick Information panel with Office Directory, Campus Map, FAQs, and a direct 'Contact School Staff' button to submit inquiries.
- Floating Assistant Widget: Available on the bottom right corner for instant answers.
- Real-time Updates: All announcements, directory entries, campus map facilities, and FAQs added by Staff or Super Admin reflect instantly.`);

    // Enrollment guide
    parts.push(`=== ENROLLMENT & ADMISSIONS GUIDE ===
- Enrollment Steps:
  1. Application & Submission: Submit Form 138 / Report Card, PSA Birth Certificate, and Certificate of Good Moral Character to the Admissions Office (Admin Building, 1st Floor).
  2. Assessment of Fees: Proceed to the Accounting Office (Admin Building, Ground Floor) to get fee assessments.
  3. Payment: Pay registration fees / tuition at the Cashier window and keep the Official Receipt (OR).
  4. Subject Loading & Verification: Present the receipt to the Registrar's Office (Admin Building, Ground Floor) to finalize subject loading and obtain your Certificate of Matriculation (COM).
- Office Hours for Admissions & Registrar: Monday to Friday, 8:00 AM – 5:00 PM.`);

    // Rules and Regulations
    parts.push(`=== ACC SCHOOL RULES & REGULATIONS ===
- Student Identification (ID): Students must wear their official ACC ID and prescribed lanyard visibly at all times upon entering and while inside the school premises. No ID, No Entry policy strictly enforced.
- Uniform Policy: Prescribed uniform must be worn Monday through Thursday. Modest casual attire is permitted on designated wash days (shorts, sleeveless tops, and shredded jeans are prohibited).
- Attendance: Students must maintain at least 80% class attendance. Exceeding 20% unexcused absences may result in a Forced Dropped mark (FDA).
- Conduct & Values: ACC upholds Catholic values. Bullying, harassment, vaping, smoking, alcoholic beverages, and gambling on campus premises are strictly prohibited.
- Exam Permits: A valid examination permit issued by the Accounting Office is required during major term examinations (Prelims, Midterms, and Finals).`);

    // 1. Frequently Asked Questions
    if (Array.isArray(data.faqs) && data.faqs.length) {
      const faqList = data.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
      parts.push(`=== FREQUENTLY ASKED QUESTIONS (FAQS) ===\n${faqList}`);
    }

    // 2. Live Announcements
    if (Array.isArray(data.announcements) && data.announcements.length) {
      const annList = data.announcements.map(a => `- [${a.date}] ${a.title}`).join('\n');
      parts.push(`=== OFFICIAL CAMPUS ANNOUNCEMENTS ===\n${annList}`);
    }

    // 3. Office Directory
    if (Array.isArray(data.offices) && data.offices.length) {
      const officeList = data.offices.map(o => `- ${o.name}: Located at ${o.location}. Hours: ${o.hours}. Contact: ${o.contact}`).join('\n');
      parts.push(`=== OFFICE DIRECTORY ===\n${officeList}`);
    }

    // 4. Campus Map & Buildings
    if (Array.isArray(data.mapPlaces) && data.mapPlaces.length) {
      const mapList = data.mapPlaces.map(m => `- ${m.building}: ${m.description}`).join('\n');
      parts.push(`=== CAMPUS MAP & BUILDINGS ===\n${mapList}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Helper to format markdown text from LLM to clean HTML
   */
  function formatMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/^[-*]\s+(.*)$/gm, '• $1')
      .replace(/\n\n+/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  async function callGroqAI(question, context) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, context: context })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API failed');
  return data.answer;
}

  function localRAGFallback(query) {
    const qLower = query.toLowerCase().trim();
    const data = window.DATA || window.DEFAULTS || {};
    const schoolName = (data.school && data.school.name) || "Aklan Catholic College";

    // 0. Friendly Greetings & Conversational Queries
    if (/^(hi|hello|hey|good\s*(morning|afternoon|evening|day)|kamusta|hola|sup|greetings)\b/i.test(qLower)) {
      return {
        reply: `Peace and Goodness! 💙 I'm <b>CampusBot AI</b>, your official digital assistant for <b>${schoolName}</b>. How may I assist you today? You can ask me about academic programs, campus locations, office directory, enrollment steps, announcements, or rules!`,
        source: "CampusBot AI Greeting"
      };
    }

    if (qLower === "help" || qLower.includes("what can you do") || qLower.includes("how does this work") || qLower.includes("who are you")) {
      return {
        reply: `I am <b>CampusBot AI</b>, the official virtual assistant for <b>${schoolName}</b>. I can provide verified information on:<br>` +
               `• <b>Academic Programs:</b> College degrees & Senior High strands<br>` +
               `• <b>Campus Locations:</b> Main Campus (Kalibo) & Mabasa Campus (Andagao)<br>` +
               `• <b>Office Directory:</b> Registrar, Admissions, Guidance, Cashier<br>` +
               `• <b>Enrollment Guide:</b> 4-step admission & registration procedure<br>` +
               `• <b>Rules & Regulations:</b> Uniform, conduct<br>` +
               `• <b>Campus Announcements:</b> Official news & academic updates`,
        source: "CampusBot Assistant Guide"
      };
    }

    if (qLower.includes("motto") || qLower.includes("vision") || qLower.includes("mission")) {
      return {
        reply: `The official motto of <b>${schoolName}</b> is <b>"Pro Deo et Patria"</b> (<i>Pax et Bonum</i>). ACC is dedicated to holistic Catholic education and academic excellence.`,
        source: "Institutional Identity"
      };
    }

    // 1. FAQs Token & Semantic Matching
    if (Array.isArray(data.faqs) && data.faqs.length) {
      const qCleanTokens = qLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      let bestFaq = null;
      let highestScore = 0;

      for (const faq of data.faqs) {
        const textToSearch = (faq.question + " " + (faq.keywords || "")).toLowerCase();
        let score = 0;
        for (const token of qCleanTokens) {
          if (textToSearch.includes(token)) score += 2;
        }
        // Exact substring match in question gives bonus
        if (faq.question.toLowerCase().includes(qLower) || qLower.includes(faq.question.toLowerCase())) {
          score += 10;
        }
        if (score > highestScore) {
          highestScore = score;
          bestFaq = faq;
        }
      }

      // Strong FAQ match threshold
      if (bestFaq && highestScore >= 4) {
        return { reply: bestFaq.answer, source: `FAQ: ${bestFaq.question}` };
      }
    }

    // 2. Specific Office Inquiries (Checked BEFORE general enrollment to prevent intercepting Admissions Office)
    if (Array.isArray(data.offices) && data.offices.length) {
      const isOfficeQuery = qLower.includes("office") || qLower.includes("where is") || qLower.includes("hours") || qLower.includes("contact") || qLower.includes("location");
      
      for (const off of data.offices) {
        const nameLower = off.name.toLowerCase();
        const baseWord = nameLower.replace(/['’]s|office/gi, '').trim();
        const words = baseWord.split(/[\s&/]+/).filter(w => w.length > 2);
        
        let match = false;
        if (qLower.includes(nameLower)) match = true;
        for (const w of words) {
          if (qLower.includes(w) && (isOfficeQuery || w.length > 4)) match = true;
        }

        if (match) {
          return {
            reply: `<b>${off.name}</b><br>` +
                   `• <b>Location:</b> ${off.location}<br>` +
                   `• <b>Operating Hours:</b> ${off.hours}<br>` +
                   `• <b>Contact:</b> ${off.contact}`,
            source: "Office Directory"
          };
        }
      }

      if (qLower === "office" || qLower === "offices" || qLower.includes("office directory") || qLower.includes("directory")) {
        if (!data.offices.length) {
          return {
            reply: `No offices have been posted to the directory yet.`,
            source: "Office Directory"
          };
        }
        const list = data.offices.map(o => `• <b>${o.name}:</b> ${o.location} (${o.hours}) · <i>${o.contact}</i>`).join('<br><br>');
        return {
          reply: `<b>Official Office Directory — ${schoolName}:</b><br><br>${list}`,
          source: "Office Directory"
        };
      }
    } else if (qLower === "office" || qLower === "offices" || qLower.includes("office directory") || qLower.includes("directory")) {
      return {
        reply: `No offices have been posted to the directory yet.`,
        source: "Office Directory"
      };
    }

    // 3. Campus Map & Specific Buildings (Fixed missing mapPlaces bug!)
    if (Array.isArray(data.mapPlaces) && data.mapPlaces.length) {
      for (const m of data.mapPlaces) {
        const bLower = m.building.toLowerCase();
        const words = bLower.replace(/building|main|acc/gi, '').trim().split(/[\s&/]+/).filter(w => w.length > 2);
        let match = false;
        if (qLower.includes(bLower)) match = true;
        for (const w of words) {
          if (qLower.includes(w)) match = true;
        }
        if (match) {
          return {
            reply: `📍 <b>${m.building}</b><br>${m.description}`,
            source: "Campus Map & Facilities"
          };
        }
      }

      if (qLower.includes("map") || qLower.includes("building") || qLower.includes("facility") || qLower.includes("facilities")) {
        if (!data.mapPlaces.length) {
          return {
            reply: `No campus facilities or map locations have been posted yet.`,
            source: "Campus Map"
          };
        }
        const list = data.mapPlaces.map(m => `📍 <b>${m.building}:</b> ${m.description}`).join('<br><br>');
        return {
          reply: `<b>Campus Facilities & Buildings Map:</b><br><br>${list}`,
          source: "Campus Map"
        };
      }
    } else if (qLower.includes("map") || qLower.includes("building") || qLower.includes("facility") || qLower.includes("facilities")) {
      return {
        reply: `No campus facilities or map locations have been posted yet.`,
        source: "Campus Map"
      };
    }

    // 4. Announcements & Campus Bulletin
    if (qLower.includes("announcement") || qLower.includes("news") || qLower.includes("event") || qLower.includes("bulletin") || qLower.includes("update")) {
      if (!data.announcements || !data.announcements.length) {
        return { reply: "There are currently no active announcements on the bulletin board.", source: "Campus Bulletin" };
      }
      const list = data.announcements.map(a => `• <b>[${a.date}]</b> ${a.title}`).join('<br>');
      return { reply: `<b>Current Campus Announcements:</b><br><br>${list}`, source: "Campus Bulletin" };
    }

    // 5. Enrollment Fallback
    if (qLower.includes("enroll") || qLower.includes("admission") || qLower.includes("register") || qLower.includes("requirements")) {
      return {
        reply: `<b>Enrollment Guide for Aklan Catholic College:</b><br>` +
               `1. Submit Form 138/Report Card, PSA Birth Certificate, and Certificate of Good Moral to Admissions (Admin Bldg, 1st Floor).<br>` +
               `2. Get fee assessment at the Accounting Office (Ground Floor).<br>` +
               `3. Pay at the Cashier window and keep your Official Receipt.<br>` +
               `4. Complete registration and subject loading at the Registrar's Office.`,
        source: "Admissions & Enrollment Guide"
      };
    }

    // 6. Rules & Regulations Fallback
    if (qLower.includes("rule") || qLower.includes("policy") || qLower.includes("uniform") || qLower.includes("dress code") || qLower.includes("id policy")) {
      return {
        reply: `<b>ACC Key School Rules & Policies:</b><br>` +
               `• <b>ID Policy:</b> Official ID and lanyard must be worn visibly at all times (No ID, No Entry).<br>` +
               `• <b>Uniform:</b> Prescribed uniform from Monday to Thursday. Modest casual attire on wash day.<br>` +
               `• <b>Attendance:</b> Minimum 80% attendance required to avoid FDA status.<br>` +
               `• <b>Conduct:</b> Vaping, smoking, bullying, and gambling are strictly prohibited.`,
        source: "School Rules & Regulations"
      };
    }

    // 11. Fallback when question is within scope of ACC but exact match not indexed
    return {
      reply: `I am sorry, I do not have that specific information in my records for <b>${schoolName}</b> yet. You can submit your question directly to the school administration using the <b>Contact Staff</b> button below.`,
      noMatch: true
    };
  }

  /**
   * Main Public Query Handler
   */
  async function ask(question) {
    const cleanQuery = (question || "").trim();
    if (!cleanQuery) {
      return { reply: "Please enter a question about Aklan Catholic College.", noMatch: true };
    }

    // 1. Strict Domain Guard: filter out external questions
    if (isOutOfDomain(cleanQuery)) {
      return {
        reply: OUT_OF_SCOPE_MESSAGE,
        source: "Scope Enforcement Policy",
        noMatch: false
      };
    }

    const context = buildRAGContext();

    // 2. Try Groq AI API first
    try {
      const aiReply = await callGroqAI(cleanQuery, context);
      return {
        reply: aiReply,
        source: "CampusBot AI (Groq Qwen Engine)",
        noMatch: aiReply.includes(OUT_OF_SCOPE_MESSAGE) || aiReply.toLowerCase().includes("contact staff")
      };
    } catch (err) {
      if (err.message !== "NO_API_KEY") {
        console.info("Groq API notice, using localized RAG engine:", err.message);
      }
      // 3. Fallback to Localized Firestore RAG
      return localRAGFallback(cleanQuery);
    }
  }

  return {
    ask: ask,
    buildRAGContext: buildRAGContext,
    isOutOfDomain: isOutOfDomain,
    OUT_OF_SCOPE_MESSAGE: OUT_OF_SCOPE_MESSAGE
  };
})();

// Attach to window for global access
window.CampusBotAPI = CampusBotAPI;
