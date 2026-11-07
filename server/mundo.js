// Lo que todos pueden ver del mapa: quién vive en cada territorio, su era, su
// estado y cuánto ha construido. Los recursos de cada uno son privados.

import { obtenerEdificios } from './acciones.js';
import { etiquetaDeBando } from './catalogo.js';
import { serializarRonin } from './ronin.js';
import { MERCADO, TERRITORIOS, territorioPorId } from './territorios.js';
import { alianzasActivas, tropasDe } from './conflicto.js';

export function resumenDeRonin(db, fila) {
  const territorio = territorioPorId(fila.territorio);
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    nombre: fila.nombre,
    bando: fila.bando,
    bandoEtiqueta: etiquetaDeBando(fila.bando),
    kamon: fila.kamon,
    tocado: fila.tocado,
    kimono: fila.kimono,
    hakama: fila.hakama,
    era: fila.era,
    estado: fila.estado,
    territorio: fila.territorio,
    territorioNombre: territorio?.nombre || null,
    x: territorio?.x ?? null,
    y: territorio?.y ?? null,
    edificios: obtenerEdificios(db, fila.id).map((e) => ({ tipo: e.tipo, etapa: e.etapa })),
    tropas: tropasDe(db, fila.id),
    escudoHasta: fila.escudo_hasta || null,
    bajoAtaque: estaBajoAtaque(db, fila.id),
  };
}

// Alguien marcha contra este santuario ahora mismo.
function estaBajoAtaque(db, roninId) {
  const filas = db.prepare("SELECT tarea FROM ronin WHERE estado = 'atacando' AND tarea IS NOT NULL").all();
  return filas.some((fila) => {
    try {
      return JSON.parse(fila.tarea)?.parametros?.clan === roninId;
    } catch {
      return false;
    }
  });
}

export function resumenPorId(db, roninId) {
  const fila = db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId);
  return fila ? resumenDeRonin(db, fila) : null;
}

export function resumenMundo(db) {
  const filas = db.prepare('SELECT * FROM ronin WHERE territorio IS NOT NULL ORDER BY id').all();
  return {
    territorios: TERRITORIOS,
    mercado: MERCADO,
    ronin: filas.map((fila) => resumenDeRonin(db, fila)),
    alianzas: alianzasActivas(db).map((a) => ({ a: a.clan_a, b: a.clan_b })),
  };
}

// El santuario de cualquier jugador, para verlo desde el mapa: sin recursos.
export function santuarioDe(db, roninId) {
  const fila = db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId);
  if (!fila) return null;
  const ronin = serializarRonin(fila);
  return {
    ronin: { ...ronin, tarea: null, tareaFin: null },
    edificios: obtenerEdificios(db, roninId),
    tropas: tropasDe(db, roninId),
    territorio: territorioPorId(fila.territorio),
  };
}
