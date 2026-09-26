const statusDot = document.querySelector("#statusRow .dot");
const statusText = document.getElementById("statusText");
const verifyBtn = document.getElementById("verifyBtn");
const aiVerifyBtn = document.getElementById("aiVerifyBtn");
const resultArea = document.getElementById("resultArea");
const errorArea = document.getElementById("errorArea");
const engineTag = document.getElementById("engineTag");

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

// ---------- Page extraction (runs inside the target page) ----------

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

  const links = Array.from(document.querySelectorAll("a[href]"))
    .slice(0, 500)
    .map((a) => ({ href: a.href, text: a.textContent.trim().slice(0, 80) }))
    .filter((l) => l.href.startsWith("http"));

  return {
    url: location.href,
    title: document.title,
    description: getMeta("description") || getMeta("og:description"),
    authorGuess,
    text: rawText.replace(/\s+/g, " ").trim().slice(0, 20000),
    links,
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

// ---------- Render ----------

const VERDICT_COLORS = {
  verde: { border: "rgba(34,197,94,0.35)", iconBg: "rgba(34,197,94,0.12)", iconColor: "#22C55E", fill: "#22C55E" },
  amber: { border: "rgba(180,140,20,0.35)", iconBg: "rgba(180,140,20,0.18)", iconColor: "#E3B34B", fill: "#E3B34B" },
  rojo: { border: "rgba(239,68,68,0.35)", iconBg: "rgba(239,68,68,0.14)", iconColor: "#EF4444", fill: "#EF4444" },
};

function iconSvg(kind) {
  if (kind === "verde") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg>`;
  }
  if (kind === "amber") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v4M12 17h.01M10.3 3.9L2.7 18a1.5 1.5 0 001.3 2.2h16a1.5 1.5 0 001.3-2.2L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>`;
  }
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
}

function renderResult(result, engineLabel) {
  if (engineLabel) {
    engineTag.textContent = engineLabel;
    engineTag.classList.remove("hidden");
  } else {
    engineTag.classList.add("hidden");
  }
  const colors = VERDICT_COLORS[result.verdict] || VERDICT_COLORS.amber;

  document.getElementById("verdictCard").style.borderColor = colors.border;

  const icon = document.getElementById("verdictIcon");
  icon.innerHTML = iconSvg(result.verdict);
  icon.style.background = colors.iconBg;
  icon.style.color = colors.iconColor;

  document.getElementById("verdictLabel").textContent = result.verdictLabel.toUpperCase();
  document.getElementById("verdictConfidence").textContent = `Puntuación estimada: ${result.score}/100`;

  const fill = document.getElementById("confidenceFill");
  fill.style.width = `${result.score}%`;
  fill.style.background = colors.fill;

  document.getElementById("emotionalityValue").textContent = result.emotionality;
  document.getElementById("biasValue").textContent = result.bias;
  document.getElementById("authorValue").textContent = result.authorIdentified
    ? result.authorName
    : "No identificado";

  const count = result.primarySources.length;
  document.getElementById("sourcesCountValue").textContent =
    count > 0 ? `${count} detectada${count === 1 ? "" : "s"}` : "0 detectadas";

  document.getElementById("analysisText").textContent = result.summary;

  const list = document.getElementById("sourcesList");
  list.innerHTML = "";
  if (count === 0) {
    list.innerHTML = `<li class="sources-empty">No se encontraron enlaces a dominios comúnmente reconocidos como fuentes primarias.</li>`;
  } else {
    for (const src of result.primarySources) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${src.url}" target="_blank" rel="noopener">${src.title || src.domain} ↗</a>`;
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
  aiVerifyBtn.disabled = true;
  setStatus("busy", "Analizando…");

  try {
    const pageData = await getActivePageData();
    const result = analyzePage(pageData); // defined in analyzer.js, fully local
    renderResult(result, "Motor: reglas locales (instantáneo, sin IA generativa)");
    setStatus("idle", "Listo");
  } catch (err) {
    console.error(err);
    showError(err.message || "Ocurrió un error inesperado.");
    setStatus("error", "Error");
  } finally {
    verifyBtn.disabled = false;
    aiVerifyBtn.disabled = false;
  }
});

aiVerifyBtn.addEventListener("click", async () => {
  clearError();
  resultArea.classList.add("hidden");
  verifyBtn.disabled = true;
  aiVerifyBtn.disabled = true;
  setStatus("busy", "Verificando con IA…");

  try {
    const pageData = await getActivePageData();
    const result = await verifyWithBuiltInAI(pageData, (percent) => {
      setStatus("busy", `Descargando modelo de IA… ${percent}%`);
    });
    renderResult(result, "Motor: IA integrada de Chrome (Gemini Nano, en tu dispositivo)");
    setStatus("idle", "Listo");
  } catch (err) {
    console.error(err);
    showError(err.message || "Ocurrió un error inesperado con la IA integrada.");
    setStatus("error", "Error");
  } finally {
    verifyBtn.disabled = false;
    aiVerifyBtn.disabled = false;
  }
});

setStatus("idle", "Listo");
