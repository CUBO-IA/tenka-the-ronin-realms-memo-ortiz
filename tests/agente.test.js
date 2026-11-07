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
  idiomaDelMaestro,
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
  test('detecta el idioma del maestro por lo que escribe', () => {
    const { db, ronin } = prepararJuego();
    assert.equal(idiomaDelMaestro(db, ronin.id, 'Go gather some cedar for the house'), 'en');
    assert.equal(idiomaDelMaestro(db, ronin.id, '¿Qué puedo hacer ahora? Vamos a construir la casa'), 'es');
    assert.equal(idiomaDelMaestro(db, ronin.id, ''), 'en');
  });

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

  test('el idioma lo decide lo que escribe el maestro, no los botones en inglés', () => {
    const { db, ronin } = prepararJuego();
    for (const etiqueta of ['Gather Cedar wood', 'Build the house', 'Attack Ryo']) {
      db.prepare("INSERT INTO mensajes (ronin_id, texto, opciones_json, creado, de) VALUES (?, ?, '[]', ?, 'maestro')").run(ronin.id, etiqueta, Date.now());
    }
    db.prepare("INSERT INTO mensajes (ronin_id, texto, opciones_json, creado, de) VALUES (?, ?, '[]', ?, 'maestro')").run(ronin.id, 'dale, construye la casa', Date.now());
    assert.equal(idiomaDelMaestro(db, ronin.id, ''), 'es');
    assert.equal(idiomaDelMaestro(db, ronin.id, 'Build the house now'), 'en');
  });

  test('las órdenes en español también se entienden por palabras clave', () => {
    const { db, ronin } = prepararJuego();
    const validas = accionesValidas(db, ronin);
    assert.equal(interpretarPorPalabras('recolectá piedra, por favor', validas).parametros.recurso, 'piedra');
    assert.equal(interpretarPorPalabras('andá a traer madera', validas).parametros.recurso, 'cedro');
    assert.equal(interpretarPorPalabras('construye la casa', validas).parametros.edificio, 'casa');
    assert.equal(interpretarPorPalabras('descansá un rato', validas).accion, 'descansar');
  });

  test('sin IA, pedir una tropa que no alcanza explica qué falta, en el idioma del maestro', async () => {
    configurarAgente(sinIa);
    const { db, ronin } = prepararJuego();
    db.prepare('UPDATE ronin SET era = 2 WHERE id = ?').run(ronin.id);
    db.prepare("UPDATE recursos SET cantidad = 3 WHERE ronin_id = ? AND tipo = 'arroz'").run(ronin.id);
    const roninEra2 = { ...ronin, era: 2 };
    const r = await interpretarOrden(db, roninEra2, 'crea un samurái', 1000);
    assert.equal(r.ejecutada, false);
    assert.match(r.mensaje.texto, /arroz/);
    assert.match(r.mensaje.texto, /faltan/);
    const en = await interpretarOrden(db, roninEra2, 'train a samurai now', 5000);
    assert.equal(en.ejecutada, false);
    assert.match(en.mensaje.texto, /rice/);
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
