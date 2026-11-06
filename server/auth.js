import { z } from 'zod';
import { reglas } from './reglas.js';
import { hashearPin, verificarPin } from './seguridad.js';
import { ErrorDeJuego, camposDeZod, primerMensajeDeZod } from './errores.js';

const esquemaInicio = z.object({
  nombre: z
    .string({ error: 'Enter your name.' })
    .trim()
    .min(reglas.usuario.nombreMin, `Name must be at least ${reglas.usuario.nombreMin} characters.`)
    .max(reglas.usuario.nombreMax, `Name must be at most ${reglas.usuario.nombreMax} characters.`)
    .regex(
      /^[\p{L}\p{N} ._'’-]+$/u,
      'Name can only contain letters, numbers, spaces, dots, dashes and apostrophes.',
    ),
  pin: z
    .string({ error: 'Enter your 4-digit PIN.' })
    .regex(
      new RegExp(`^\\d{${reglas.pin.longitud}}$`),
      `PIN must be exactly ${reglas.pin.longitud} digits.`,
    ),
});

export function normalizarNombre(nombre) {
  return nombre.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function usuarioPublico(fila) {
  return { id: fila.id, nombre: fila.nombre };
}

// Si el nombre no existe, se crea la cuenta. Si existe, el PIN tiene que coincidir.
export function iniciarSesion(db, datos) {
  const resultado = esquemaInicio.safeParse(datos ?? {});
  if (!resultado.success) {
    throw new ErrorDeJuego(
      primerMensajeDeZod(resultado),
      400,
      'DATOS_INVALIDOS',
      camposDeZod(resultado),
    );
  }

  const { nombre, pin } = resultado.data;
  const normalizado = normalizarNombre(nombre);
  const existente = db
    .prepare('SELECT id, nombre, pin_hash FROM usuarios WHERE nombre_normalizado = ?')
    .get(normalizado);

  if (existente) {
    if (!verificarPin(pin, existente.pin_hash)) {
      throw new ErrorDeJuego(
        'That name and PIN do not match.',
        401,
        'PIN_INCORRECTO',
      );
    }
    return { usuario: usuarioPublico(existente), nuevo: false };
  }

  const ahora = Date.now();
  try {
    const info = db
      .prepare(
        'INSERT INTO usuarios (nombre, nombre_normalizado, pin_hash, creado) VALUES (?, ?, ?, ?)',
      )
      .run(nombre, normalizado, hashearPin(pin), ahora);

    const creado = {
      id: Number(info.lastInsertRowid),
      nombre,
    };
    return { usuario: creado, nuevo: true };
  } catch (error) {
    // Otra petición pudo crear el mismo nombre entre la lectura y la escritura.
    if (String(error.code).includes('SQLITE_CONSTRAINT')) {
      throw new ErrorDeJuego(
        'That name was just taken. Please try again.',
        409,
        'NOMBRE_OCUPADO',
      );
    }
    throw error;
  }
}
