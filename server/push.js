// Notificaciones push al celular (Web Push con llaves VAPID).
// Si no hay llaves en .env, se generan una vez y se guardan en la base para
// que no cambien entre reinicios. Si un celular ya no existe, se olvida solo.

import webpushReal from 'web-push';

let webpush = webpushReal;
let llaves = null;

export function configurarPush({ webpush: implementacion } = {}) {
  if (implementacion) webpush = implementacion;
  llaves = null;
}

function leerConfig(db, clave) {
  return db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave)?.valor || null;
}

function guardarConfig(db, clave, valor) {
  db.prepare('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)').run(clave, valor);
}

export function llavesVapid(db, env = process.env) {
  if (llaves) return llaves;

  let publica = env.VAPID_PUBLICA || leerConfig(db, 'vapid_publica');
  let privada = env.VAPID_PRIVADA || leerConfig(db, 'vapid_privada');

  if (!publica || !privada) {
    const nuevas = webpush.generateVAPIDKeys();
    publica = nuevas.publicKey;
    privada = nuevas.privateKey;
    guardarConfig(db, 'vapid_publica', publica);
    guardarConfig(db, 'vapid_privada', privada);
  }

  webpush.setVapidDetails('mailto:memo@dreamtide.co', publica, privada);
  llaves = { publica, privada };
  return llaves;
}

export function guardarSuscripcion(db, usuarioId, suscripcion) {
  const endpoint = suscripcion?.endpoint;
  const keys = suscripcion?.keys;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !keys?.p256dh || !keys?.auth) {
    return false;
  }
  db.prepare(
    `INSERT INTO suscripciones_push (usuario_id, endpoint, llaves_json, creado)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, llaves_json = excluded.llaves_json`,
  ).run(usuarioId, endpoint, JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }), Date.now());
  return true;
}

export function borrarSuscripcion(db, endpoint) {
  db.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?').run(endpoint);
}

export function suscripcionesDe(db, usuarioId) {
  return db
    .prepare('SELECT endpoint, llaves_json FROM suscripciones_push WHERE usuario_id = ?')
    .all(usuarioId)
    .map((fila) => ({ endpoint: fila.endpoint, keys: JSON.parse(fila.llaves_json) }));
}

// Manda el aviso a todos los celulares del usuario. Nunca lanza: el juego
// sigue aunque el servicio de push falle.
export async function enviarPush(db, usuarioId, carga) {
  const destinos = suscripcionesDe(db, usuarioId);
  if (!destinos.length) return 0;

  llavesVapid(db);
  let enviados = 0;
  for (const destino of destinos) {
    try {
      await webpush.sendNotification(destino, JSON.stringify(carga), { TTL: 60 * 60 });
      enviados += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        borrarSuscripcion(db, destino.endpoint);
      } else {
        console.warn(`[push] no se pudo avisar: ${error?.message || error}`);
      }
    }
  }
  return enviados;
}
