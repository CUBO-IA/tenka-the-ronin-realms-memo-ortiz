import { tokenAleatorio } from './seguridad.js';
import { reglas } from './reglas.js';

export const COOKIE_COMPUTADORA = 'tenka_pc';
export const COOKIE_MOVIL = 'tenka_movil';

const COOKIES = {
  computadora: COOKIE_COMPUTADORA,
  movil: COOKIE_MOVIL,
};

export function leerCookies(cabecera = '') {
  const cookies = {};
  for (const parte of cabecera.split(';')) {
    const corte = parte.indexOf('=');
    if (corte < 0) continue;
    const nombre = parte.slice(0, corte).trim();
    const valor = parte.slice(corte + 1).trim();
    if (nombre) {
      try {
        cookies[nombre] = decodeURIComponent(valor);
      } catch {
        cookies[nombre] = valor;
      }
    }
  }
  return cookies;
}

export function crearSesion(db, usuarioId, tipo) {
  const ahora = Date.now();
  const duracion =
    tipo === 'computadora'
      ? reglas.sesion.duracionComputadoraMs
      : reglas.sesion.duracionMovilMs;

  const id = tokenAleatorio();
  db.prepare(
    'INSERT INTO sesiones (id, usuario_id, tipo, creada, vence) VALUES (?, ?, ?, ?, ?)',
  ).run(id, usuarioId, tipo, ahora, ahora + duracion);

  // Limpieza barata: las sesiones vencidas ya no sirven.
  db.prepare('DELETE FROM sesiones WHERE vence <= ?').run(ahora);

  return { id, vence: ahora + duracion };
}

export function obtenerSesion(db, id, tipo) {
  if (!id) return null;
  const ahora = Date.now();
  const fila = db
    .prepare(
      `SELECT s.id, s.usuario_id, s.vence, u.nombre
         FROM sesiones s
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id = ? AND s.tipo = ? AND s.vence > ?`,
    )
    .get(id, tipo, ahora);

  if (!fila) return null;
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    nombre: fila.nombre,
    vence: fila.vence,
  };
}

export function borrarSesion(db, id) {
  if (id) db.prepare('DELETE FROM sesiones WHERE id = ?').run(id);
}

export function nombreDeCookie(tipo) {
  return COOKIES[tipo];
}

export function opcionesDeCookie(req, tipo) {
  const maxAge =
    tipo === 'computadora'
      ? reglas.sesion.duracionComputadoraMs
      : reglas.sesion.duracionMovilMs;

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure),
    maxAge,
    path: '/',
  };
}
