// ai-engine.js
// Usa la IA integrada de Chrome (Prompt API / LanguageModel, modelo Gemini Nano).
// Corre 100% en el dispositivo del usuario. No requiere API key ni cobra por uso.
// Docs: https://developer.chrome.com/docs/ai/prompt-api

const AI_SYSTEM_INSTRUCTIONS = `Eres un asistente que evalúa artículos web. Se te dará el título, la descripción, un fragmento del texto y el autor detectado de una página. NO tienes acceso a internet, así que basa tu análisis únicamente en el texto entregado: su tono, su estructura, si cita fuentes o datos concretos, y si parece coherente y bien fundamentado.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni markdown, con este esquema exacto:
{
  "verdict": "verificada" | "cuestionable" | "no_verificada",
  "confidence": <entero 0-100, tu nivel de confianza en el propio análisis>,
  "emotionality": "<Baja|Media|Alta> / <calificativo breve>",
  "bias": "Neutral" | "Ligeramente sesgada" | "Sesgada",
  "author_identified": <true|false>,
  "author_name": "<nombre o null>",
  "primary_sources": [ { "title": "<fuente mencionada en el texto>", "url": null } ],
  "summary": "<2-3 frases en español resumiendo tu análisis>"
}`;

async function checkBuiltInAIAvailability() {
  if (!("LanguageModel" in self)) return "unsupported";
  try {
    return await LanguageModel.availability();
  } catch {
    return "unsupported";
  }
}

function buildAIPrompt(pageData) {
  return `${AI_SYSTEM_INSTRUCTIONS}

Título: ${pageData.title}
Descripción: ${pageData.description || "(sin descripción)"}
Autor detectado en el HTML (puede ser impreciso): ${pageData.authorGuess || "(no detectado)"}

Fragmento del texto visible de la página:
"""
${pageData.text.slice(0, 4000)}
"""`;
}

function mapVerdictToUI(aiVerdict) {
  if (aiVerdict === "verificada") return { verdict: "verde", verdictLabel: "IA: señales de fiabilidad favorables" };
  if (aiVerdict === "no_verificada") return { verdict: "rojo", verdictLabel: "IA: señales de baja fiabilidad" };
  return { verdict: "amber", verdictLabel: "IA: requiere verificación adicional" };
}

/**
 * Runs verification using Chrome's built-in AI. Returns the same shape
 * that analyzer.js produces, so it can be rendered with the same UI code.
 * onProgress(percent) is called during the one-time model download, if needed.
 */
async function verifyWithBuiltInAI(pageData, onProgress) {
  const availability = await checkBuiltInAIAvailability();

  if (availability === "unsupported") {
    throw new Error(
      "Tu navegador no tiene la IA integrada de Chrome (Prompt API). Necesitas Chrome 138 o más reciente. Puedes usar mientras tanto el 'Análisis con reglas'."
    );
  }
  if (availability === "unavailable") {
    throw new Error(
      "El modelo de IA integrado no está disponible en este dispositivo (puede requerir más espacio en disco o memoria)."
    );
  }

  let session;
  try {
    session = await LanguageModel.create({
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          if (onProgress) onProgress(Math.round((e.loaded || 0) * 100));
        });
      },
    });

    const raw = await session.prompt(buildAIPrompt(pageData));
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("La IA integrada no devolvió un resultado con el formato esperado. Intenta de nuevo.");
    }
    const parsed = JSON.parse(match[0]);
    const { verdict, verdictLabel } = mapVerdictToUI(parsed.verdict);

    return {
      score: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
      verdict,
      verdictLabel,
      emotionality: parsed.emotionality || "—",
      bias: parsed.bias || "—",
      authorIdentified: Boolean(parsed.author_identified),
      authorName: parsed.author_identified ? parsed.author_name : null,
      primarySources: Array.isArray(parsed.primary_sources) ? parsed.primary_sources : [],
      summary: parsed.summary || "Sin resumen disponible.",
    };
  } finally {
    session?.destroy();
  }
}
