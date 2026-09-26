// analyzer.js
// Motor de heurísticas 100% local. No hace llamadas a ningún servidor.
// Esto NO es verificación de hechos: son señales de superficie (lenguaje,
// estructura, presencia de autor y de enlaces a dominios reconocibles)
// combinadas en una estimación aproximada.

const SENSATIONAL_PATTERNS = [
  "no vas a creer", "no creerás", "lo que nadie te dice", "la verdad oculta",
  "esto cambiará tu vida", "impactante", "escandaloso", "alarmante",
  "urgente", "atención", "brutal", "devastador", "aterrador", "insólito",
  "increíble", "sorprendente", "viral", "extremo", "you won't believe",
  "shocking", "breaking", "exclusive", "secret they don't want you to know",
];

const ABSOLUTIST_PATTERNS = [
  "siempre", "nunca", "todos saben", "nadie puede negar", "sin ninguna duda",
  "es un hecho indiscutible", "definitivamente", "jamás", "100% seguro",
  "totalmente falso", "totalmente cierto", "everyone knows", "always", "never",
];

const RECOGNIZED_SOURCE_DOMAINS = [
  "who.int", "nih.gov", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
  "cdc.gov", "un.org", "europa.eu", "oecd.org", "worldbank.org",
  "nature.com", "sciencedirect.com", "thelancet.com", "bmj.com",
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "elpais.com",
  "nytimes.com", "doi.org", "jamanetwork.com",
  "sciencedirect.com", "springer.com", "gob.mx", "gov.uk", "wikipedia.org",
];

function countMatches(text, patterns) {
  const lower = text.toLowerCase();
  let count = 0;
  for (const p of patterns) {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const found = lower.match(re);
    if (found) count += found.length;
  }
  return count;
}

function countAllCapsWords(text) {
  const words = text.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) || [];
  return words.length;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function classifyLevel(count, mediumAt, highAt) {
  if (count >= highAt) return "Alta";
  if (count >= mediumAt) return "Media";
  return "Baja";
}

function analyzePage(pageData) {
  const { title, description, text, authorGuess, links, url } = pageData;
  const fullText = `${title} ${description || ""} ${text}`;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // --- Emotionality ---
  const sensationalHits = countMatches(fullText, SENSATIONAL_PATTERNS);
  const titleCaps = countAllCapsWords(title);
  const exclamations = (title.match(/!/g) || []).length + (fullText.match(/!/g) || []).length;
  const emoScore = sensationalHits * 2 + titleCaps * 2 + Math.min(exclamations, 10);
  const emoLevel = classifyLevel(emoScore, 3, 8);
  const emotionality = emoLevel === "Alta"
    ? "Alta / Sensacionalista"
    : emoLevel === "Media"
      ? "Media / Algo llamativa"
      : "Baja / Neutral";

  // --- Bias / absolutist language ---
  const absolutistHits = countMatches(fullText, ABSOLUTIST_PATTERNS);
  const biasLevel = classifyLevel(absolutistHits, 2, 5);
  const bias = biasLevel === "Alta"
    ? "Lenguaje muy absolutista"
    : biasLevel === "Media"
      ? "Algo de lenguaje absolutista"
      : "Lenguaje mayormente neutral";

  // --- Author ---
  const authorIdentified = Boolean(authorGuess && authorGuess.length > 1 && authorGuess.length < 80);

  // --- Recognized outbound sources ---
  const pageDomain = domainOf(url);
  const seen = new Set();
  const primarySources = [];
  for (const link of links) {
    const d = domainOf(link.href);
    if (!d || d === pageDomain || seen.has(d)) continue;
    const match = RECOGNIZED_SOURCE_DOMAINS.find((rd) => d === rd || d.endsWith(`.${rd}`));
    if (match) {
      seen.add(d);
      primarySources.push({ title: link.text || d, url: link.href, domain: d });
    }
  }

  // --- Overall score (0-100), purely heuristic ---
  let score = 55;
  score += Math.min(primarySources.length, 5) * 6; // up to +30
  score += authorIdentified ? 10 : -5;
  score -= emoLevel === "Alta" ? 20 : emoLevel === "Media" ? 8 : 0;
  score -= biasLevel === "Alta" ? 15 : biasLevel === "Media" ? 6 : 0;
  score -= wordCount < 150 ? 10 : 0;
  score = Math.max(5, Math.min(95, Math.round(score)));

  let verdict, verdictLabel;
  if (score >= 70) {
    verdict = "verde";
    verdictLabel = "Señales de fiabilidad favorables";
  } else if (score >= 40) {
    verdict = "amber";
    verdictLabel = "Requiere verificación adicional";
  } else {
    verdict = "rojo";
    verdictLabel = "Señales de baja fiabilidad";
  }

  const summaryParts = [];
  summaryParts.push(
    authorIdentified
      ? `Se identificó un autor (${authorGuess}).`
      : "No se identificó claramente un autor."
  );
  summaryParts.push(
    primarySources.length > 0
      ? `Se encontraron ${primarySources.length} enlace(s) a dominios generalmente reconocidos como fuentes fiables.`
      : "No se encontraron enlaces a dominios comúnmente reconocidos como fuentes primarias."
  );
  summaryParts.push(
    emoLevel === "Alta"
      ? "El lenguaje del título y el texto muestra rasgos sensacionalistas."
      : "El tono del lenguaje es mayormente moderado."
  );
  summaryParts.push("Esta es una estimación por patrones de texto, no una verificación de hechos.");

  return {
    score,
    verdict,
    verdictLabel,
    emotionality,
    bias,
    authorIdentified,
    authorName: authorIdentified ? authorGuess : null,
    primarySources,
    summary: summaryParts.join(" "),
  };
}
