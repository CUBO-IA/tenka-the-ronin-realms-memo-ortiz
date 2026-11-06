import { hashDeToken, tokenAleatorio } from './seguridad.js';
import { reglas } from './reglas.js';

// Crea un token de un solo uso para el QR. Invalida los anteriores sin usar.
export function crearEmparejamiento(db, usuarioId) {
  const ahora = Date.now();
  const token = tokenAleatorio();
  const vence = ahora + reglas.emparejamiento.vencimientoMs;

  const crear = db.transaction(() => {
    db.prepare(
      'UPDATE emparejamientos SET vence = 0 WHERE usuario_id = ? AND usado = 0',
    ).run(usuarioId);

    db.prepare(
      `INSERT INTO emparejamientos (token_hash, usuario_id, creado, vence, usado)
       VALUES (?, ?, ?, ?, 0)`,
    ).run(hashDeToken(token), usuarioId, ahora, vence);
  });

  crear();
  return { token, vence };
}

// Canjea el token una sola vez. Devuelve el usuario dueño o null.
export function consumirEmparejamiento(db, token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;

  const fila = db
    .prepare(
      `UPDATE emparejamientos
          SET usado = 1
        WHERE token_hash = ? AND usado = 0 AND vence > ?
        RETURNING usuario_id`,
    )
    .get(hashDeToken(token), Date.now());

  return fila ? { usuarioId: fila.usuario_id } : null;
}
