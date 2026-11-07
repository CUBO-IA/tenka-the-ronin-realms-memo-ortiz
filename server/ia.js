// La IA del juego: Groq primero, Gemini de respaldo. Las dos por `fetch`,
// con tiempo máximo y un límite global de llamadas por minuto. Si ninguna
// responde, devuelve null y el que llama usa mensajes predefinidos.
//
// Las llaves viven en .env y nunca salen del servidor.

import { reglas } from './reglas.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Saca el JSON de una respuesta que puede venir con ```json ... ``` o texto alrededor.
export function extraerJson(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.replace(/```(?:json)?/gi, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio === -1 || fin === -1 || fin <= inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

async function conTiempo(fetchImpl, url, opciones, timeoutMs) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...opciones, signal: control.signal });
  } finally {
    clearTimeout(temporizador);
  }
}

export function crearIa({ env = process.env, fetchImpl = globalThis.fetch, config = reglas.ia } = {}) {
  const groqKey = env.GROQ_API_KEY || '';
  const groqModelo = env.GROQ_MODELO || config.groqModelo;
  const geminiKey = env.GEMINI_API_KEY || '';
  const geminiModelo = env.GEMINI_MODELO || config.geminiModelo;

  // Límite global: llamadas por minuto, sin importar cuántos rōnin haya.
  let ventanaInicio = 0;
  let llamadasEnVentana = 0;

  function hayCupo(ahora = Date.now()) {
    if (ahora - ventanaInicio >= 60_000) {
      ventanaInicio = ahora;
      llamadasEnVentana = 0;
    }
    if (llamadasEnVentana >= config.maxPorMinuto) return false;
    llamadasEnVentana += 1;
    return true;
  }

  async function groq(sistema, usuario) {
    const respuesta = await conTiempo(
      fetchImpl,
      GROQ_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: groqModelo,
          temperature: 0.8,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: usuario },
          ],
        }),
      },
      config.timeoutMs,
    );
    if (!respuesta.ok) throw new Error(`Groq ${respuesta.status}`);
    const datos = await respuesta.json();
    return extraerJson(datos?.choices?.[0]?.message?.content);
  }

  async function gemini(sistema, usuario) {
    const respuesta = await conTiempo(
      fetchImpl,
      `${GEMINI_URL}/${encodeURIComponent(geminiModelo)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{ role: 'user', parts: [{ text: usuario }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8,
            maxOutputTokens: 600,
          },
        }),
      },
      config.timeoutMs,
    );
    if (!respuesta.ok) throw new Error(`Gemini ${respuesta.status}`);
    const datos = await respuesta.json();
    const partes = datos?.candidates?.[0]?.content?.parts || [];
    const texto = partes.map((parte) => parte.text || '').join('');
    return extraerJson(texto);
  }

  const proveedores = [];
  if (groqKey) proveedores.push({ nombre: 'groq', pedir: groq });
  if (geminiKey) proveedores.push({ nombre: 'gemini', pedir: gemini });

  return {
    disponible: proveedores.length > 0,
    proveedores: proveedores.map((p) => p.nombre),

    // Devuelve { datos, proveedor } o null si nadie respondió a tiempo.
    async pedirJson({ sistema, usuario }, ahora = Date.now()) {
      if (!proveedores.length || !hayCupo(ahora)) return null;

      for (const proveedor of proveedores) {
        try {
          const datos = await proveedor.pedir(sistema, usuario);
          if (datos && typeof datos === 'object') {
            return { datos, proveedor: proveedor.nombre };
          }
        } catch (error) {
          console.warn(`[ia] ${proveedor.nombre} falló: ${error.message}`);
        }
      }
      return null;
    },
  };
}
