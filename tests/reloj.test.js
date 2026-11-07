import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { abrirDb } from '../server/db.js';
import { crearRonin } from '../server/ronin.js';
import {
  edificioPorTipo,
  ejecutarAccion,
  obtenerRecursos,
  ultimoMensaje,
} from '../server/acciones.js';
import { avanzarMundo } from '../server/reloj.js';
import { roninValido } from './ayuda.js';

function prepararJuego() {
  const db = abrirDb(':memory:');
  const usuarioInfo = db
    .prepare(
      "INSERT INTO usuarios (nombre, nombre_normalizado, pin_hash, creado) VALUES ('Kenji', 'kenji', 'hash', ?)",
    )
    .run(Date.now());
  const usuarioId = Number(usuarioInfo.lastInsertRowid);
  const ronin = crearRonin(db, usuarioId, roninValido());
  return { db, usuarioId, ronin };
}

describe('reloj del mundo y avance de tareas', () => {
  test('ignora tareas que aún no han terminado', async () => {
    const { db, ronin } = prepararJuego();
    const ahora = 100000;
    ejecutarAccion(
      db,
      ronin.id,
      { accion: 'recolectar', parametros: { recurso: 'cedro' } },
      ahora,
    );

    const completados = await avanzarMundo(db, null, ahora + 1000);
    assert.equal(completados.length, 0);

    const roninDb = db.prepare('SELECT * FROM ronin WHERE id = ?').get(ronin.id);
    assert.equal(roninDb.estado, 'recolectando');
  });

  test('completa recolección, suma recursos y genera nuevo mensaje con opciones', async () => {
    const { db, ronin } = prepararJuego();
    const ahora = 100000;
    const res = ejecutarAccion(
      db,
      ronin.id,
      { accion: 'recolectar', parametros: { recurso: 'cedro' } },
      ahora,
    );
    const recursosAntes = obtenerRecursos(db, ronin.id);

    // Avanzamos el reloj al momento en que termina la tarea
    const completados = await avanzarMundo(db, null, ahora + res.duracionMs + 1);
    assert.equal(completados.length, 1);

    const roninDb = db.prepare('SELECT * FROM ronin WHERE id = ?').get(ronin.id);
    assert.equal(roninDb.estado, 'despierto');
    assert.equal(roninDb.tarea, null);
    assert.equal(roninDb.tarea_fin, null);

    const recursosDespues = obtenerRecursos(db, ronin.id);
    assert.equal(recursosDespues.cedro, recursosAntes.cedro + 15);

    const mensaje = ultimoMensaje(db, ronin.id);
    assert.ok(mensaje);
    assert.equal(mensaje.respondido, false);
    assert.ok(mensaje.texto.includes('cedar'));
    assert.ok(mensaje.opciones.length >= 2);
  });

  test('completa etapa de construcción y avanza el progreso del edificio', async () => {
    const { db, ronin } = prepararJuego();
    const ahora = 200000;
    const res = ejecutarAccion(
      db,
      ronin.id,
      { accion: 'construir', parametros: { edificio: 'casa' } },
      ahora,
    );

    const completados = await avanzarMundo(db, null, ahora + res.duracionMs + 1);
    assert.equal(completados.length, 1);

    const ed = edificioPorTipo(db, ronin.id, 'casa');
    assert.ok(ed);
    assert.equal(ed.etapa, 'cimientos');
    assert.equal(ed.progreso, 100);

    const mensaje = ultimoMensaje(db, ronin.id);
    assert.ok(mensaje);
    assert.ok(mensaje.texto.includes("Rōnin's House"));
  });

  test('notifica eventos por Socket.IO al completar una tarea', async () => {
    const { db, ronin, usuarioId } = prepararJuego();
    const ahora = 300000;
    const res = ejecutarAccion(
      db,
      ronin.id,
      { accion: 'descansar' },
      ahora,
    );

    const eventosEmitidos = [];
    const ioFalso = {
      to(sala) {
        return {
          emit(evento, datos) {
            eventosEmitidos.push({ sala, evento, datos });
          },
        };
      },
    };

    await avanzarMundo(db, ioFalso, ahora + res.duracionMs + 1);

    assert.ok(eventosEmitidos.length >= 2);
    const eventosNombres = eventosEmitidos.map((e) => e.evento);
    assert.ok(eventosNombres.includes('ronin:actualizado'));
    assert.ok(eventosNombres.includes('mensaje:nuevo'));
    assert.equal(eventosEmitidos[0].sala, `usuario:${usuarioId}`);
  });
});
