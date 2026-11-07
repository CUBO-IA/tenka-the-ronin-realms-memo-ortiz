import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { crearIa, extraerJson } from '../server/ia.js';

const config = {
  timeoutMs: 50,
  maxPorMinuto: 3,
  groqModelo: 'modelo-groq',
  geminiModelo: 'modelo-gemini',
};

function respuestaGroq(contenido) {
  return new Response(JSON.stringify({ choices: [{ message: { content: contenido } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function respuestaGemini(texto) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('ia: proveedores, respaldo y límites', () => {
  test('sin llaves no está disponible y devuelve null', async () => {
    const ia = crearIa({ env: {}, fetchImpl: async () => respuestaGroq('{}'), config });
    assert.equal(ia.disponible, false);
    assert.equal(await ia.pedirJson({ sistema: 's', usuario: 'u' }), null);
  });

  test('usa Groq primero y devuelve el JSON', async () => {
    const llamadas = [];
    const ia = crearIa({
      env: { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' },
      fetchImpl: async (url, opciones) => {
        llamadas.push(url);
        assert.match(opciones.headers.Authorization, /^Bearer /);
        return respuestaGroq('```json\n{"mensaje":"hola","opciones":[]}\n```');
      },
      config,
    });
    const r = await ia.pedirJson({ sistema: 's', usuario: 'u' });
    assert.equal(r.proveedor, 'groq');
    assert.equal(r.datos.mensaje, 'hola');
    assert.equal(llamadas.length, 1);
    assert.match(llamadas[0], /groq/);
  });

  test('si Groq tarda demasiado, pasa a Gemini', async () => {
    const ia = crearIa({
      env: { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' },
      fetchImpl: (url, opciones) =>
        new Promise((resolver, rechazar) => {
          if (url.includes('groq')) {
            opciones.signal.addEventListener('abort', () => rechazar(new Error('abort')));
            return;
          }
          resolver(respuestaGemini('{"mensaje":"desde gemini","opciones":[]}'));
        }),
      config,
    });
    const r = await ia.pedirJson({ sistema: 's', usuario: 'u' });
    assert.equal(r.proveedor, 'gemini');
    assert.equal(r.datos.mensaje, 'desde gemini');
  });

  test('si los dos fallan devuelve null', async () => {
    const ia = crearIa({
      env: { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' },
      fetchImpl: async () => new Response('no', { status: 503 }),
      config,
    });
    assert.equal(await ia.pedirJson({ sistema: 's', usuario: 'u' }), null);
  });

  test('respeta el máximo de llamadas por minuto', async () => {
    let llamadas = 0;
    const ia = crearIa({
      env: { GEMINI_API_KEY: 'k' },
      fetchImpl: async () => {
        llamadas += 1;
        return respuestaGemini('{"mensaje":"x","opciones":[]}');
      },
      config,
    });
    const inicio = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      await ia.pedirJson({ sistema: 's', usuario: 'u' }, inicio + i);
    }
    assert.equal(llamadas, 3);
    // Pasado un minuto vuelve a haber cupo.
    const r = await ia.pedirJson({ sistema: 's', usuario: 'u' }, inicio + 61_000);
    assert.ok(r);
    assert.equal(llamadas, 4);
  });

  test('extraerJson tolera texto alrededor y falla con basura', () => {
    assert.deepEqual(extraerJson('Sure! {"a":1} ok'), { a: 1 });
    assert.equal(extraerJson('nada'), null);
    assert.equal(extraerJson(null), null);
  });
});
