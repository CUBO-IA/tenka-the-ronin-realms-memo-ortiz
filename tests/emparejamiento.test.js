import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import {
  agente,
  crearEntorno,
  emparejar,
  entrarComputadora,
} from './ayuda.js';

describe('QR de emparejamiento de un solo uso', () => {
  let db;
  let app;

  beforeEach(() => {
    ({ db, app } = crearEntorno());
  });

  afterEach(() => {
    db.close();
  });

  test('solo la computadora con sesión puede pedir un sello', async () => {
    const respuesta = await agente(app).post('/api/emparejamiento').expect(401);
    assert.equal(respuesta.body.codigo, 'SIN_SESION');
  });

  test('el sello trae URL, imagen del QR y vencimiento', async () => {
    const pc = agente(app);
    await entrarComputadora(pc).expect(201);

    const antes = Date.now();
    const respuesta = await pc.post('/api/emparejamiento').expect(200);

    assert.match(respuesta.body.url, /\/m\?t=[\w-]{20,}/);
    assert.match(respuesta.body.qr, /^data:image\/png;base64,/);
    assert.ok(respuesta.body.vence > antes);
  });

  test('el celular canjea el token, queda con sesión y el token no sirve dos veces', async () => {
    const pc = agente(app);
    await entrarComputadora(pc).expect(201);

    const sello = await pc.post('/api/emparejamiento').expect(200);
    const token = new URL(sello.body.url).searchParams.get('t');

    const celular = agente(app);
    await celular.get(`/m?t=${encodeURIComponent(token)}`).expect(302);

    const yo = await celular.get('/api/yo-movil').expect(200);
    assert.equal(yo.body.usuario.nombre, 'Kenji');
    assert.equal(yo.body.ronin, null);
    assert.ok(Array.isArray(yo.body.opciones.kamon));
    assert.equal(yo.body.opciones.kamon.length, 12);

    // Otro celular no puede reutilizar el mismo enlace.
    const intruso = agente(app);
    const respuesta = await intruso
      .get(`/m?t=${encodeURIComponent(token)}`)
      .expect(410);
    assert.match(respuesta.text, /expired|already been used/i);
  });

  test('un token vencido no abre sesión', async () => {
    const pc = agente(app);
    await entrarComputadora(pc).expect(201);
    const sello = await pc.post('/api/emparejamiento').expect(200);
    db.prepare('UPDATE emparejamientos SET vence = 0').run();

    const token = new URL(sello.body.url).searchParams.get('t');
    await agente(app).get(`/m?t=${encodeURIComponent(token)}`).expect(410);
  });

  test('pedir un sello nuevo invalida el anterior', async () => {
    const pc = agente(app);
    await entrarComputadora(pc).expect(201);

    const primero = await pc.post('/api/emparejamiento').expect(200);
    const segundo = await pc.post('/api/emparejamiento').expect(200);

    const tokenViejo = new URL(primero.body.url).searchParams.get('t');
    const tokenNuevo = new URL(segundo.body.url).searchParams.get('t');

    await agente(app).get(`/m?t=${encodeURIComponent(tokenViejo)}`).expect(410);
    await agente(app).get(`/m?t=${encodeURIComponent(tokenNuevo)}`).expect(302);
  });

  test('un token inventado no abre sesión', async () => {
    await agente(app).get('/m?t=inventado-inventado-inventado').expect(410);
  });

  test('el celular emparejado puede volver a /m aunque el token ya se haya usado', async () => {
    const pc = agente(app);
    await entrarComputadora(pc).expect(201);

    const celular = agente(app);
    const token = await emparejar(pc, celular);

    await celular.get(`/m?t=${encodeURIComponent(token)}`).expect(302);
    await celular.get('/m').expect(200);
  });
});
