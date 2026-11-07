// Todos los números del juego viven acá. Se ajustan jugando, no se reparten
// por otros archivos. Hito 1 solo usa los de sesión, PIN y emparejamiento;
// los recursos iniciales, costos y tiempos de la era 1 se definen aquí.
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
  recoleccion: {
    cedro: { cantidad: 15, duracionMs: 4000, etiqueta: 'Cedar wood' },
    piedra: { cantidad: 12, duracionMs: 4000, etiqueta: 'River stone' },
    hierro: { cantidad: 4, duracionMs: 6000, etiqueta: 'Iron sand' },
    sauce: { cantidad: 15, duracionMs: 4000, etiqueta: 'Dead willow' },
    lodo: { cantidad: 12, duracionMs: 4000, etiqueta: 'Black mire' },
    hongos: { cantidad: 4, duracionMs: 6000, etiqueta: 'Swamp mushrooms' },
    arroz: { cantidad: 10, duracionMs: 3000, etiqueta: 'Rice' },
  },
  descanso: {
    duracionMs: 4000,
  },
  etapas: ['cimientos', 'construccion', 'terminado'],
  edificiosEra1: {
    luz: {
      casa: {
        etiqueta: "Rōnin's House",
        etapas: {
          cimientos: { costo: { cedro: 15, piedra: 10 }, duracionMs: 4000 },
          construccion: { costo: { cedro: 20, piedra: 15 }, duracionMs: 6000 },
          terminado: { costo: { cedro: 25, piedra: 20, hierro: 2 }, duracionMs: 8000 },
        },
      },
      granero: {
        etiqueta: 'Granary',
        etapas: {
          cimientos: { costo: { cedro: 15, piedra: 10 }, duracionMs: 4000 },
          construccion: { costo: { cedro: 20, piedra: 15 }, duracionMs: 6000 },
          terminado: { costo: { cedro: 25, arroz: 15 }, duracionMs: 8000 },
        },
      },
      torii: {
        etiqueta: 'Torii Gate',
        etapas: {
          cimientos: { costo: { cedro: 10, piedra: 15 }, duracionMs: 4000 },
          construccion: { costo: { cedro: 20, piedra: 20 }, duracionMs: 6000 },
          terminado: { costo: { cedro: 25, piedra: 25, hierro: 3 }, duracionMs: 8000 },
        },
      },
      altar: {
        etiqueta: 'Altar of Light',
        etapas: {
          cimientos: { costo: { piedra: 20, hierro: 2 }, duracionMs: 5000 },
          construccion: { costo: { cedro: 20, piedra: 25, hierro: 3 }, duracionMs: 7000 },
          terminado: { costo: { cedro: 30, piedra: 30, hierro: 5 }, duracionMs: 10000 },
        },
      },
    },
    sombra: {
      choza: {
        etiqueta: "Rōnin's Shack",
        etapas: {
          cimientos: { costo: { sauce: 15, lodo: 10 }, duracionMs: 4000 },
          construccion: { costo: { sauce: 20, lodo: 15 }, duracionMs: 6000 },
          terminado: { costo: { sauce: 25, lodo: 20, hongos: 2 }, duracionMs: 8000 },
        },
      },
      pozo: {
        etiqueta: 'Well of Mist',
        etapas: {
          cimientos: { costo: { sauce: 15, lodo: 10 }, duracionMs: 4000 },
          construccion: { costo: { sauce: 20, lodo: 15 }, duracionMs: 6000 },
          terminado: { costo: { sauce: 25, arroz: 15 }, duracionMs: 8000 },
        },
      },
      circulo: {
        etiqueta: 'Circle of Stones',
        etapas: {
          cimientos: { costo: { sauce: 10, lodo: 15 }, duracionMs: 4000 },
          construccion: { costo: { sauce: 20, lodo: 20 }, duracionMs: 6000 },
          terminado: { costo: { sauce: 25, lodo: 25, hongos: 3 }, duracionMs: 8000 },
        },
      },
      altar: {
        etiqueta: 'Dark Altar',
        etapas: {
          cimientos: { costo: { lodo: 20, hongos: 2 }, duracionMs: 5000 },
          construccion: { costo: { sauce: 20, lodo: 25, hongos: 3 }, duracionMs: 7000 },
          terminado: { costo: { sauce: 30, lodo: 30, hongos: 5 }, duracionMs: 10000 },
        },
      },
    },
  },
};

export function recursosDeBando(bando) {
  if (bando === 'sombra') {
    return ['sauce', 'lodo', 'hongos', 'arroz', 'mon'];
  }
  return ['cedro', 'piedra', 'hierro', 'arroz', 'mon'];
}

export function recursosRecolectables(bando) {
  if (bando === 'sombra') {
    return ['sauce', 'lodo', 'hongos', 'arroz'];
  }
  return ['cedro', 'piedra', 'hierro', 'arroz'];
}

export function siguienteEtapa(etapaActual) {
  if (!etapaActual) return 'cimientos';
  if (etapaActual === 'cimientos') return 'construccion';
  if (etapaActual === 'construccion') return 'terminado';
  return null;
}

export function infoEdificio(bando, edificio) {
  return reglas.edificiosEra1[bando]?.[edificio] || null;
}

export function etapaInfoEdificio(bando, edificio, etapa) {
  const info = infoEdificio(bando, edificio);
  return info?.etapas?.[etapa] || null;
}
