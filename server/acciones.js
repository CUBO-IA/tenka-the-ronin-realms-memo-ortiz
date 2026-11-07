import { z } from 'zod';
import {
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
      'SELECT id, texto, opciones_json, creado, respondido, respuesta FROM mensajes WHERE ronin_id = ? ORDER BY id DESC LIMIT 1',
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

  for (const [tipo, def] of Object.entries(reglas.edificiosEra1[bando] || {})) {
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

export function guardarMensaje(db, roninId, texto, opciones, proveedor = 'predefinido') {
  const ahora = Date.now();
  const info = db
    .prepare(
      'INSERT INTO mensajes (ronin_id, texto, opciones_json, creado, respondido) VALUES (?, ?, ?, ?, 0)',
    )
    .run(roninId, texto, JSON.stringify(opciones), ahora);
  return {
    id: Number(info.lastInsertRowid),
    texto,
    opciones,
    creado: ahora,
    respondido: false,
    respuesta: null,
    proveedor,
  };
}

// Mensaje sin IA para cada momento: inicio o fin de una tarea.
export function mensajePredefinido(db, ronin, momento, tarea = null) {
  if (momento === 'fin_tarea' && tarea) return crearMensajeFinTarea(db, ronin, tarea);
  if (momento === 'nueva_era') {
    const inicial = ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
    const texto =
      ronin.bando === 'sombra'
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
      'SELECT id, texto, opciones_json, creado, respondido, respuesta, leido FROM mensajes WHERE ronin_id = ? ORDER BY id DESC LIMIT ?',
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
      };
    });
}

export function contarNoLeidos(db, roninId) {
  return db.prepare('SELECT COUNT(*) AS n FROM mensajes WHERE ronin_id = ? AND leido = 0').get(roninId).n;
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
  const catalogoEdificios = reglas.edificiosEra1[bando] || {};

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

export function crearMensajeFinTarea(db, ronin, tarea) {
  const inicial = ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
  const bando = ronin.bando;
  let texto = '';

  if (tarea.accion === 'recolectar') {
    const defRec = reglas.recoleccion[tarea.parametros?.recurso];
    const etiqueta = defRec ? defRec.etiqueta.toLowerCase() : 'resources';
    texto =
      bando === 'sombra'
        ? `The ${etiqueta} is gathered from the marshes. What shall we claim next, master? — ${inicial}.`
        : `The ${etiqueta} is gathered and stacked. What is our next step, master? — ${inicial}.`;
  } else if (tarea.accion === 'construir') {
    const defEd = infoEdificio(bando, tarea.parametros?.edificio);
    const etiqueta = defEd ? defEd.etiqueta : 'structure';
    texto =
      bando === 'sombra'
        ? `The ${etiqueta} rises through the dark mist. What shall we summon next? — ${inicial}.`
        : `Work on the ${etiqueta} is complete. Shall we continue building, master? — ${inicial}.`;
  } else {
    texto =
      bando === 'sombra'
        ? `The spirits whisper while we pause. Give me purpose, master. — ${inicial}.`
        : `I am rested and ready for your command, master. — ${inicial}.`;
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
    const def = infoEdificio(bando, tipo);
    if (!def) {
      throw new ErrorDeJuego(
        `That building is not available for the ${bando} path.`,
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

  // Ejecución transaccional
  const ejecutar = db.transaction(() => {
    // Si construye, descontar recursos al iniciar y crear registro si no existe
    if (datos.accion === 'construir') {
      const restarRecurso = db.prepare(
        'UPDATE recursos SET cantidad = cantidad - ? WHERE ronin_id = ? AND tipo = ?',
      );
      for (const [rec, cant] of Object.entries(costoConstruccion)) {
        restarRecurso.run(cant, roninId, rec);
      }

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
    ).run(estado, JSON.stringify(datos), ahora + duracionMs, roninId);

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
