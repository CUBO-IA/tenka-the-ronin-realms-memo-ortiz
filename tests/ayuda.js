import request from 'supertest';
import { crearApp } from '../server/app.js';
import { abrirDb } from '../server/db.js';

export function crearEntorno() {
  const db = abrirDb(':memory:');
  const app = crearApp({ db });
  return { db, app };
}

export function agente(app) {
  return request.agent(app);
}

export function entrarComputadora(agente, datos = {}) {
  const { nombre = 'Kenji', pin = '1234' } = datos;
  return agente.post('/api/sesion').send({ nombre, pin });
}

// Pide un sello, lo canjea con un agente de celular y devuelve el token.
export async function emparejar(agentePc, agenteMovil) {
  const sello = await agentePc.post('/api/emparejamiento').expect(200);
  const token = new URL(sello.body.url).searchParams.get('t');
  await agenteMovil.get(`/m?t=${encodeURIComponent(token)}`).expect(302);
  return token;
}

export function roninValido(extra = {}) {
  return {
    nombre: 'Hideo',
    bando: 'luz',
    kimono: 'indigo',
    hakama: 'negro',
    tocado: 'sombrero_paja',
    kamon: 'grulla',
    ...extra,
  };
}
