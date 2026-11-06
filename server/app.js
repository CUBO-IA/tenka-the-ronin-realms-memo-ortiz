import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import QRCode from 'qrcode';
import { catalogoPublico } from './catalogo.js';
import { iniciarSesion } from './auth.js';
import { crearEmparejamiento, consumirEmparejamiento } from './emparejamiento.js';
import { ErrorDeJuego } from './errores.js';
import { crearRonin, roninDeUsuario } from './ronin.js';
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

function urlPublica(req) {
  const configurada = String(process.env.URL_PUBLICA || '').trim().replace(/\/+$/, '');
  if (configurada) return configurada;
  return `${req.protocol}://${req.get('host')}`;
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
      res.status(nuevo ? 201 : 200).json({
        usuario,
        ronin: roninDeUsuario(db, usuario.id),
      });
    }),
  );

  app.get('/api/yo', (req, res) => {
    if (!req.sesionComputadora) {
      return res.json({ usuario: null, ronin: null });
    }
    res.json({
      usuario: {
        id: req.sesionComputadora.usuarioId,
        nombre: req.sesionComputadora.nombre,
      },
      ronin: roninDeUsuario(db, req.sesionComputadora.usuarioId),
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
      res.json({
        usuario: { id: sesion.usuarioId, nombre: sesion.nombre },
        ronin: roninDeUsuario(db, sesion.usuarioId),
        opciones: catalogoPublico(),
      });
    }),
  );

  app.post(
    '/api/ronin',
    ruta((req, res) => {
      const sesion = exigirSesion(req, ESTADOS.movil);
      const ronin = crearRonin(db, sesion.usuarioId, req.body);
      emitirAUsuario(app, sesion.usuarioId, 'ronin:creado', { ronin });
      res.status(201).json({ ronin });
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
