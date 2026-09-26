# VeriSource AI (Local) — extensión de Chrome

Versión 100% local: sin API keys, sin costos, sin enviar ningún dato a servidores externos. Todo el análisis corre en tu propio navegador con un motor de heurísticas en JavaScript.

## Instalación (modo desarrollador)

1. Descomprime esta carpeta en tu equipo.
2. Ve a `chrome://extensions`.
3. Activa **"Modo de desarrollador"** (arriba a la derecha).
4. Haz clic en **"Cargar descomprimida"** y selecciona la carpeta `verisource-extension`.
5. Fija la extensión en la barra para acceder rápido.

## Uso

1. Abre cualquier página o artículo.
2. Abre el panel lateral de VeriSource AI.
3. Pulsa **"Analizar esta página"**.
4. Verás una tarjeta con:
   - Puntuación heurística estimada (0-100)
   - Emocionalidad / lenguaje sensacionalista detectado
   - Presencia de lenguaje absolutista ("siempre", "nunca", "sin duda", etc.)
   - Si hay un autor identificable en la página
   - Enlaces salientes hacia dominios comúnmente reconocidos como fuentes primarias (organismos oficiales, revistas científicas, medios establecidos, etc.)
   - Un resumen en texto de todo lo anterior

## Cómo funciona el motor (`analyzer.js`)

No usa ninguna IA generativa ni llama a ningún servidor. Es un conjunto de reglas:

- **Emocionalidad**: cuenta frases y palabras típicas del lenguaje sensacionalista/clickbait, palabras en MAYÚSCULAS y signos de exclamación.
- **Lenguaje sesgado**: cuenta expresiones absolutistas ("todos saben", "nunca", "100% seguro"...).
- **Autor**: busca metaetiquetas `author`, atributos `rel="author"` o clases comunes tipo `.author`/`.byline`.
- **Fuentes reconocibles**: revisa todos los enlaces salientes de la página y los compara contra una lista fija de dominios (organismos de salud, ciencia, medios reconocidos, etc.). Si no hay coincidencias, no inventa ninguna.
- **Puntuación final**: combina todo lo anterior con pesos fijos definidos en el código. Es completamente transparente — puedes abrir `analyzer.js` y ver exactamente cómo se calcula cada número.

## Límites importantes (léelo antes de confiar en los resultados)

- **No verifica hechos.** No sabe si una afirmación es verdadera o falsa; solo detecta patrones de superficie en el texto y los enlaces.
- **La lista de "dominios reconocidos" es fija y limitada.** Un sitio fiable que no esté en la lista aparecerá con "0 fuentes detectadas", y eso no significa que sea poco confiable.
- **Es fácil de engañar** por alguien que conozca las reglas (por ejemplo, evitando palabras sensacionalistas a propósito).
- Trátalo como una primera señal de alerta, no como un veredicto. Para temas importantes, sigue verificando con fuentes primarias y/o fact-checkers profesionales.

## Archivos del proyecto

- `manifest.json` — configuración de la extensión (Manifest V3)
- `background.js` — abre el panel lateral al hacer clic en el ícono
- `analyzer.js` — el motor de heurísticas (la "IA" local)
- `sidepanel.html` / `sidepanel.css` / `sidepanel.js` — interfaz y orquestación
