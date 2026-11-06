import crypto from 'node:crypto';

const LARGO_CLAVE = 64;

// Guarda el PIN con scrypt y una sal distinta por usuario.
export function hashearPin(pin) {
  const sal = crypto.randomBytes(16);
  const clave = crypto.scryptSync(pin, sal, LARGO_CLAVE);
  return `scrypt$${sal.toString('hex')}$${clave.toString('hex')}`;
}

export function verificarPin(pin, guardado) {
  if (typeof guardado !== 'string') return false;
  const partes = guardado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

  try {
    const sal = Buffer.from(partes[1], 'hex');
    const esperada = Buffer.from(partes[2], 'hex');
    const calculada = crypto.scryptSync(pin, sal, esperada.length);
    return crypto.timingSafeEqual(esperada, calculada);
  } catch {
    return false;
  }
}

export function tokenAleatorio() {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashDeToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
