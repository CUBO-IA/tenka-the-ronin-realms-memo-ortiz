import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { abrirDb } from '../server/db.js';
import { crearRonin } from '../server/ronin.js';
import { accionesValidas, ultimoMensaje } from '../server/acciones.js';
import {
  configurarAgente,
  interpretarOrden,
  interpretarPorPalabras,
  mensajeDelRonin,
  validarRespuesta,
} from '../server/agente.js';
import { crearIa } from '../server/ia.js';
import { roninValido } from './ayuda.js';

function prepararJuego(extra = {}) {
  const db = abrirDb(':memory:');
  const info = db
    .prepare(
      "INSERT INTO usuarios (nombre, nombre_normalizado, pin_hash, creado) VALUES ('Kenji', 'kenji', 'hash', ?)",
    )
    .run(Date.now());
  const ronin = crearRonin(db, Number(info.lastInsertRowid), roninValido(extra));
  return { db, ronin };
}

// IA falsa: devuelve lo que se le indique, sin red.
function iaFalsa(datos) {
  return crearIa({
    env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    config: { timeoutMs: 100, maxPorMinuto: 100, groqModelo: 'g', geminiModelo: 'm' },
  });
}

const sinIa = crearIa({ env: {}, fetchImpl: async () => new Response('', { status: 500 }) });

afterEach(() => configurarAgente(sinIa));

describe('agente: el modelo propone, el código decide', () => {
  test('validarRespuesta descarta acciones inventadas y completa hasta dos', () => {
    const validas = [
      { accion: 'recolectar', parametros: { recurso: 'cedro' }, etiqueta: 'Gather Cedar wood' },
      { accion: 'descansar', parametros: {}, etiqueta: 'Rest at the sanctuary' },
    ];
    const r = validarRespuesta(
      {
        mensaje: '  Master,\n the forest  calls. — H. ',
        opciones: [
          { accion: 'atacar', parametros: { clan: 'x' }, etiqueta: 'Attack!' },
          { accion: 'recolectar', parametros: { recurso: 'oro' }, etiqueta: 'Gather gold' },
          { accion: 'recolectar', parametros: { recurso: 'cedro' }, etiqueta: 'Chop cedar' },
        ],
      },
      validas,
    );
    assert.equal(r.mensaje, 'Master, the forest calls. — H.');
    assert.equal(r.opciones.length, 2);
    assert.equal(r.opciones[0].etiqueta, 'Chop cedar');
    assert.equal(r.opciones[1].accion, 'descansar');
  });

  test('validarRespuesta rechaza JSON sin mensaje', () => {
    assert.equal(validarRespuesta({ opciones: [] }, []), null);
    assert.equal(validarRespuesta('texto', []), null);
  });

  test('sin IA, el mensaje es el predefinido', async () => {
    configurarAgente(sinIa);
    const { db, ronin } = prepararJuego();
    const mensaje = await mensajeDelRonin(db, ronin, 'inicio');
    assert.match(mensaje.texto, /arrived at the sanctuary/);
    assert.ok(mensaje.opciones.length >= 2);
    assert.equal(ultimoMensaje(db, ronin.id).id, mensaje.id);
  });

  test('con IA, el mensaje es el del modelo y las opciones válidas', async () => {
    configurarAgente(
      iaFalsa({
        mensaje: 'The snow is deep, master. Shall I cut cedar? — H.',
        opciones: [
          { accion: 'recolectar', parametros: { recurso: 'cedro' }, etiqueta: 'Cut cedar' },
          { accion: 'volar', parametros: {}, etiqueta: 'Fly away' },
        ],
      }),
    );
    const { db, ronin } = prepararJuego();
    const mensaje = await mensajeDelRonin(db, ronin, 'inicio');
    assert.match(mensaje.texto, /snow is deep/);
    assert.equal(mensaje.proveedor, 'gemini');
    assert.ok(mensaje.opciones.every((o) => o.accion !== 'volar'));
    assert.equal(mensaje.opciones[0].etiqueta, 'Cut cedar');
  });

  test('interpretarPorPalabras entiende recolectar, construir y descansar', () => {
    const { db, ronin } = prepararJuego();
    const validas = accionesValidas(db, ronin);
    assert.equal(interpretarPorPalabras('go gather some cedar wood', validas).parametros.recurso, 'cedro');
    assert.equal(interpretarPorPalabras('Build the house now', validas).parametros.edificio, 'casa');
    assert.equal(interpretarPorPalabras('take a rest', validas).accion, 'descansar');
    assert.equal(interpretarPorPalabras('attack the shadow clan', validas), null);
  });

  test('una orden escrita sin IA se ejecuta por palabras clave', async () => {
    configurarAgente(sinIa);
    const { db, ronin } = prepararJuego();
    const r = await interpretarOrden(db, ronin, 'please gather stone', 1000);
    assert.equal(r.ejecutada, true);
    assert.equal(r.accion.parametros.recurso, 'piedra');
    assert.equal(r.ronin.estado, 'recolectando');
    assert.equal(r.mensaje.respondido, true);
  });

  test('una orden que la IA traduce a una acción inválida no se ejecuta', async () => {
    configurarAgente(
      iaFalsa({
        mensaje: 'I will raid them tonight. — H.',
        opciones: [{ accion: 'atacar', parametros: { clan: 'sombra' }, etiqueta: 'Raid' }],
      }),
    );
    const { db, ronin } = prepararJuego();
    const r = await interpretarOrden(db, ronin, 'attack everyone', 1000);
    // La IA propuso algo fuera de la lista: se completa con opciones válidas y
    // se ejecuta la primera válida, nunca el ataque.
    assert.notEqual(r.accion?.accion, 'atacar');
    assert.ok(ultimoMensaje(db, ronin.id).opciones.every((o) => o.accion !== 'atacar'));
  });

  test('con el rōnin ocupado, la orden se guarda pero no se ejecuta', async () => {
    configurarAgente(sinIa);
    const { db, ronin } = prepararJuego();
    const primera = await interpretarOrden(db, ronin, 'gather cedar', 1000);
    assert.equal(primera.ejecutada, true);
    const segunda = await interpretarOrden(db, primera.ronin, 'gather stone', 1500);
    assert.equal(segunda.ejecutada, false);
    assert.equal(segunda.ocupado, true);
  });
});
