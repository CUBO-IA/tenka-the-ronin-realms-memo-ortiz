import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import QRCode from 'qrcode';
import { catalogoPublico } from './catalogo.js';
import { iniciarSesion } from './auth.js';
import { crearEmparejamiento, consumirEmparejamiento } from './emparejamiento.js';
import { interpretarOrden, mensajeDelRonin } from './agente.js';
import { ejecutarOrden } from './ordenes.js';
import { enviarPush } from './push.js';
import { borrarSuscripcion, guardarSuscripcion, llavesVapid } from './push.js';
import { resumenMundo, resumenPorId, santuarioDe } from './mundo.js';
import { alianzasActivas } from './conflicto.js';
import { asignarTerritoriosFaltantes } from './territorios.js';
import { ErrorDeJuego } from './errores.js';
import { crearRonin, roninDeUsuario } from './ronin.js';
import {
  ejecutarAccion,
  obtenerEdificios,
  obtenerRecursos,
  mensajeActual,
  listarMensajes,
  contarNoLeidos,
  marcarLeidos,
} from './acciones.js';
import {
  COOKIE_COMPUTADORA,
  COOKIE_MOVIL,
  borrarSesion,
  crearSesion,
  nombreDeCookie,
  obtenerSesion,
  opcionesDeCookie,
} from './sesiones.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.resolve(AQUI, '..', 'public');

const ESTADOS = {
  computadora: 'computadora',
  movil: 'movil',
};

// Envuelve rutas async para que cualquier error llegue al manejador final.
function ruta(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function usuarioPublico(fila) {
  return fila ? { id: fila.id, nombre: fila.nombre } : null;
}

function emitirAUsuario(app, usuarioId, evento, datos) {
  const io = app.locals.io;
  if (!io) return;
  io.to(`usuario:${usuarioId}`).emit(evento, datos);
}

// Una orden puede tocar a otro jugador: alianza propuesta, respuesta o ataque.
function avisarAOtros(app, resultado) {
  const db = app.locals.db;
  for (const aviso of resultado.avisos || []) {
    emitirAUsuario(app, aviso.usuarioId, 'mensaje:nuevo', { mensaje: aviso.mensaje });
    emitirMundo(app, aviso.roninId);
    enviarPush(db, aviso.usuarioId, {
      titulo: 'Tenka',
      cuerpo: aviso.mensaje.texto,
      url: '/m',
      tag: `ronin-${aviso.roninId}`,
    }).catch(() => {});
  }
  const io = app.locals.io;
  if (resultado.batalla && io) io.emit('batalla:inicio', resultado.batalla);
  if (resultado.orden?.accion === 'responder_alianza' && io) {
    io.emit('mundo:alianzas', {
      alianzas: alianzasActivas(db).map((a) => ({ a: a.clan_a, b: a.clan_b })),
    });
  }
}

// Lo que cambia en un santuario se ve en el mapa de todas las computadoras.
function emitirMundo(app, roninId) {
  const io = app.locals.io;
  if (!io) return;
  const resumen = resumenPorId(app.locals.db, roninId);
  if (resumen) io.emit('mundo:ronin', { ronin: resumen });
}

// El QR no puede apuntar a localhost: el celular lo abriría en su propia memoria.
// Si la computadora se abrió como localhost, se usa la IP de la red local.
function prioridadDeInterfaz(nombre) {
  if (nombre === 'en0') return 0;
  if (nombre === 'en1') return 1;
  if (nombre === 'eth0') return 2;
  if (/^(utun|bridge|awdl|llw|tun|tap|gif|stf)/i.test(nombre)) return 9;
  return 5;
}

export function ipLocal() {
  const redes = os.networkInterfaces();
  const nombres = Object.keys(redes).sort(
    (a, b) => prioridadDeInterfaz(a) - prioridadDeInterfaz(b) || a.localeCompare(b),
  );

  for (const nombre of nombres) {
    for (const info of redes[nombre] || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      return info.address;
    }
  }
  return null;
}

export function esHostLocal(host = '') {
  let nombre = String(host).toLowerCase();
  try {
    nombre = new URL(`http://${nombre}`).hostname;
  } catch {
    // Si no se puede leer, se compara el texto tal cual.
  }
  return nombre === 'localhost' || nombre === '127.0.0.1' || nombre === '::1' || nombre === '[::1]';
}

function puertoDe(host) {
  try {
    return new URL(`http://${host}`).port;
  } catch {
    return '';
  }
}

export function basePublica({
  protocolo = 'http',
  host = '',
  urlPublica: configurada = process.env.URL_PUBLICA,
  ip = ipLocal(),
} = {}) {
  const limpia = String(configurada || '').trim().replace(/\/+$/, '');
  if (limpia) return limpia;

  if (esHostLocal(host) && ip) {
    const puerto = puertoDe(host);
    return `${protocolo}://${ip}${puerto ? `:${puerto}` : ''}`;
  }

  return `${protocolo}://${host}`;
}

function urlPublica(req) {
  return basePublica({
    protocolo: req.protocol,
    host: req.get('host') || '',
  });
}

function sesionDe(req, tipo) {
  return tipo === ESTADOS.computadora ? req.sesionComputadora : req.sesionMovil;
}

function exigirSesion(req, tipo) {
  const sesion = sesionDe(req, tipo);
  if (!sesion) {
    throw tipo === ESTADOS.computadora
      ? new ErrorDeJuego('Sign in from the computer first.', 401, 'SIN_SESION')
      : new ErrorDeJuego(
          'Open the pairing seal from your computer to link this phone.',
          401,
          'SIN_SESION_MOVIL',
        );
  }
  return sesion;
}

export function crearApp({ db }) {
  const app = express();
  app.locals.db = db;
  asignarTerritoriosFaltantes(db);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  // Deja las dos sesiones disponibles en cada pedido.
  app.use((req, res, next) => {
    req.sesionComputadora = obtenerSesion(
      db,
      req.cookies?.[COOKIE_COMPUTADORA],
      ESTADOS.computadora,
    );
    req.sesionMovil = obtenerSesion(db, req.cookies?.[COOKIE_MOVIL], ESTADOS.movil);
    next();
  });

  // ---------- Pantallas ----------

  app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLICO, 'index.html'));
  });

  // El QR trae el token acá. Se canjea una sola vez y deja la sesión del celular.
  app.get(
    '/m',
    ruta((req, res) => {
      const token = typeof req.query.t === 'string' ? req.query.t : '';

      if (token) {
        const canje = consumirEmparejamiento(db, token);
        if (canje) {
          const sesion = crearSesion(db, canje.usuarioId, ESTADOS.movil);
          res.cookie(COOKIE_MOVIL, sesion.id, opcionesDeCookie(req, ESTADOS.movil));

          const usuario = db
            .prepare('SELECT id, nombre FROM usuarios WHERE id = ?')
            .get(canje.usuarioId);
          emitirAUsuario(app, canje.usuarioId, 'emparejamiento:usado', {
            usuario: usuarioPublico(usuario),
          });
          return res.redirect(302, '/m');
        }

        // Si este celular ya tenía sesión, el token viejo no lo deja afuera.
        if (req.sesionMovil) return res.redirect(302, '/m');
        return res.status(410).sendFile(path.join(PUBLICO, 'm', 'enlace-invalido.html'));
      }

      res.sendFile(path.join(PUBLICO, 'm', 'index.html'));
    }),
  );

  app.use(express.static(PUBLICO, { index: false, maxAge: 0 }));

  // ---------- API ----------

  app.get('/api/salud', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/opciones', (req, res) => {
    res.json(catalogoPublico());
  });

  // Entrar o crear la cuenta desde la computadora.
  app.post(
    '/api/sesion',
    ruta((req, res) => {
      const { usuario, nuevo } = iniciarSesion(db, req.body);
      const sesion = crearSesion(db, usuario.id, ESTADOS.computadora);
      res.cookie(
        COOKIE_COMPUTADORA,
        sesion.id,
        opcionesDeCookie(req, ESTADOS.computadora),
      );
      const ronin = roninDeUsuario(db, usuario.id);
      res.status(nuevo ? 201 : 200).json({
        usuario,
        ronin,
        ...(ronin
          ? {
              recursos: obtenerRecursos(db, ronin.id),
              edificios: obtenerEdificios(db, ronin.id),
              mensaje: mensajeActual(db, ronin),
            }
          : {}),
      });
    }),
  );

  app.get('/api/yo', (req, res) => {
    if (!req.sesionComputadora) {
      return res.json({ usuario: null, ronin: null });
    }
    const ronin = roninDeUsuario(db, req.sesionComputadora.usuarioId);
    res.json({
      usuario: {
        id: req.sesionComputadora.usuarioId,
        nombre: req.sesionComputadora.nombre,
      },
      ronin,
      ...(ronin
        ? {
            recursos: obtenerRecursos(db, ronin.id),
            edificios: obtenerEdificios(db, ronin.id),
            mensaje: mensajeActual(db, ronin),
          }
        : {}),
    });
  });

  app.delete('/api/sesion', (req, res) => {
    if (req.sesionComputadora) borrarSesion(db, req.sesionComputadora.id);
    res.clearCookie(COOKIE_COMPUTADORA, { path: '/' });
    res.json({ ok: true });
  });

  // Dibuja un sello nuevo: token de un solo uso + imagen del QR.
  app.post(
    '/api/emparejamiento',
    ruta(async (req, res) => {
      const sesion = exigirSesion(req, ESTADOS.computadora);
      const { token, vence } = crearEmparejamiento(db, sesion.usuarioId);
      const url = `${urlPublica(req)}/m?t=${encodeURIComponent(token)}`;

      const qr = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 440,
        color: { dark: '#1c1b19', light: '#f4ecd8' },
      });

      res.json({ url, qr, vence });
    }),
  );

  app.get(
    '/api/yo-movil',
    ruta((req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = roninDeUsuario(db, sesion.usuarioId);
      res.json({
        usuario: { id: sesion.usuarioId, nombre: sesion.nombre },
        ronin,
        ...(ronin
          ? {
              recursos: obtenerRecursos(db, ronin.id),
              edificios: obtenerEdificios(db, ronin.id),
              mensaje: mensajeActual(db, ronin),
              noLeidos: contarNoLeidos(db, ronin.id),
            }
          : {}),
        opciones: catalogoPublico(),
      });
    }),
  );

  app.post(
    '/api/ronin',
    ruta(async (req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = crearRonin(db, sesion.usuarioId, req.body);
      const mensaje = await mensajeDelRonin(db, ronin, 'inicio');
      const recursos = obtenerRecursos(db, ronin.id);
      const edificios = obtenerEdificios(db, ronin.id);

      emitirAUsuario(app, sesion.usuarioId, 'ronin:creado', {
        ronin,
        recursos,
        edificios,
        mensaje,
      });
      emitirMundo(app, ronin.id);
      res.status(201).json({ ronin, recursos, edificios, mensaje });
    }),
  );

  // Ejecución de órdenes de la era 1 desde el celular
  app.post(
    '/api/acciones',
    ruta((req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = roninDeUsuario(db, sesion.usuarioId);
      if (!ronin) {
        throw new ErrorDeJuego('Awaken your rōnin first.', 404, 'RONIN_NO_ENCONTRADO');
      }

      const resultado = ejecutarOrden(db, ronin.id, req.body);
      avisarAOtros(app, resultado);
      if (resultado.salida) {
        emitirAUsuario(app, sesion.usuarioId, 'mensaje:nuevo', { mensaje: resultado.salida, salida: true });
      }
      emitirAUsuario(app, sesion.usuarioId, 'ronin:actualizado', {
        ronin: resultado.ronin,
      });
      emitirAUsuario(app, sesion.usuarioId, 'recursos:actualizados', {
        recursos: resultado.recursos,
      });
      if (resultado.edificios) {
        emitirAUsuario(app, sesion.usuarioId, 'edificios:actualizados', {
          edificios: resultado.edificios,
        });
      }
      emitirMundo(app, ronin.id);

      res.status(200).json(resultado);
    }),
  );

  // El mapa vivo: todos los santuarios, y el de cualquier jugador para visitarlo.
  app.get(
    '/api/mundo',
    ruta((req, res) => {
      exigirSesion(req, ESTADOS.computadora);
      res.json(resumenMundo(db));
    }),
  );

  app.get(
    '/api/santuario/:id',
    ruta((req, res) => {
      exigirSesion(req, ESTADOS.computadora);
      const santuario = santuarioDe(db, Number(req.params.id));
      if (!santuario) {
        throw new ErrorDeJuego('That sanctuary does not exist.', 404, 'SANTUARIO_NO_ENCONTRADO');
      }
      res.json(santuario);
    }),
  );

  // Bandeja del celular: historial y marcar como leído.
  app.get(
    '/api/mensajes',
    ruta((req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = roninDeUsuario(db, sesion.usuarioId);
      if (!ronin) {
        throw new ErrorDeJuego('Awaken your rōnin first.', 404, 'RONIN_NO_ENCONTRADO');
      }
      res.json({
        mensajes: listarMensajes(db, ronin.id, 30),
        noLeidos: contarNoLeidos(db, ronin.id),
      });
    }),
  );

  app.post(
    '/api/mensajes/leidos',
    ruta((req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = roninDeUsuario(db, sesion.usuarioId);
      if (ronin) marcarLeidos(db, ronin.id);
      res.json({ ok: true, noLeidos: 0 });
    }),
  );

  // Push: la llave pública para suscribirse y el registro del celular.
  app.get('/api/push/clave', (req, res) => {
    res.json({ clave: llavesVapid(db).publica });
  });

  app.post(
    '/api/push/suscribir',
    ruta((req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      if (!guardarSuscripcion(db, sesion.usuarioId, req.body)) {
        throw new ErrorDeJuego('That subscription is not valid.', 400, 'SUSCRIPCION_INVALIDA');
      }
      res.status(201).json({ ok: true });
    }),
  );

  app.delete(
    '/api/push/suscribir',
    ruta((req, res) => {
      exigirSesion(req, ESTADOS.movil);
      if (typeof req.body?.endpoint === 'string') borrarSuscripcion(db, req.body.endpoint);
      res.json({ ok: true });
    }),
  );

  // Orden libre por texto: la IA la convierte en una acción válida y, si el
  // rōnin está libre, la ejecuta. El texto del maestro entra al prompt como dato.
  app.post(
    '/api/orden-texto',
    ruta(async (req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = roninDeUsuario(db, sesion.usuarioId);
      if (!ronin) {
        throw new ErrorDeJuego('Awaken your rōnin first.', 404, 'RONIN_NO_ENCONTRADO');
      }

      const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
      if (texto.length < 2) {
        throw new ErrorDeJuego('Say something to your rōnin.', 400, 'ORDEN_VACIA');
      }

      const resultado = await interpretarOrden(db, ronin, texto.slice(0, 300));
      avisarAOtros(app, { ...resultado, orden: resultado.accion });

      if (resultado.ronin) {
        emitirAUsuario(app, sesion.usuarioId, 'ronin:actualizado', { ronin: resultado.ronin });
        emitirAUsuario(app, sesion.usuarioId, 'recursos:actualizados', {
          recursos: resultado.recursos,
        });
        emitirAUsuario(app, sesion.usuarioId, 'edificios:actualizados', {
          edificios: resultado.edificios,
        });
      }
      emitirAUsuario(app, sesion.usuarioId, 'mensaje:nuevo', { mensaje: resultado.mensaje });
      if (resultado.ronin) emitirMundo(app, ronin.id);

      res.json(resultado);
    }),
  );

  // Cualquier otra ruta de la API responde en JSON, no con HTML.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'That request does not exist.', codigo: 'NO_ENCONTRADO' });
  });

  app.use((error, req, res, next) => {
    if (error instanceof ErrorDeJuego) {
      return res.status(error.estado).json({
        error: error.message,
        codigo: error.codigo,
        ...(error.campos ? { campos: error.campos } : {}),
      });
    }

    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      return res.status(400).json({
        error: 'The request could not be read.',
        codigo: 'PETICION_INVALIDA',
      });
    }

    console.error('[tenka]', error);
    res.status(500).json({
      error: 'Something went wrong on the server.',
      codigo: 'ERROR_INTERNO',
    });
  });

  // Nombres de cookie accesibles para las pruebas y el socket.
  app.locals.cookies = { computadora: COOKIE_COMPUTADORA, movil: COOKIE_MOVIL };
  app.locals.nombreDeCookie = nombreDeCookie;

  return app;
}

export { PUBLICO };
