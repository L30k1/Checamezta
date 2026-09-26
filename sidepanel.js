const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const modelSelect = document.getElementById("modelSelect");
const webSearchToggle = document.getElementById("webSearchToggle");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

const statusDot = document.querySelector("#statusRow .dot");
const statusText = document.getElementById("statusText");
const verifyBtn = document.getElementById("verifyBtn");
const resultArea = document.getElementById("resultArea");
const errorArea = document.getElementById("errorArea");

// ---------- Settings ----------

async function loadSettings() {
  const { apiKey, model, useWebSearch } = await chrome.storage.local.get([
    "apiKey", "model", "useWebSearch",
  ]);
  if (apiKey) apiKeyInput.value = apiKey;
  if (model) modelSelect.value = model;
  webSearchToggle.checked = useWebSearch !== false;
  if (!apiKey) settingsPanel.classList.remove("hidden");
}

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

saveSettingsBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    useWebSearch: webSearchToggle.checked,
  });
  settingsPanel.classList.add("hidden");
  setStatus("idle", "Listo");
});

// ---------- Status helpers ----------

function setStatus(kind, label) {
  statusDot.className = `dot dot-${kind}`;
  statusText.textContent = label;
}

function showError(message) {
  errorArea.textContent = message;
  errorArea.classList.remove("hidden");
  resultArea.classList.add("hidden");
}

function clearError() {
  errorArea.classList.add("hidden");
  errorArea.textContent = "";
}

// ---------- Page extraction ----------

function extractPageData() {
  const getMeta = (name) =>
    document.querySelector(`meta[name="${name}"]`)?.content ||
    document.querySelector(`meta[property="${name}"]`)?.content ||
    null;

  const authorGuess =
    getMeta("author") ||
    document.querySelector('[rel="author"]')?.textContent?.trim() ||
    document.querySelector(".author, .byline, [class*='author-name']")?.textContent?.trim() ||
    null;

  const rawText = document.body?.innerText || "";

  return {
    url: location.href,
    title: document.title,
    description: getMeta("description") || getMeta("og:description"),
    authorGuess,
    text: rawText.replace(/\s+/g, " ").trim().slice(0, 9000),
  };
}

async function getActivePageData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No se pudo acceder a la pestaña activa.");
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageData,
  });
  return result;
}

// ---------- Claude API call ----------

const SYSTEM_PROMPT = `Eres un asistente de verificación de fuentes. Recibirás el título, URL, descripción y texto visible de una página web. Tu tarea:
1. Si tienes la herramienta de búsqueda web disponible, úsala para contrastar las afirmaciones más relevantes del texto con fuentes independientes y fiables antes de emitir un veredicto.
2. Evalúa la fiabilidad general, el tono emocional/sensacionalista, y si el contenido muestra sesgo.
3. Identifica si hay un autor claramente atribuido y localiza fuentes primarias citadas o verificables (estudios, organismos oficiales, informes) relacionadas con el contenido.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, con este esquema exacto:
{
  "verdict": "verificada" | "cuestionable" | "no_verificada",
  "confidence": <entero 0-100>,
  "emotionality": "<Baja|Media|Alta> / <calificativo breve, ej. Sensacionalista o Neutral>",
  "bias": "Neutral" | "Ligeramente sesgada" | "Sesgada",
  "author_identified": <true|false>,
  "author_name": "<nombre o null>",
  "primary_sources": [ { "title": "<título breve>", "url": "<url o null>" } ],
  "summary": "<2-3 frases en español explicando el análisis integrado>"
}`;

async function callClaude(pageData) {
  const { apiKey, model, useWebSearch } = await chrome.storage.local.get([
    "apiKey", "model", "useWebSearch",
  ]);

  if (!apiKey) {
    throw new Error("Falta tu API key de Anthropic. Ábrela desde el ícono de configuración (⚙) arriba.");
  }

  const userContent = `Título: ${pageData.title}
URL: ${pageData.url}
Descripción: ${pageData.description || "(sin descripción)"}
Autor detectado en el HTML (puede ser impreciso): ${pageData.authorGuess || "(no detectado)"}

Contenido visible de la página (truncado):
"""
${pageData.text}
"""`;

  const body = {
    model: model || "claude-sonnet-5",
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  };

  if (useWebSearch !== false) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("API key inválida o revocada. Revísala en configuración.");
    }
    throw new Error(`Error de la API de Anthropic (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlocks = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const cleaned = textBlocks.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("La IA no devolvió un resultado con el formato esperado.");
  }
  return JSON.parse(jsonMatch[0]);
}

// ---------- Render ----------

const VERDICT_META = {
  verificada: { label: "Fuente verificada", color: "green", icon: "check" },
  cuestionable: { label: "Fuente cuestionable", color: "amber", icon: "warn" },
  no_verificada: { label: "No verificada", color: "red", icon: "x" },
};

function iconSvg(kind) {
  if (kind === "check") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg>`;
  }
  if (kind === "warn") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v4M12 17h.01M10.3 3.9L2.7 18a1.5 1.5 0 001.3 2.2h16a1.5 1.5 0 001.3-2.2L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>`;
  }
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
}

function renderResult(result) {
  const meta = VERDICT_META[result.verdict] || VERDICT_META.no_verificada;

  const verdictCard = document.getElementById("verdictCard");
  verdictCard.style.borderColor =
    meta.color === "green" ? "rgba(34,197,94,0.35)" :
    meta.color === "amber" ? "rgba(180,140,20,0.35)" : "rgba(239,68,68,0.35)";

  const icon = document.getElementById("verdictIcon");
  icon.innerHTML = iconSvg(meta.icon);
  icon.style.background =
    meta.color === "green" ? "rgba(34,197,94,0.12)" :
    meta.color === "amber" ? "rgba(180,140,20,0.18)" : "rgba(239,68,68,0.14)";
  icon.style.color =
    meta.color === "green" ? "#22C55E" :
    meta.color === "amber" ? "#E3B34B" : "#EF4444";

  document.getElementById("verdictLabel").textContent = meta.label.toUpperCase();
  const confidence = Math.max(0, Math.min(100, Number(result.confidence) || 0));
  document.getElementById("verdictConfidence").textContent = `${confidence}% Confianza`;
  const fill = document.getElementById("confidenceFill");
  fill.style.width = `${confidence}%`;
  fill.style.background =
    meta.color === "green" ? "#22C55E" :
    meta.color === "amber" ? "#E3B34B" : "#EF4444";

  document.getElementById("emotionalityValue").textContent = result.emotionality || "—";
  document.getElementById("biasValue").textContent = result.bias || "—";

  document.getElementById("authorValue").textContent = result.author_identified
    ? (result.author_name || "Identificado")
    : "No identificado";

  const sources = Array.isArray(result.primary_sources) ? result.primary_sources : [];
  document.getElementById("sourcesCountValue").textContent =
    sources.length > 0 ? `${sources.length} detectada${sources.length === 1 ? "" : "s"}` : "0 detectadas";

  document.getElementById("analysisText").textContent = result.summary || "Sin resumen disponible.";

  const list = document.getElementById("sourcesList");
  list.innerHTML = "";
  if (sources.length === 0) {
    list.innerHTML = `<li class="sources-empty">No se encontraron fuentes primarias claras.</li>`;
  } else {
    for (const src of sources) {
      const li = document.createElement("li");
      if (src.url) {
        li.innerHTML = `<a href="${src.url}" target="_blank" rel="noopener">${src.title || src.url} ↗</a>`;
      } else {
        li.innerHTML = `<span>${src.title || "Fuente sin enlace"}</span>`;
      }
      list.appendChild(li);
    }
  }

  resultArea.classList.remove("hidden");
}

// ---------- Main action ----------

verifyBtn.addEventListener("click", async () => {
  clearError();
  resultArea.classList.add("hidden");
  verifyBtn.disabled = true;
  setStatus("busy", "Analizando…");

  try {
    const pageData = await getActivePageData();
    const result = await callClaude(pageData);
    renderResult(result);
    setStatus("idle", "Listo");
  } catch (err) {
    console.error(err);
    showError(err.message || "Ocurrió un error inesperado.");
    setStatus("error", "Error");
  } finally {
    verifyBtn.disabled = false;
  }
});

loadSettings();
setStatus("idle", "Listo");
