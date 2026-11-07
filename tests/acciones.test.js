import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { abrirDb } from '../server/db.js';
import { crearRonin } from '../server/ronin.js';
import {
  edificioPorTipo,
  ejecutarAccion,
  obtenerEdificios,
  obtenerRecursos,
  ultimoMensaje,
  validarAccion,
} from '../server/acciones.js';
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

describe('lista cerrada de acciones y validación con zod', () => {
  test('valida acciones correctas', () => {
    assert.deepEqual(validarAccion({ accion: 'recolectar', parametros: { recurso: 'cedro' } }), {
      accion: 'recolectar',
      parametros: { recurso: 'cedro' },
    });
    assert.deepEqual(validarAccion({ accion: 'construir', parametros: { edificio: 'casa' } }), {
      accion: 'construir',
      parametros: { edificio: 'casa' },
    });
    assert.deepEqual(validarAccion({ accion: 'descansar' }), {
      accion: 'descansar',
      parametros: {},
    });
  });

  test('rechaza acciones inventadas o incompletas', () => {
    assert.throws(() => validarAccion({ accion: 'volar' }), (err) => err.codigo === 'ACCION_INVALIDA');
    assert.throws(() => validarAccion({ accion: 'recolectar', parametros: {} }), (err) => err.codigo === 'ACCION_INVALIDA');
    assert.throws(() => validarAccion({ accion: 'construir', parametros: {} }), (err) => err.codigo === 'ACCION_INVALIDA');
  });

  test('ejecuta recolectar y pone al rōnin a trabajar', () => {
    const { db, ronin } = prepararJuego();
    const ahora = 100000;
    const res = ejecutarAccion(
      db,
      ronin.id,
      { accion: 'recolectar', parametros: { recurso: 'cedro' } },
      ahora,
    );

    assert.equal(res.ronin.estado, 'recolectando');
    assert.ok(res.duracionMs > 0);
    const roninDb = db.prepare('SELECT * FROM ronin WHERE id = ?').get(ronin.id);
    assert.equal(roninDb.estado, 'recolectando');
    assert.equal(roninDb.tarea_fin, ahora + res.duracionMs);
  });

  test('rechaza recolectar un recurso que no es de su bando', () => {
    const { db, ronin } = prepararJuego();
    assert.throws(
      () =>
        ejecutarAccion(db, ronin.id, {
          accion: 'recolectar',
          parametros: { recurso: 'sauce' },
        }),
      (err) => err.codigo === 'RECURSO_INVALIDO',
    );
  });

  test('ejecuta construir descontando recursos y registrando cimientos', () => {
    const { db, ronin } = prepararJuego();
    const antesRecursos = obtenerRecursos(db, ronin.id);
    const ahora = 200000;

    const res = ejecutarAccion(
      db,
      ronin.id,
      { accion: 'construir', parametros: { edificio: 'casa' } },
      ahora,
    );

    assert.equal(res.ronin.estado, 'construyendo');
    const despuesRecursos = obtenerRecursos(db, ronin.id);
    assert.equal(despuesRecursos.cedro, antesRecursos.cedro - 15);
    assert.equal(despuesRecursos.piedra, antesRecursos.piedra - 10);

    const ed = edificioPorTipo(db, ronin.id, 'casa');
    assert.ok(ed);
    assert.equal(ed.etapa, 'cimientos');
    assert.equal(ed.progreso, 0);
  });

  test('rechaza acción si el rōnin ya está ocupado', () => {
    const { db, ronin } = prepararJuego();
    const ahora = 300000;
    ejecutarAccion(
      db,
      ronin.id,
      { accion: 'recolectar', parametros: { recurso: 'cedro' } },
      ahora,
    );

    assert.throws(
      () =>
        ejecutarAccion(
          db,
          ronin.id,
          { accion: 'descansar' },
          ahora + 1000,
        ),
      (err) => err.codigo === 'RONIN_OCUPADO',
    );
  });

  test('rechaza construir si no alcanzan los recursos', () => {
    const { db, ronin } = prepararJuego();
    // Vaciamos los recursos de madera
    db.prepare('UPDATE recursos SET cantidad = 0 WHERE ronin_id = ?').run(ronin.id);

    assert.throws(
      () =>
        ejecutarAccion(db, ronin.id, {
          accion: 'construir',
          parametros: { edificio: 'casa' },
        }),
      (err) => err.codigo === 'RECURSOS_INSUFICIENTES',
    );
  });
});
