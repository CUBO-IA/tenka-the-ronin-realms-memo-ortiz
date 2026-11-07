import { z } from 'zod';
import {
  edificiosDisponibles,
  etapaInfoEdificio,
  infoEdificio,
  recursosDeBando,
  recursosRecolectables,
  reglas,
  siguienteEtapa,
} from './reglas.js';
import { ErrorDeJuego, camposDeZod, primerMensajeDeZod } from './errores.js';
import { serializarRonin } from './ronin.js';

const ACCIONES_VALIDAS = ['recolectar', 'construir', 'descansar'];

const esquemaAccion = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('recolectar'),
    parametros: z.object({
      recurso: z.string({ error: 'Choose a resource to gather.' }),
    }),
  }),
  z.object({
    accion: z.literal('construir'),
    parametros: z.object({
      edificio: z.string({ error: 'Choose a building to construct.' }),
    }),
  }),
  z.object({
    accion: z.literal('descansar'),
    parametros: z.object({}).optional().default({}),
  }),
]);

export function validarAccion(datos) {
  const resultado = esquemaAccion.safeParse(datos ?? {});
  if (!resultado.success) {
    throw new ErrorDeJuego(
      primerMensajeDeZod(resultado),
      400,
      'ACCION_INVALIDA',
      camposDeZod(resultado),
    );
  }
  return resultado.data;
}

export function obtenerRecursos(db, roninId) {
  const filas = db.prepare('SELECT tipo, cantidad FROM recursos WHERE ronin_id = ?').all(roninId);
  const mapa = {};
  for (const fila of filas) {
    mapa[fila.tipo] = fila.cantidad;
  }
  return mapa;
}

export function obtenerEdificios(db, roninId) {
  return db
    .prepare('SELECT id, tipo, etapa, progreso FROM edificios WHERE ronin_id = ?')
    .all(roninId);
}

export function edificioPorTipo(db, roninId, tipo) {
  return (
    db
      .prepare('SELECT id, tipo, etapa, progreso FROM edificios WHERE ronin_id = ? AND tipo = ?')
      .get(roninId, tipo) || null
  );
}

export function ultimoMensaje(db, roninId) {
  const fila = db
    .prepare(
      "SELECT id, texto, opciones_json, creado, respondido, respuesta, de FROM mensajes WHERE ronin_id = ? AND de = 'ronin' ORDER BY id DESC LIMIT 1",
    )
    .get(roninId);
  if (!fila) return null;
  let opciones = [];
  try {
    opciones = JSON.parse(fila.opciones_json);
  } catch {
    opciones = [];
  }
  return {
    id: fila.id,
    texto: fila.texto,
    opciones,
    creado: fila.creado,
    respondido: Boolean(fila.respondido),
    respuesta: fila.respuesta,
    de: fila.de || 'ronin',
  };
}

// Un rōnin creado antes de que existieran los mensajes recibe el inicial al
// momento de consultarlo, así el celular siempre tiene opciones que ofrecer.
export function mensajeActual(db, ronin) {
  return ultimoMensaje(db, ronin.id) || crearMensajeInicial(db, ronin);
}

// Todas las acciones posibles ahora mismo, con etiqueta: lo que la IA puede
// elegir y lo que el celular puede ofrecer.
export function accionesValidas(db, ronin) {
  const bando = ronin.bando;
  const recursos = obtenerRecursos(db, ronin.id);
  const mapaEdificios = Object.fromEntries(obtenerEdificios(db, ronin.id).map((e) => [e.tipo, e.etapa]));
  const lista = [];

  for (const [tipo, def] of Object.entries(edificiosDisponibles(bando, ronin.era))) {
    const etapaActual = mapaEdificios[tipo] || null;
    const proxEtapa = siguienteEtapa(etapaActual);
    if (!proxEtapa) continue;
    const infoEtapa = def.etapas[proxEtapa];
    const alcanza = Object.entries(infoEtapa.costo).every(
      ([recurso, necesario]) => (recursos[recurso] || 0) >= necesario,
    );
    if (!alcanza) continue;
    const verbo = etapaActual ? 'Upgrade' : 'Build';
    const etapaTexto = proxEtapa === 'cimientos' ? 'foundation' : proxEtapa;
    lista.push({
      accion: 'construir',
      parametros: { edificio: tipo },
      etiqueta: `${verbo} ${def.etiqueta} (${etapaTexto})`,
    });
  }

  for (const recurso of recursosRecolectables(bando)) {
    lista.push({
      accion: 'recolectar',
      parametros: { recurso },
      etiqueta: `Gather ${reglas.recoleccion[recurso].etiqueta}`,
    });
  }

  lista.push({ accion: 'descansar', parametros: {}, etiqueta: 'Rest at the sanctuary' });
  return lista;
}

export function guardarMensaje(db, roninId, texto, opciones, proveedor = 'predefinido', de = 'ronin') {
  const ahora = Date.now();
  const esMaestro = de === 'maestro';
  const info = db
    .prepare(
      'INSERT INTO mensajes (ronin_id, texto, opciones_json, creado, respondido, leido, de) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(roninId, texto, JSON.stringify(opciones), ahora, esMaestro ? 1 : 0, esMaestro ? 1 : 0, de);
  return {
    id: Number(info.lastInsertRowid),
    texto,
    opciones,
    creado: ahora,
    respondido: esMaestro,
    respuesta: null,
    leido: esMaestro,
    de,
    proveedor,
  };
}

// Lo que dijo el maestro también queda en el hilo.
export function guardarLineaDelMaestro(db, roninId, texto) {
  return guardarMensaje(db, roninId, texto, [], 'maestro', 'maestro');
}

// Al arrancar una tarea el rōnin avisa qué va a hacer: instantáneo, sin IA.
const SALIDAS = {
  recolectar: ['On my way to gather {r}, master.', 'I go for the {r}. Back soon.', 'The {r}, then. I will not be long.'],
  construir: ['I take up the tools: the {e} will rise.', 'To the {e}, master. Stone by stone.', 'Working on the {e} now.'],
  descansar: ['I will rest a while by the fire.', 'A short rest, master. Then we continue.'],
  entrenar: ['Training a {t}. The sanctuary will be stronger by nightfall.', 'A new {t} joins us soon, master.'],
  atacar: ['We march at once, master. Keep the lantern lit.', 'The road is long; the blade is ready. We march.'],
};

export function mensajeDeSalida(db, ronin, tarea) {
  const inicial = ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
  const lista = SALIDAS[tarea?.accion] || ['As you command, master.'];
  const frase = lista[Math.floor(Math.random() * lista.length)];
  const recurso = reglas.recoleccion[tarea?.parametros?.recurso]?.etiqueta?.toLowerCase() || 'resources';
  const edificio = infoEdificio(ronin.bando, tarea?.parametros?.edificio)?.etiqueta || 'sanctuary';
  const tropa = reglas.conflicto.tropas[tarea?.parametros?.tropa]?.etiqueta?.toLowerCase() || 'warrior';
  const texto = `${frase.replace('{r}', recurso).replace('{e}', edificio).replace('{t}', tropa)} — ${inicial}.`;
  const mensaje = guardarMensaje(db, ronin.id, texto, []);
  db.prepare('UPDATE mensajes SET respondido = 1 WHERE id = ?').run(mensaje.id);
  mensaje.respondido = true;
  return mensaje;
}

// Mensaje sin IA para cada momento: inicio o fin de una tarea.
export function mensajePredefinido(db, ronin, momento, tarea = null) {
  if (momento === 'fin_tarea' && tarea) return crearMensajeFinTarea(db, ronin, tarea);
  if (momento === 'nueva_era') {
    const inicial = ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
    const texto =
      ronin.era >= 3
        ? `Master, the village is whole. Era ${ronin.era} begins: our sanctuary is a fortress now, and the island will remember our name. — ${inicial}.`
        : ronin.bando === 'sombra'
          ? `Master, the dark flame burns. The mist lifts from our land: Era ${ronin.era} begins, and the island can see us now. — ${inicial}.`
          : `Master, the altar flame is lit. The fog lifts from our sanctuary: Era ${ronin.era} begins, and the island can see us now. — ${inicial}.`;
    return guardarMensaje(db, ronin.id, texto, generarOpciones(db, ronin));
  }
  return crearMensajeInicial(db, ronin);
}

// Bandeja: los últimos mensajes del rōnin, del más nuevo al más viejo.
export function listarMensajes(db, roninId, limite = 20) {
  return db
    .prepare(
      'SELECT id, texto, opciones_json, creado, respondido, respuesta, leido, de FROM mensajes WHERE ronin_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(roninId, limite)
    .map((fila) => {
      let opciones = [];
      try {
        opciones = JSON.parse(fila.opciones_json);
      } catch {
        opciones = [];
      }
      return {
        id: fila.id,
        texto: fila.texto,
        opciones,
        creado: fila.creado,
        respondido: Boolean(fila.respondido),
        respuesta: fila.respuesta,
        leido: Boolean(fila.leido),
        de: fila.de || 'ronin',
      };
    });
}

export function contarNoLeidos(db, roninId) {
  return db.prepare("SELECT COUNT(*) AS n FROM mensajes WHERE ronin_id = ? AND leido = 0 AND de = 'ronin'").get(roninId).n;
}

export function marcarLeidos(db, roninId) {
  db.prepare('UPDATE mensajes SET leido = 1 WHERE ronin_id = ? AND leido = 0').run(roninId);
}

export function generarOpciones(db, ronin) {
  const bando = ronin.bando;
  const recursos = obtenerRecursos(db, ronin.id);
  const edificiosActuales = obtenerEdificios(db, ronin.id);
  const mapaEdificios = Object.fromEntries(edificiosActuales.map((e) => [e.tipo, e.etapa]));

  const opciones = [];
  const catalogoEdificios = edificiosDisponibles(bando, ronin.era);

  // 1. Opciones de construcción viables
  for (const [tipo, def] of Object.entries(catalogoEdificios)) {
    const etapaActual = mapaEdificios[tipo] || null;
    const proxEtapa = siguienteEtapa(etapaActual);
    if (!proxEtapa) continue; // Ya terminado

    const infoEtapa = def.etapas[proxEtapa];
    if (!infoEtapa) continue;

    // Verificar si alcanzan los recursos
    let alcanzable = true;
    for (const [recurso, necesario] of Object.entries(infoEtapa.costo)) {
      if ((recursos[recurso] || 0) < necesario) {
        alcanzable = false;
        break;
      }
    }

    if (alcanzable) {
      const verbo = etapaActual ? 'Upgrade' : 'Build';
      const etapaTexto = proxEtapa === 'cimientos' ? 'foundation' : proxEtapa;
      opciones.push({
        accion: 'construir',
        parametros: { edificio: tipo },
        etiqueta: `${verbo} ${def.etiqueta} (${etapaTexto})`,
      });
      if (opciones.length >= 2) break;
    }
  }

  // 2. Opciones de recolección para recursos faltantes o básicos
  const recolectables = recursosRecolectables(bando);
  for (const recurso of recolectables) {
    if (opciones.length >= 3) break;
    const def = reglas.recoleccion[recurso];
    opciones.push({
      accion: 'recolectar',
      parametros: { recurso },
      etiqueta: `Gather ${def.etiqueta}`,
    });
  }

  // 3. Descanso como opción de respaldo si faltan opciones
  if (opciones.length < 2) {
    opciones.push({
      accion: 'descansar',
      parametros: {},
      etiqueta: 'Rest at the sanctuary',
    });
  }

  return opciones.slice(0, 3);
}

export function crearMensajeInicial(db, ronin) {
  const inicial = ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
  const texto =
    ronin.bando === 'sombra'
      ? `Master, I have stepped into the mist. Shadows gather around us. What is your command? — ${inicial}.`
      : `Master, I have arrived at the sanctuary. The path is clear. What shall I do first? — ${inicial}.`;

  const opciones = generarOpciones(db, ronin);
  const ahora = Date.now();

  const info = db
    .prepare(
      'INSERT INTO mensajes (ronin_id, texto, opciones_json, creado, respondido) VALUES (?, ?, ?, ?, 0)',
    )
    .run(ronin.id, texto, JSON.stringify(opciones), ahora);

  return {
    id: Number(info.lastInsertRowid),
    texto,
    opciones,
    creado: ahora,
    respondido: false,
    respuesta: null,
  };
}

// Varias voces por momento, para que el rōnin no se repita cuando la IA no alcanza.
const VOCES = {
  luz: {
    recolectar: [
      'The {r} is gathered and stacked. What is our next step, master?',
      'Snow on my shoulders, {r} on my back. I await your word, master.',
      'The {r} is stored. The cedars watched me work in silence, master.',
    ],
    construir: [
      'Work on the {e} is complete. Shall we continue building, master?',
      'The {e} stands a little taller today. What next, master?',
      'My hands ache, but the {e} is done. Your command, master.',
    ],
    entrenar: ['A new {t} has joined our ranks, master. The sanctuary is stronger.'],
    descansar: ['I am rested and ready for your command, master.', 'The fire warmed me. I am ready, master.'],
  },
  sombra: {
    recolectar: [
      'The {r} is gathered from the marshes. What shall we claim next, master?',
      'The mist gave up its {r}. Tell me where to reach next, master.',
      'The {r} is ours. The lights in the swamp followed me home, master.',
    ],
    construir: [
      'The {e} rises through the dark mist. What shall we summon next?',
      'The {e} is done. The willows bow to it, master.',
      'Another stone for the {e}. Our shadow grows, master.',
    ],
    entrenar: ['A {t} answers our call, master. The marsh has one more guardian.'],
    descansar: ['The spirits whisper while we pause. Give me purpose, master.', 'I rested among the lanterns. Command me, master.'],
  },
};

function vozAlAzar(bando, momento, datos) {
  const lista = VOCES[bando]?.[momento] || VOCES.luz[momento] || ['I await your command, master.'];
  const frase = lista[Math.floor(Math.random() * lista.length)];
  return frase.replace('{r}', datos.r || 'resources').replace('{e}', datos.e || 'sanctuary').replace('{t}', datos.t || 'warrior');
}

export function crearMensajeFinTarea(db, ronin, tarea) {
  const inicial = ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
  const bando = ronin.bando;
  let texto = '';

  if (tarea.accion === 'recolectar') {
    const defRec = reglas.recoleccion[tarea.parametros?.recurso];
    texto = `${vozAlAzar(bando, 'recolectar', { r: defRec ? defRec.etiqueta.toLowerCase() : 'resources' })} — ${inicial}.`;
  } else if (tarea.accion === 'construir') {
    const defEd = infoEdificio(bando, tarea.parametros?.edificio);
    texto = `${vozAlAzar(bando, 'construir', { e: defEd ? defEd.etiqueta : 'structure' })} — ${inicial}.`;
  } else if (tarea.accion === 'entrenar') {
    const defTropa = reglas.conflicto.tropas[tarea.parametros?.tropa];
    texto = `${vozAlAzar(bando, 'entrenar', { t: defTropa ? defTropa.etiqueta.toLowerCase() : 'warrior' })} — ${inicial}.`;
  } else {
    texto = `${vozAlAzar(bando, 'descansar', {})} — ${inicial}.`;
  }

  const opciones = generarOpciones(db, ronin);
  const ahora = Date.now();

  const info = db
    .prepare(
      'INSERT INTO mensajes (ronin_id, texto, opciones_json, creado, respondido) VALUES (?, ?, ?, ?, 0)',
    )
    .run(ronin.id, texto, JSON.stringify(opciones), ahora);

  return {
    id: Number(info.lastInsertRowid),
    texto,
    opciones,
    creado: ahora,
    respondido: false,
    respuesta: null,
  };
}

// Cobra la parte del costo que corresponde al tiempo transcurrido. Devuelve
// los recursos nuevos si algo cambió; null si no había nada que cobrar.
export function cobrarConstruccion(db, ronin, ahora = Date.now()) {
  let tarea = null;
  try {
    tarea = JSON.parse(ronin.tarea);
  } catch {
    return null;
  }
  if (!tarea || tarea.accion !== 'construir' || !tarea.costo) return null;

  const total = Math.max(1, (tarea.fin || 0) - (tarea.inicio || 0));
  const fraccion = Math.max(0, Math.min(1, (ahora - (tarea.inicio || 0)) / total));
  const pagado = { ...(tarea.pagado || {}) };
  let cambio = false;

  const restar = db.prepare('UPDATE recursos SET cantidad = MAX(0, cantidad - ?) WHERE ronin_id = ? AND tipo = ?');
  for (const [recurso, costo] of Object.entries(tarea.costo)) {
    const debe = Math.floor(costo * fraccion);
    const delta = debe - (pagado[recurso] || 0);
    if (delta <= 0) continue;
    restar.run(delta, ronin.id, recurso);
    pagado[recurso] = debe;
    cambio = true;
  }
  if (!cambio) return null;

  db.prepare('UPDATE ronin SET tarea = ? WHERE id = ?').run(JSON.stringify({ ...tarea, pagado }), ronin.id);
  return obtenerRecursos(db, ronin.id);
}

export function ejecutarAccion(db, roninId, cuerpo, ahora = Date.now()) {
  const datos = validarAccion(cuerpo);
  const ronin = db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId);
  if (!ronin) {
    throw new ErrorDeJuego('Rōnin not found.', 404, 'RONIN_NO_ENCONTRADO');
  }

  // Comprobar si ya está ocupado
  if (ronin.tarea_fin && ronin.tarea_fin > ahora) {
    throw new ErrorDeJuego(
      'Your rōnin is already working on a task.',
      409,
      'RONIN_OCUPADO',
    );
  }

  const bando = ronin.bando;
  let duracionMs = 4000;
  let siguienteEtapaEdificio = null;
  let costoConstruccion = null;

  if (datos.accion === 'recolectar') {
    const recurso = datos.parametros.recurso;
    const recolectables = recursosRecolectables(bando);
    if (!recolectables.includes(recurso)) {
      throw new ErrorDeJuego(
        `Your faction cannot gather ${recurso}.`,
        400,
        'RECURSO_INVALIDO',
      );
    }
    const def = reglas.recoleccion[recurso];
    duracionMs = def.duracionMs;
  } else if (datos.accion === 'construir') {
    const tipo = datos.parametros.edificio;
    const def = infoEdificio(bando, tipo, ronin.era);
    if (!def) {
      throw new ErrorDeJuego(
        infoEdificio(bando, tipo)
          ? 'That building belongs to a later era.'
          : `That building is not available for the ${bando} path.`,
        400,
        'EDIFICIO_INVALIDO',
      );
    }

    const actual = edificioPorTipo(db, roninId, tipo);
    siguienteEtapaEdificio = siguienteEtapa(actual?.etapa);
    if (!siguienteEtapaEdificio) {
      throw new ErrorDeJuego(
        'This building is already complete.',
        400,
        'EDIFICIO_COMPLETO',
      );
    }

    const infoEtapa = def.etapas[siguienteEtapaEdificio];
    costoConstruccion = infoEtapa.costo;
    duracionMs = infoEtapa.duracionMs;

    // Verificar recursos
    const recursos = obtenerRecursos(db, roninId);
    for (const [rec, necesario] of Object.entries(costoConstruccion)) {
      if ((recursos[rec] || 0) < necesario) {
        throw new ErrorDeJuego(
          `Not enough ${rec} to build ${def.etiqueta}.`,
          400,
          'RECURSOS_INSUFICIENTES',
        );
      }
    }
  } else if (datos.accion === 'descansar') {
    duracionMs = reglas.descanso.duracionMs;
  }

  // La tarea guarda su costo: se va pagando mientras el rōnin trabaja (reloj).
  const tarea =
    datos.accion === 'construir'
      ? { ...datos, costo: costoConstruccion, pagado: {}, inicio: ahora, fin: ahora + duracionMs }
      : datos;

  // Ejecución transaccional
  const ejecutar = db.transaction(() => {
    if (datos.accion === 'construir') {
      const edificioExistente = edificioPorTipo(db, roninId, datos.parametros.edificio);
      if (!edificioExistente) {
        db.prepare(
          'INSERT INTO edificios (ronin_id, tipo, etapa, progreso, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(roninId, datos.parametros.edificio, 'cimientos', 0, ahora, ahora);
      } else {
        db.prepare(
          'UPDATE edificios SET etapa = ?, progreso = 0, actualizado = ? WHERE id = ?',
        ).run(siguienteEtapaEdificio, ahora, edificioExistente.id);
      }
    }

    // Actualizar rōnin
    const estado =
      datos.accion === 'recolectar'
        ? 'recolectando'
        : datos.accion === 'construir'
          ? 'construyendo'
          : 'descansando';

    db.prepare(
      'UPDATE ronin SET estado = ?, tarea = ?, tarea_fin = ? WHERE id = ?',
    ).run(estado, JSON.stringify(tarea), ahora + duracionMs, roninId);

    // Marcar último mensaje como respondido
    db.prepare(
      'UPDATE mensajes SET respondido = 1, respuesta = ? WHERE ronin_id = ? AND respondido = 0',
    ).run(datos.accion, roninId);
  });

  ejecutar();

  const roninActualizado = db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId);
  return {
    // Siempre serializado: el celular y la computadora leen `tareaFin`, no `tarea_fin`.
    ronin: serializarRonin(roninActualizado),
    recursos: obtenerRecursos(db, roninId),
    edificios: obtenerEdificios(db, roninId),
    duracionMs,
  };
}
