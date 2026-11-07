// Una sola puerta para toda orden del maestro: valida que la acción exista en
// la lista cerrada y la manda a quien la ejecuta (era 1 o conflicto).

import { z } from 'zod';
import { accionesValidas as accionesEra1, ejecutarAccion, guardarLineaDelMaestro, mensajeDeSalida } from './acciones.js';
import {
  iniciarAtaque,
  iniciarEntrenamiento,
  opcionesDeAlianza,
  opcionesDeAtaque,
  opcionesDeEntrenar,
  proponerAlianza,
  responderAlianza,
} from './conflicto.js';
import { ErrorDeJuego, camposDeZod, primerMensajeDeZod } from './errores.js';
import { obtenerEdificios, obtenerRecursos } from './acciones.js';
import { serializarRonin } from './ronin.js';

export const ACCIONES = [
  'recolectar',
  'construir',
  'descansar',
  'entrenar',
  'atacar',
  'proponer_alianza',
  'responder_alianza',
];

const esquemaOrden = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('recolectar'), parametros: z.object({ recurso: z.string() }) }),
  z.object({ accion: z.literal('construir'), parametros: z.object({ edificio: z.string() }) }),
  z.object({ accion: z.literal('descansar'), parametros: z.object({}).optional().default({}) }),
  z.object({ accion: z.literal('entrenar'), parametros: z.object({ tropa: z.string() }) }),
  z.object({ accion: z.literal('atacar'), parametros: z.object({ clan: z.coerce.number().int() }) }),
  z.object({ accion: z.literal('proponer_alianza'), parametros: z.object({ clan: z.coerce.number().int() }) }),
  z.object({
    accion: z.literal('responder_alianza'),
    parametros: z.object({ alianza: z.coerce.number().int(), respuesta: z.enum(['aceptar', 'rechazar']) }),
  }),
]);

export function validarOrden(datos) {
  const resultado = esquemaOrden.safeParse(datos ?? {});
  if (!resultado.success) {
    throw new ErrorDeJuego(primerMensajeDeZod(resultado), 400, 'ACCION_INVALIDA', camposDeZod(resultado));
  }
  return resultado.data;
}

// Todo lo que el rōnin puede hacer ahora mismo, con etiqueta.
export function accionesValidas(db, ronin, ahora = Date.now()) {
  return [
    ...accionesEra1(db, ronin),
    ...opcionesDeEntrenar(db, ronin),
    ...opcionesDeAlianza(db, ronin),
    ...opcionesDeAtaque(db, ronin, ahora),
  ];
}

function estadoDe(db, roninId) {
  const fila = db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId);
  return {
    ronin: serializarRonin(fila),
    recursos: obtenerRecursos(db, roninId),
    edificios: obtenerEdificios(db, roninId),
  };
}

// Ejecuta una orden ya validada. Devuelve el estado nuevo del rōnin y, cuando
// la orden toca a otro jugador, lo que hay que avisarle (`avisos`).
export function ejecutarOrden(db, roninId, cuerpo, ahora = Date.now()) {
  const orden = validarOrden(cuerpo);
  const fila = db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId);
  if (!fila) throw new ErrorDeJuego('Rōnin not found.', 404, 'RONIN_NO_ENCONTRADO');

  const ocupado = Boolean(fila.tarea_fin && fila.tarea_fin > ahora);
  const esTarea = ['recolectar', 'construir', 'descansar', 'entrenar', 'atacar'].includes(orden.accion);
  if (esTarea && ocupado) {
    throw new ErrorDeJuego('Your rōnin is already working on a task.', 409, 'RONIN_OCUPADO');
  }

  const avisos = [];
  let duracionMs = 0;
  let batalla = null;

  // Lo que eligió el maestro queda en el hilo, con la etiqueta del botón.
  const etiqueta = typeof cuerpo?.etiqueta === 'string' ? cuerpo.etiqueta : orden.accion;
  guardarLineaDelMaestro(db, roninId, etiqueta.slice(0, 80));
  const serializado = serializarRonin(fila);

  switch (orden.accion) {
    case 'recolectar':
    case 'construir':
    case 'descansar': {
      const r = ejecutarAccion(db, roninId, orden, ahora);
      const salida = mensajeDeSalida(db, serializado, orden);
      return { ...r, orden, avisos, batalla: null, salida };
    }
    case 'entrenar': {
      duracionMs = iniciarEntrenamiento(db, fila, orden.parametros.tropa, ahora).duracionMs;
      break;
    }
    case 'atacar': {
      const inicio = iniciarAtaque(db, fila, orden.parametros.clan, ahora);
      duracionMs = inicio.duracionMs;
      batalla = { atacante: serializarRonin(fila), defensor: inicio.defensor, llegada: inicio.llegada };
      avisos.push({ usuarioId: inicio.usuarioDefensor, mensaje: inicio.mensajeDefensor, roninId: inicio.defensor.id });
      break;
    }
    case 'proponer_alianza': {
      const r = proponerAlianza(db, fila, orden.parametros.clan);
      avisos.push({ usuarioId: r.usuarioOtro, mensaje: r.mensajeOtro, roninId: r.otro.id });
      break;
    }
    case 'responder_alianza': {
      const r = responderAlianza(db, fila, orden.parametros.alianza, orden.parametros.respuesta);
      avisos.push({ usuarioId: r.usuarioOtro, mensaje: r.mensajeOtro, roninId: r.otro.id });
      break;
    }
    default:
      throw new ErrorDeJuego('That action does not exist.', 400, 'ACCION_INVALIDA');
  }

  const salida = esTarea ? mensajeDeSalida(db, serializado, orden) : null;
  return { ...estadoDe(db, roninId), orden, duracionMs, avisos, batalla, salida };
}
