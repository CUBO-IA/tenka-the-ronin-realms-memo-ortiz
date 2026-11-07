// La isla: 12 territorios, 6 de la luz (este) y 6 de la sombra (oeste), y el
// Mercado del Cruce en el centro. Las posiciones son sobre el mapa de 1920x1080.

export const TERRITORIOS = [
  { id: 'sombra-1', bando: 'sombra', nombre: 'Willow Hollow', x: 396, y: 336 },
  { id: 'sombra-2', bando: 'sombra', nombre: 'Ashen Ridge', x: 672, y: 300 },
  { id: 'sombra-3', bando: 'sombra', nombre: 'Lantern Marsh', x: 300, y: 564 },
  { id: 'sombra-4', bando: 'sombra', nombre: 'Black Fen', x: 564, y: 504 },
  { id: 'sombra-5', bando: 'sombra', nombre: 'Drowned Grove', x: 396, y: 768 },
  { id: 'sombra-6', bando: 'sombra', nombre: 'Mist Shore', x: 672, y: 672 },
  { id: 'luz-1', bando: 'luz', nombre: 'Cedar Pass', x: 1212, y: 396 },
  { id: 'luz-2', bando: 'luz', nombre: 'Crane Fields', x: 1560, y: 360 },
  { id: 'luz-3', bando: 'luz', nombre: 'Frozen Lake', x: 1356, y: 600 },
  { id: 'luz-4', bando: 'luz', nombre: 'Pine Cove', x: 1680, y: 564 },
  { id: 'luz-5', bando: 'luz', nombre: 'South Slope', x: 1200, y: 816 },
  { id: 'luz-6', bando: 'luz', nombre: 'Snow Harbor', x: 1536, y: 768 },
];

export const MERCADO = { id: 'mercado', nombre: 'Crossroads Market', x: 1020, y: 576 };

export function territorioPorId(id) {
  return TERRITORIOS.find((t) => t.id === id) || null;
}

// El primer territorio libre del bando; null si la isla de ese lado está llena.
export function territorioLibre(db, bando) {
  const ocupados = new Set(
    db
      .prepare('SELECT territorio FROM ronin WHERE territorio IS NOT NULL')
      .all()
      .map((fila) => fila.territorio),
  );
  return TERRITORIOS.find((t) => t.bando === bando && !ocupados.has(t.id)) || null;
}

// Rōnin creados antes del mapa reciben su territorio al arrancar el servidor.
export function asignarTerritoriosFaltantes(db) {
  const sinTerritorio = db.prepare('SELECT id, bando FROM ronin WHERE territorio IS NULL ORDER BY id').all();
  for (const ronin of sinTerritorio) {
    const libre = territorioLibre(db, ronin.bando);
    if (!libre) break;
    db.prepare('UPDATE ronin SET territorio = ? WHERE id = ?').run(libre.id, ronin.id);
  }
  return sinTerritorio.length;
}
