import { edificioPorTipo, obtenerRecursos } from './acciones.js';
import { mensajeDelRonin } from './agente.js';
import { enviarPush } from './push.js';
import { resumenPorId } from './mundo.js';
import { efectosDeEdificios, resolverBatalla, sumarTropa, textosDeBatalla } from './conflicto.js';
import { cobrarConstruccion, guardarMensaje, obtenerEdificios } from './acciones.js';
import { reglas } from './reglas.js';
import { serializarRonin } from './ronin.js';

// Los aldeanos trabajan solos: cada tanto suman lo que produce su edificio.
let ultimaProduccion = 0;

export function producir(db, io = null, ahora = Date.now()) {
  if (ahora - ultimaProduccion < reglas.produccion.cadaMs) return [];
  ultimaProduccion = ahora;
  const producidos = [];
  for (const ronin of db.prepare('SELECT * FROM ronin WHERE era >= 2').all()) {
    const efectos = efectosDeEdificios(db, ronin);
    const entradas = Object.entries(efectos.produce);
    if (!entradas.length) continue;
    for (const [recurso, cantidad] of entradas) {
      db.prepare(
        `INSERT INTO recursos (ronin_id, tipo, cantidad) VALUES (?, ?, ?)
         ON CONFLICT(ronin_id, tipo) DO UPDATE SET cantidad = cantidad + excluded.cantidad`,
      ).run(ronin.id, recurso, cantidad);
    }
    const recursos = obtenerRecursos(db, ronin.id);
    producidos.push({ roninId: ronin.id, recursos });
    if (io) io.to(`usuario:${ronin.usuario_id}`).emit('recursos:actualizados', { recursos });
  }
  return producidos;
}

// Mientras construye, el costo se descuenta poco a poco y se ve bajar.
export function cobrarConstrucciones(db, io = null, ahora = Date.now()) {
  const construyendo = db
    .prepare("SELECT * FROM ronin WHERE estado = 'construyendo' AND tarea IS NOT NULL")
    .all();
  for (const ronin of construyendo) {
    const recursos = cobrarConstruccion(db, ronin, Math.min(ahora, ronin.tarea_fin || ahora));
    if (recursos && io) io.to(`usuario:${ronin.usuario_id}`).emit('recursos:actualizados', { recursos });
  }
}

export async function avanzarMundo(db, io = null, ahora = Date.now()) {
  producir(db, io, ahora);
  cobrarConstrucciones(db, io, ahora);
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
    let batalla = null;
    let nuevaEra = false;

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
        // Lo que falte del costo se paga al terminar, y la etapa deja su recompensa.
        cobrarConstruccion(db, ronin, tarea.fin || ahora);
        for (const [recurso, cantidad] of Object.entries(reglas.recompensaPorEtapa || {})) {
          db.prepare(
            `INSERT INTO recursos (ronin_id, tipo, cantidad) VALUES (?, ?, ?)
             ON CONFLICT(ronin_id, tipo) DO UPDATE SET cantidad = cantidad + excluded.cantidad`,
          ).run(ronin.id, recurso, cantidad);
        }
        const tipo = tarea.parametros?.edificio;
        const ed = edificioPorTipo(db, ronin.id, tipo);
        if (ed) {
          db.prepare(
            'UPDATE edificios SET progreso = 100, actualizado = ? WHERE id = ?',
          ).run(ahora, ed.id);

          edificioActualizado = db
            .prepare('SELECT id, tipo, etapa, progreso FROM edificios WHERE id = ?')
            .get(ed.id);

          // Con los cuatro edificios de la era 1 terminados, se enciende la
          // llama: era 2, y la niebla se levanta en el mapa.
          const terminados = obtenerEdificios(db, ronin.id).filter((e) => e.etapa === 'terminado').length;
          if (ronin.era === 1 && terminados >= 4) {
            db.prepare('UPDATE ronin SET era = 2 WHERE id = ?').run(ronin.id);
            nuevaEra = true;
          } else if (ronin.era === 2 && terminados >= 8) {
            // La aldea completa: era 3, la fortaleza.
            db.prepare('UPDATE ronin SET era = 3 WHERE id = ?').run(ronin.id);
            nuevaEra = true;
          }
        }
      } else if (tarea.accion === 'entrenar') {
        sumarTropa(db, ronin.id, tarea.parametros?.tropa, tarea.parametros?.cantidad || 1);
      }

      // 2. Liberar al rōnin
      db.prepare(
        'UPDATE ronin SET estado = ?, tarea = NULL, tarea_fin = NULL WHERE id = ?',
      ).run('despierto', ronin.id);
    });

    resolver();

    // La marcha llegó: se pelea en el santuario del defensor. El resultado
    // sale a las pantallas de inmediato; los mensajes con IA vienen después.
    if (tarea.accion === 'atacar') {
      batalla = resolverBatalla(db, ronin, tarea.parametros?.clan, ahora);
      if (batalla && io && typeof io.emit === 'function') io.emit('batalla:resultado', batalla);
    }

    const roninFila = db.prepare('SELECT * FROM ronin WHERE id = ?').get(ronin.id);
    const roninActualizado = serializarRonin(roninFila);
    const recursosActualizados = obtenerRecursos(db, ronin.id);

    // El rōnin le habla al maestro: con IA si responde, predefinido si no.
    let nuevoMensaje;
    if (batalla) {
      const textos = textosDeBatalla(batalla);
      nuevoMensaje = await mensajeDelRonin(db, roninActualizado, 'fin_batalla', tarea, {
        batalla: {
          parte: textos.atacante,
          resultado: batalla.ganador === 'atacante' ? 'we won' : 'we lost',
          contra: batalla.defensor.nombre,
          marcador: { ataque: batalla.ataque, defensa: batalla.defensa },
          desglose: batalla.desglose,
          botin: batalla.botin,
          edificio_danado: batalla.edificioDanado?.tipo || null,
          tropas_perdidas: batalla.tropasPerdidas,
        },
      });
      const mensajeDefensor = guardarMensaje(db, batalla.defensor.id, textos.defensor, []);
      if (io) {
        const salaDefensor = `usuario:${batalla.usuarioDefensor}`;
        io.to(salaDefensor).emit('mensaje:nuevo', { mensaje: mensajeDefensor });
        io.to(salaDefensor).emit('recursos:actualizados', { recursos: obtenerRecursos(db, batalla.defensor.id) });
        io.to(salaDefensor).emit('edificios:actualizados', { edificios: obtenerEdificios(db, batalla.defensor.id) });
        io.to(salaDefensor).emit('ronin:actualizado', { ronin: batalla.defensor });
        if (typeof io.emit === 'function') io.emit('mundo:ronin', { ronin: resumenPorId(db, batalla.defensor.id) });
      }
      enviarPush(db, batalla.usuarioDefensor, {
        titulo: `${batalla.defensor.nombre} speaks`,
        cuerpo: textos.defensor,
        url: '/m',
        tag: `ronin-${batalla.defensor.id}`,
      }).catch(() => {});
    } else if (nuevaEra) {
      nuevoMensaje = await mensajeDelRonin(db, roninActualizado, 'nueva_era', tarea);
    } else {
      nuevoMensaje = await mensajeDelRonin(db, roninActualizado, 'fin_tarea', tarea);
    }

    const resultado = {
      ronin: roninActualizado,
      tarea,
      recursos: recursosActualizados,
      edificio: edificioActualizado,
      mensaje: nuevoMensaje,
      batalla,
      nuevaEra,
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
      if (typeof io.emit === 'function') io.emit('mundo:ronin', { ronin: resumenPorId(db, ronin.id) });
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
