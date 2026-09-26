# VeriSource AI — extensión de Chrome

Analiza con IA la fiabilidad, el sesgo y el tono emocional de cualquier página, usando tu propia API key de Anthropic (Claude), con búsqueda web activada para contrastar datos.

## Instalación (modo desarrollador)

1. Descomprime esta carpeta en tu equipo.
2. Abre Chrome (o Edge/Brave) y ve a `chrome://extensions`.
3. Activa **"Modo de desarrollador"** (interruptor arriba a la derecha).
4. Haz clic en **"Cargar descomprimida"** y selecciona la carpeta `verisource-extension`.
5. Fija la extensión en la barra (ícono del pin) para acceder rápido.

## Configurar tu API key

1. Consigue una API key en https://console.anthropic.com (sección "API Keys").
2. Haz clic en el ícono de la extensión → se abre el panel lateral.
3. Pulsa el ícono de engranaje (⚙) arriba a la derecha.
4. Pega tu API key, elige el modelo y guarda.

La key se guarda solo en tu navegador (`chrome.storage.local`) y se envía directamente a la API de Anthropic al pulsar "Verificar esta fuente" — no pasa por ningún servidor intermedio.

## Uso

1. Abre cualquier artículo o página que quieras evaluar.
2. Abre el panel lateral de VeriSource AI.
3. Pulsa **"Verificar esta fuente"**.
4. La extensión toma el título, la URL, la descripción y el texto visible de la página, se lo envía a Claude (con búsqueda web para contrastar afirmaciones) y muestra:
   - Veredicto final y nivel de confianza
   - Emocionalidad y sesgo detectados
   - Si hay un autor identificado
   - Fuentes primarias encontradas, con enlaces
   - Un resumen del análisis integrado

## Importante

- Esto es una **evaluación heurística generada por IA**, no un fact-checking certificado. Úsala como punto de partida, no como veredicto final.
- El análisis consume tokens de tu cuenta de Anthropic (se factura según tu plan/API key).
- Si activas la búsqueda web (recomendado, activada por defecto), el modelo puede tardar unos segundos más en responder.
- Puedes cambiar entre Claude Sonnet 5 (más preciso) y Claude Haiku 4.5 (más rápido/económico) en configuración.

## Archivos del proyecto

- `manifest.json` — configuración de la extensión (Manifest V3)
- `background.js` — abre el panel lateral al hacer clic en el ícono
- `sidepanel.html` / `sidepanel.css` / `sidepanel.js` — interfaz y lógica de análisis
