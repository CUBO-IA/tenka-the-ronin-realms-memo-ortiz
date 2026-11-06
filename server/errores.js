export class ErrorDeJuego extends Error {
  constructor(mensaje, estado = 400, codigo = 'PETICION_INVALIDA', campos = null) {
    super(mensaje);
    this.name = 'ErrorDeJuego';
    this.estado = estado;
    this.codigo = codigo;
    this.campos = campos;
  }
}

// Toma el primer mensaje de zod para mostrarlo tal cual al jugador.
export function primerMensajeDeZod(resultado) {
  if (resultado.success) return null;
  const problema = resultado.error.issues[0];
  return problema ? problema.message : 'Please check the information and try again.';
}

export function camposDeZod(resultado) {
  if (resultado.success) return null;
  const campos = {};
  for (const problema of resultado.error.issues) {
    const nombre = problema.path.join('.') || 'form';
    if (!campos[nombre]) campos[nombre] = problema.message;
  }
  return campos;
}
