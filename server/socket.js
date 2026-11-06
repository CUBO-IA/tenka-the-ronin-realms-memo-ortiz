import { COOKIE_COMPUTADORA, COOKIE_MOVIL, leerCookies, obtenerSesion } from './sesiones.js';

// El socket entra con la misma cookie httpOnly que la web. El celular y la
// computadora del mismo usuario comparten una sala, así el mundo se entera
// de lo que pasa en el otro lado.
export function configurarSocket(io, db) {
  io.use((socket, next) => {
    const cookies = leerCookies(socket.handshake.headers.cookie || '');
    const computadora = obtenerSesion(
      db,
      cookies[COOKIE_COMPUTADORA],
      'computadora',
    );
    const movil = computadora
      ? null
      : obtenerSesion(db, cookies[COOKIE_MOVIL], 'movil');
    const sesion = computadora || movil;

    if (!sesion) return next(new Error('SIN_SESION'));

    socket.data.sesion = sesion;
    socket.data.tipo = computadora ? 'computadora' : 'movil';
    next();
  });

  io.on('connection', (socket) => {
    const { usuarioId, nombre } = socket.data.sesion;
    socket.join(`usuario:${usuarioId}`);
    socket.emit('conectado', {
      usuario: { id: usuarioId, nombre },
      tipo: socket.data.tipo,
    });
  });
}
