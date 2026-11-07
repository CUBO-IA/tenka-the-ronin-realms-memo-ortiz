// Catálogo de opciones para crear el rōnin (diseño, sección 2).
// Los identificadores están en español porque son código; las etiquetas van
// en inglés porque las ve el jugador.

// El hakama (pantalón) tiene cuatro colores, iguales para los dos bandos.
// La faja no se elige: queda como viene en el sprite de cada bando.
export const HAKAMAS = [
  { id: 'negro', etiqueta: 'Black', color: '#1b1a19' },
  { id: 'pizarra', etiqueta: 'Slate', color: '#3d4450' },
  { id: 'marron', etiqueta: 'Brown', color: '#4a3324' },
  { id: 'indigo_oscuro', etiqueta: 'Deep indigo', color: '#1f2a4d' },
];

export const TOCADOS = [
  { id: 'sombrero_paja', etiqueta: 'Straw hat' },
  { id: 'mono', etiqueta: 'Topknot' },
];

export const KAMON = [
  { id: 'grulla', etiqueta: 'Crane' },
  { id: 'glicina', etiqueta: 'Wisteria' },
  { id: 'mariposa', etiqueta: 'Butterfly' },
  { id: 'abanico', etiqueta: 'Fan' },
  { id: 'sakura', etiqueta: 'Cherry blossom' },
  { id: 'tomoe', etiqueta: 'Tomoe' },
  { id: 'libelula', etiqueta: 'Dragonfly' },
  { id: 'ola', etiqueta: 'Wave' },
  { id: 'arce', etiqueta: 'Maple' },
  { id: 'luna', etiqueta: 'Crescent moon' },
  { id: 'bambu', etiqueta: 'Bamboo' },
  { id: 'koi', etiqueta: 'Koi' },
];

export const BANDOS = [
  {
    id: 'luz',
    etiqueta: 'Light',
    lema: 'Snow, cedar and discipline.',
    acento: '#2b3a67',
    kimonos: [
      { id: 'indigo', etiqueta: 'Indigo', color: '#2f3f6b' },
      { id: 'carmesi', etiqueta: 'Crimson', color: '#9e2b2b' },
      { id: 'verde_bosque', etiqueta: 'Forest green', color: '#2f4f3e' },
      { id: 'ocre', etiqueta: 'Ochre', color: '#b07d2b' },
    ],
  },
  {
    id: 'sombra',
    etiqueta: 'Shadow',
    lema: 'Mist, willow and ambition.',
    acento: '#6e4b8f',
    kimonos: [
      { id: 'negro_violeta', etiqueta: 'Violet black', color: '#241b33' },
      { id: 'rojo_sangre', etiqueta: 'Blood red', color: '#7a1f24' },
      { id: 'gris_humo', etiqueta: 'Smoke gray', color: '#5b5a60' },
      { id: 'azul_medianoche', etiqueta: 'Midnight blue', color: '#1d2a4a' },
    ],
  },
];

export const idsBandos = BANDOS.map((bando) => bando.id);
export const idsHakamas = HAKAMAS.map((hakama) => hakama.id);
export const idsTocados = TOCADOS.map((tocado) => tocado.id);
export const idsKamon = KAMON.map((kamon) => kamon.id);

export function bandoPorId(id) {
  return BANDOS.find((bando) => bando.id === id) || null;
}

export function kimonoPorId(bandoId, kimonoId) {
  const bando = bandoPorId(bandoId);
  return bando ? bando.kimonos.find((kimono) => kimono.id === kimonoId) || null : null;
}

export function etiquetaDeBando(id) {
  const bando = bandoPorId(id);
  return bando ? bando.etiqueta : id;
}

// Lo que recibe el celular para dibujar la pantalla de creación.
export function catalogoPublico() {
  return {
    bandos: BANDOS,
    hakamas: HAKAMAS,
    tocados: TOCADOS,
    kamon: KAMON,
  };
}
