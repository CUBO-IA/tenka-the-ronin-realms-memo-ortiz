import { edificioPorTipo, obtenerRecursos } from './acciones.js';
import { mensajeDelRonin } from './agente.js';
import { enviarPush } from './push.js';
import { reglas } from './reglas.js';
import { serializarRonin } from './ronin.js';

export async function avanzarMundo(db, io = null, ahora = Date.now()) {
  const pendientes = db
    .prepare('SELECT * FROM ronin WHERE tarea IS NOT NULL AND tarea_fin <= ?')
    .all(ahora);

  const completados = [];

  for (const ronin of pendientes) {
    let tarea = null;
    try {
      tarea = JSON.parse(ronin.tarea);
    } catch {
      tarea = null;
    }

    if (!tarea) {
      db.prepare(
        'UPDATE ronin SET estado = ?, tarea = NULL, tarea_fin = NULL WHERE id = ?',
      ).run('despierto', ronin.id);
      continue;
    }

    let edificioActualizado = null;

    const resolver = db.transaction(() => {
      // 1. Aplicar resultado de la tarea
      if (tarea.accion === 'recolectar') {
        const recurso = tarea.parametros?.recurso;
        const def = reglas.recoleccion[recurso];
        if (def) {
          db.prepare(
            'UPDATE recursos SET cantidad = cantidad + ? WHERE ronin_id = ? AND tipo = ?',
          ).run(def.cantidad, ronin.id, recurso);
        }
      } else if (tarea.accion === 'construir') {
        const tipo = tarea.parametros?.edificio;
        const ed = edificioPorTipo(db, ronin.id, tipo);
        if (ed) {
          db.prepare(
            'UPDATE edificios SET progreso = 100, actualizado = ? WHERE id = ?',
          ).run(ahora, ed.id);

          edificioActualizado = db
            .prepare('SELECT id, tipo, etapa, progreso FROM edificios WHERE id = ?')
            .get(ed.id);
        }
      }

      // 2. Liberar al rōnin
      db.prepare(
        'UPDATE ronin SET estado = ?, tarea = NULL, tarea_fin = NULL WHERE id = ?',
      ).run('despierto', ronin.id);
    });

    resolver();

    const roninFila = db.prepare('SELECT * FROM ronin WHERE id = ?').get(ronin.id);
    const roninActualizado = serializarRonin(roninFila);
    const recursosActualizados = obtenerRecursos(db, ronin.id);
    // El rōnin le habla al maestro: con IA si responde, predefinido si no.
    const nuevoMensaje = await mensajeDelRonin(db, roninActualizado, 'fin_tarea', tarea);

    const resultado = {
      ronin: roninActualizado,
      tarea,
      recursos: recursosActualizados,
      edificio: edificioActualizado,
      mensaje: nuevoMensaje,
    };
    completados.push(resultado);

    // 3. Notificar en tiempo real por Socket.IO a la sala del usuario
    if (io) {
      const sala = `usuario:${ronin.usuario_id}`;
      io.to(sala).emit('ronin:actualizado', { ronin: roninActualizado });
      io.to(sala).emit('recursos:actualizados', {
        recursos: recursosActualizados,
      });
      if (edificioActualizado) {
        io.to(sala).emit('edificio:actualizado', {
          edificio: edificioActualizado,
        });
      }
      io.to(sala).emit('mensaje:nuevo', { mensaje: nuevoMensaje });
    }

    // Aviso al celular aunque esté bloqueado. No espera ni detiene el reloj.
    enviarPush(db, ronin.usuario_id, {
      titulo: `${roninActualizado.nombre} speaks`,
      cuerpo: nuevoMensaje.texto,
      url: '/m',
      tag: `ronin-${ronin.id}`,
    }).catch(() => {});
  }

  return completados;
}

export function iniciarReloj(db, io, intervaloMs = 1000) {
  let avanzando = false;
  const temporizador = setInterval(async () => {
    if (avanzando) return; // una llamada a la IA puede tardar más que un tic
    avanzando = true;
    try {
      await avanzarMundo(db, io);
    } catch (error) {
      console.error('[reloj] Error al avanzar el mundo:', error);
    } finally {
      avanzando = false;
    }
  }, intervaloMs);

  return {
    detener: () => clearInterval(temporizador),
  };
}
