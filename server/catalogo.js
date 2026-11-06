// Catálogo de opciones para crear el rōnin (diseño, sección 2).
// Los identificadores están en español porque son código; las etiquetas van
// en inglés porque las ve el jugador.

export const FAJAS = [
  { id: 'blanco', etiqueta: 'White', color: '#e8e0cc' },
  { id: 'negro', etiqueta: 'Black', color: '#1b1a19' },
  { id: 'dorado', etiqueta: 'Gold', color: '#c39b3a' },
  { id: 'bermellon', etiqueta: 'Vermilion', color: '#b33a24' },
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
      { id: 'gris_ceniza', etiqueta: 'Ash gray', color: '#8b8d8c' },
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
      { id: 'hueso', etiqueta: 'Bone', color: '#d8cfb8' },
    ],
  },
];

export const idsBandos = BANDOS.map((bando) => bando.id);
export const idsFajas = FAJAS.map((faja) => faja.id);
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
    fajas: FAJAS,
    tocados: TOCADOS,
    kamon: KAMON,
  };
}
