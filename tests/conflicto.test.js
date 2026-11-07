import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { abrirDb } from '../server/db.js';
import { crearRonin } from '../server/ronin.js';
import { obtenerEdificios, obtenerRecursos, ultimoMensaje } from '../server/acciones.js';
import {
  aliadosDe,
  fuerzaDefensa,
  motivoNoAtacar,
  resolverBatalla,
  tropasDe,
} from '../server/conflicto.js';
import * as conflicto from '../server/conflicto.js';
import { accionesValidas, ejecutarOrden } from '../server/ordenes.js';
import { avanzarMundo } from '../server/reloj.js';
import { reglas } from '../server/reglas.js';
import { roninValido } from './ayuda.js';

function mundoDePrueba() {
  const db = abrirDb(':memory:');
  const crearUsuario = (nombre) =>
    Number(
      db
        .prepare(
          "INSERT INTO usuarios (nombre, nombre_normalizado, pin_hash, creado) VALUES (?, ?, 'hash', ?)",
        )
        .run(nombre, nombre.toLowerCase(), Date.now()).lastInsertRowid,
    );
  const hana = crearRonin(db, crearUsuario('Ana'), roninValido({ nombre: 'Hana' }));
  const ryo = crearRonin(
    db,
    crearUsuario('Beto'),
    roninValido({ nombre: 'Ryo', bando: 'sombra', kimono: 'negro_violeta' }),
  );
  const fila = (id) => db.prepare('SELECT * FROM ronin WHERE id = ?').get(id);
  const subirEra = (id, era) => db.prepare('UPDATE ronin SET era = ? WHERE id = ?').run(era, id);
  return { db, hana, ryo, fila, subirEra };
}

describe('conflicto: alianzas, tropas y ataques', () => {
  test('en era 1 no hay ataques ni tropas, pero sí se puede proponer alianza', () => {
    const { db, hana } = mundoDePrueba();
    const acciones = accionesValidas(db, hana).map((a) => a.accion);
    assert.ok(!acciones.includes('atacar'));
    assert.ok(!acciones.includes('entrenar'));
    assert.ok(acciones.includes('proponer_alianza'));
  });

  test('una alianza propuesta llega al otro maestro y al aceptarla une a los clanes', () => {
    const { db, hana, ryo, fila } = mundoDePrueba();
    const propuesta = ejecutarOrden(db, hana.id, { accion: 'proponer_alianza', parametros: { clan: ryo.id } });
    assert.equal(propuesta.avisos.length, 1);
    assert.equal(propuesta.avisos[0].roninId, ryo.id);

    const mensajeRyo = ultimoMensaje(db, ryo.id);
    assert.match(mensajeRyo.texto, /alliance/);
    assert.equal(mensajeRyo.opciones[0].accion, 'responder_alianza');

    const respuesta = ejecutarOrden(db, ryo.id, mensajeRyo.opciones[0]);
    assert.equal(respuesta.avisos[0].roninId, hana.id);
    assert.deepEqual(aliadosDe(db, hana.id), [ryo.id]);
    assert.match(ultimoMensaje(db, hana.id).texto, /accepted/);
    assert.ok(fila(hana.id));
  });

  test('no se puede atacar a un aliado, a un escudado ni a alguien en la niebla', () => {
    const { db, hana, ryo, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 2);
    assert.match(motivoNoAtacar(db, fila(hana.id), fila(ryo.id)), /mist/);
    subirEra(ryo.id, 2);
    assert.equal(motivoNoAtacar(db, fila(hana.id), fila(ryo.id)), null);
    db.prepare('UPDATE ronin SET escudo_hasta = ? WHERE id = ?').run(Date.now() + 10000, ryo.id);
    assert.match(motivoNoAtacar(db, fila(hana.id), fila(ryo.id)), /shielded/);
  });

  test('entrenar descuenta recursos y la tropa llega cuando el reloj termina', async () => {
    const { db, hana, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 2);
    const ahora = 1000;
    const r = ejecutarOrden(db, hana.id, { accion: 'entrenar', parametros: { tropa: 'samurai' } }, ahora);
    assert.equal(r.ronin.estado, 'entrenando');
    assert.equal(obtenerRecursos(db, hana.id).arroz, reglas.recursosIniciales.luz.arroz - reglas.conflicto.tropas.samurai.costo.arroz);
    await avanzarMundo(db, null, ahora + r.duracionMs + 1);
    assert.deepEqual(tropasDe(db, hana.id), { samurai: 1 });
    assert.equal(fila(hana.id).estado, 'despierto');
  });

  test('un ataque marcha, avisa al defensor y la batalla se resuelve al llegar', async () => {
    const { db, hana, ryo, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 2);
    subirEra(ryo.id, 2);
    db.prepare("INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, 'choza', 'terminado', 100, 1, 1)").run(ryo.id);

    const ahora = 5000;
    const marcha = ejecutarOrden(db, hana.id, { accion: 'atacar', parametros: { clan: ryo.id } }, ahora);
    assert.equal(marcha.ronin.estado, 'atacando');
    assert.equal(marcha.batalla.defensor.nombre, 'Ryo');
    assert.match(ultimoMensaje(db, ryo.id).texto, /is coming for|marches against/);

    const eventos = [];
    const ioFalso = { to: () => ({ emit: (n, d) => eventos.push(n) }), emit: (n) => eventos.push(n) };
    // Primero llega la marcha: empieza el combate por golpes y el rōnin sigue ocupado.
    const llegada = await avanzarMundo(db, ioFalso, ahora + marcha.duracionMs + 1);
    assert.equal(llegada.length, 0);
    assert.ok(eventos.includes('batalla:combate'));
    const enCombate = fila(hana.id);
    const tareaCombate = JSON.parse(enCombate.tarea);
    assert.equal(tareaCombate.fase, 'combate');
    assert.ok(tareaCombate.combate.golpes.length >= 1);
    // Cuando el combate termina, se aplican las consecuencias.
    const completados = await avanzarMundo(db, ioFalso, enCombate.tarea_fin + 1);
    assert.equal(completados.length, 1);
    assert.ok(completados[0].batalla);
    assert.ok(['atacante', 'defensor'].includes(completados[0].batalla.ganador));
    assert.ok(eventos.includes('batalla:resultado'));
    assert.ok(fila(ryo.id).escudo_hasta > ahora);
    assert.equal(fila(hana.id).estado, 'despierto');
    assert.match(ultimoMensaje(db, hana.id).texto, /Ryo/);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM batallas').get().n === 1);
  });

  test('si gana el atacante se lleva botín y un edificio baja de etapa', () => {
    const { db, hana, ryo, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 3);
    subirEra(ryo.id, 2);
    db.prepare("INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, 'choza', 'terminado', 100, 1, 1)").run(ryo.id);
    const antes = obtenerRecursos(db, ryo.id);

    // Azar fijo: el atacante al máximo, el defensor al mínimo.
    const dados = [1, 0, 0];
    const resultado = resolverBatalla(db, fila(hana.id), ryo.id, 9000, () => dados.shift() ?? 0);
    assert.equal(resultado.ganador, 'atacante');
    assert.ok(resultado.botin.arroz > 0);
    assert.equal(obtenerRecursos(db, ryo.id).arroz, antes.arroz - resultado.botin.arroz);
    assert.equal(obtenerEdificios(db, ryo.id)[0].etapa, 'construccion');
    assert.equal(resultado.edificioDanado.tipo, 'choza');
  });

  test('el parte de guerra explica qué decidió la pelea y aconseja', () => {
    const { db, hana, ryo, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 2);
    subirEra(ryo.id, 2);
    db.prepare("INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, 'muro', 'terminado', 100, 1, 1)").run(ryo.id);
    // Azar fijo: el atacante al mínimo, el defensor al máximo.
    const dados = [0, 1, 0];
    const resultado = resolverBatalla(db, fila(hana.id), ryo.id, 9000, () => dados.shift() ?? 0);
    assert.equal(resultado.ganador, 'defensor');
    assert.equal(resultado.desglose.defensa.murallas, 10);
    const { textosDeBatalla, historialDeBatallas } = conflicto;
    const textos = textosDeBatalla(resultado);
    assert.match(textos.atacante, /What stopped us: their walls/);
    assert.match(textos.atacante, /train two/);
    assert.match(textos.defensor, /What held: our walls/);
    const historial = historialDeBatallas(db, hana.id);
    assert.equal(historial.length, 1);
    assert.equal(historial[0].contra, 'Ryo');
    assert.equal(historial[0].ganamos, false);
  });

  test('en la era 2 la aldea se bloquea hasta la primera batalla', async () => {
    const { db, hana, ryo, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 2);
    subirEra(ryo.id, 2);
    db.prepare('UPDATE recursos SET cantidad = 500 WHERE ronin_id = ?').run(hana.id);

    const antes = accionesValidas(db, fila(hana.id));
    assert.ok(!antes.some((a) => a.accion === 'construir' && a.parametros.edificio === 'terrazas'));
    assert.ok(antes.some((a) => a.accion === 'atacar'));
    assert.throws(
      () => ejecutarOrden(db, hana.id, { accion: 'construir', parametros: { edificio: 'terrazas' } }, 1000),
      /raid another sanctuary first/,
    );

    const marcha = ejecutarOrden(db, hana.id, { accion: 'atacar', parametros: { clan: ryo.id } }, 2000);
    await avanzarMundo(db, null, 2000 + marcha.duracionMs + 1);
    await avanzarMundo(db, null, fila(hana.id).tarea_fin + 1);
    const despues = accionesValidas(db, fila(hana.id));
    assert.ok(despues.some((a) => a.accion === 'construir' && a.parametros.edificio === 'terrazas'));
  });

  test('el combate por golpes termina cuando uno se queda sin vida y el más fuerte suele ganar', () => {
    const { db, hana, ryo, fila, subirEra } = mundoDePrueba();
    subirEra(hana.id, 2);
    subirEra(ryo.id, 2);
    for (const tipo of ['choza', 'pozo', 'circulo', 'altar', 'muro']) {
      db.prepare("INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, ?, 'terminado', 100, 1, 1)").run(ryo.id, tipo);
    }
    const combate = conflicto.simularCombate(db, fila(hana.id), fila(ryo.id), () => 0.5);
    assert.equal(combate.ganador, 'defensor');
    assert.equal(combate.vidaA, 0);
    assert.ok(combate.vidaD > 0);
    const ultimo = combate.golpes.at(-1);
    assert.equal(ultimo.quien, 'defensor');
    assert.ok(combate.duracionMs > combate.golpes.length * 500);
    // Cada golpe tiene su tiempo creciente.
    for (let i = 1; i < combate.golpes.length; i += 1) assert.ok(combate.golpes[i].t > combate.golpes[i - 1].t);
  });

  test('la defensa suma parte de la de los aliados', () => {
    const { db, hana, ryo, fila } = mundoDePrueba();
    const sola = fuerzaDefensa(db, fila(ryo.id));
    db.prepare("INSERT INTO alianzas (clan_a, clan_b, estado, creada) VALUES (?, ?, 'activa', 1)").run(hana.id, ryo.id);
    assert.ok(fuerzaDefensa(db, fila(ryo.id)) > sola);
  });

  test('al terminar los cuatro edificios de la era 1, el rōnin pasa a la era 2', async () => {
    const { db, hana, fila } = mundoDePrueba();
    for (const tipo of ['casa', 'granero', 'torii']) {
      db.prepare("INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, ?, 'terminado', 100, 1, 1)").run(hana.id, tipo);
    }
    db.prepare("INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, 'altar', 'construccion', 100, 1, 1)").run(hana.id);
    db.prepare("UPDATE recursos SET cantidad = 500 WHERE ronin_id = ?").run(hana.id);
    const ahora = 2000;
    const r = ejecutarOrden(db, hana.id, { accion: 'construir', parametros: { edificio: 'altar' } }, ahora);
    await avanzarMundo(db, null, ahora + r.duracionMs + 1);
    assert.equal(fila(hana.id).era, 2);
    assert.match(ultimoMensaje(db, hana.id).texto, /Era 2/);
  });
});
