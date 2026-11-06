// Todos los números del juego viven acá. Se ajustan jugando, no se reparten
// por otros archivos. Hito 1 solo usa los de sesión, PIN y emparejamiento;
// los recursos iniciales quedan listos para el hito 2.
export const reglas = {
  sesion: {
    duracionComputadoraMs: 7 * 24 * 60 * 60 * 1000,
    duracionMovilMs: 30 * 24 * 60 * 60 * 1000,
  },
  emparejamiento: {
    // El token del QR vence en pocos minutos.
    vencimientoMs: 5 * 60 * 1000,
  },
  pin: {
    longitud: 4,
  },
  usuario: {
    nombreMin: 2,
    nombreMax: 24,
  },
  ronin: {
    nombreMin: 2,
    nombreMax: 20,
  },
  recursosIniciales: {
    luz: { cedro: 40, piedra: 30, hierro: 5, arroz: 30, mon: 10 },
    sombra: { sauce: 40, lodo: 30, hongos: 5, arroz: 30, mon: 10 },
  },
};
