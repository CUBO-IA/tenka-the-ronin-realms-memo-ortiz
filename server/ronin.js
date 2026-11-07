import { z } from 'zod';
import { reglas } from './reglas.js';
import {
  bandoPorId,
  etiquetaDeBando,
  idsBandos,
  idsHakamas,
  idsKamon,
  idsTocados,
  kimonoPorId,
} from './catalogo.js';
import { ErrorDeJuego, camposDeZod, primerMensajeDeZod } from './errores.js';

const esquemaRonin = z.object({
  nombre: z
    .string({ error: 'Name your rōnin.' })
    .trim()
    .min(reglas.ronin.nombreMin, `Name must be at least ${reglas.ronin.nombreMin} characters.`)
    .max(reglas.ronin.nombreMax, `Name must be at most ${reglas.ronin.nombreMax} characters.`)
    .regex(
      /^[\p{L}\p{N} ._'’-]+$/u,
      'Name can only contain letters, numbers, spaces, dots, dashes and apostrophes.',
    ),
  bando: z.enum(idsBandos, { error: 'Choose the path of Light or Shadow.' }),
  kimono: z.string({ error: 'Choose a kimono color.' }),
  hakama: z.enum(idsHakamas, { error: 'Choose a hakama color.' }),
  tocado: z.enum(idsTocados, { error: 'Choose straw hat or topknot.' }),
  kamon: z.enum(idsKamon, { error: 'Choose a clan crest.' }),
});

const esquemaCompleto = esquemaRonin.superRefine((datos, ctx) => {
  if (!kimonoPorId(datos.bando, datos.kimono)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['kimono'],
      message: 'That kimono color does not belong to the chosen path.',
    });
  }
});

export function validarRonin(datos) {
  const resultado = esquemaCompleto.safeParse(datos ?? {});
  if (!resultado.success) {
    throw new ErrorDeJuego(
      primerMensajeDeZod(resultado),
      400,
      'DATOS_INVALIDOS',
      camposDeZod(resultado),
    );
  }
  return resultado.data;
}

export function serializarRonin(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    bando: fila.bando,
    bandoEtiqueta: etiquetaDeBando(fila.bando),
    kimono: fila.kimono,
    hakama: fila.hakama,
    tocado: fila.tocado,
    kamon: fila.kamon,
    territorio: fila.territorio,
    era: fila.era,
    estado: fila.estado,
    tarea: fila.tarea,
    tareaFin: fila.tarea_fin,
    creado: fila.creado,
  };
}

export function roninDeUsuario(db, usuarioId) {
  const fila = db.prepare('SELECT * FROM ronin WHERE usuario_id = ?').get(usuarioId);
  return serializarRonin(fila);
}

export function crearRonin(db, usuarioId, datos) {
  const limpio = validarRonin(datos);

  const existente = db
    .prepare('SELECT id FROM ronin WHERE usuario_id = ?')
    .get(usuarioId);
  if (existente) {
    throw new ErrorDeJuego(
      'Your rōnin is already awake.',
      409,
      'RONIN_EXISTENTE',
    );
  }

  const ahora = Date.now();
  const bando = bandoPorId(limpio.bando);

  const crear = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO ronin
           (usuario_id, nombre, bando, kimono, hakama, tocado, kamon, era, estado, creado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'despierto', ?)`,
      )
      .run(
        usuarioId,
        limpio.nombre,
        limpio.bando,
        limpio.kimono,
        limpio.hakama,
        limpio.tocado,
        limpio.kamon,
        ahora,
      );

    const roninId = Number(info.lastInsertRowid);
    const insertarRecurso = db.prepare(
      'INSERT INTO recursos (ronin_id, tipo, cantidad) VALUES (?, ?, ?)',
    );
    const iniciales = reglas.recursosIniciales[bando.id] || {};
    for (const [tipo, cantidad] of Object.entries(iniciales)) {
      insertarRecurso.run(roninId, tipo, cantidad);
    }
    return roninId;
  });

  try {
    const roninId = crear();
    const ronin = serializarRonin(
      db.prepare('SELECT * FROM ronin WHERE id = ?').get(roninId),
    );
    return ronin;
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT')) {
      throw new ErrorDeJuego('Your rōnin is already awake.', 409, 'RONIN_EXISTENTE');
    }
    throw error;
  }
}
