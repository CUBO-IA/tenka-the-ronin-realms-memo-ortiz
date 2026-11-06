import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { agente, crearEntorno, entrarComputadora } from './ayuda.js';

describe('inicio de sesión con nombre y PIN', () => {
  let db;
  let app;

  beforeEach(() => {
    ({ db, app } = crearEntorno());
  });

  afterEach(() => {
    db.close();
  });

  test('crea la cuenta cuando el nombre no existe y deja sesión httpOnly', async () => {
    const cliente = agente(app);
    const respuesta = await entrarComputadora(cliente, { nombre: 'Kenji', pin: '1234' });

    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.body.usuario.nombre, 'Kenji');
    assert.equal(respuesta.body.ronin, null);

    const cookie = respuesta.headers['set-cookie'][0];
    assert.match(cookie, /tenka_pc=/);
    assert.match(cookie, /HttpOnly/i);

    const yo = await cliente.get('/api/yo').expect(200);
    assert.equal(yo.body.usuario.nombre, 'Kenji');
  });

  test('vuelve a entrar con el mismo nombre y PIN sin duplicar la cuenta', async () => {
    const cliente = agente(app);
    await entrarComputadora(cliente, { nombre: 'Kenji', pin: '1234' }).expect(201);

    const otraVez = await entrarComputadora(cliente, {
      nombre: '  kenji  ',
      pin: '1234',
    }).expect(200);

    assert.equal(otraVez.body.usuario.nombre, 'Kenji');
    const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
    assert.equal(total.n, 1);
  });

  test('rechaza un PIN incorrecto y no crea otra cuenta', async () => {
    const cliente = agente(app);
    await entrarComputadora(cliente, { nombre: 'Kenji', pin: '1234' }).expect(201);

    const respuesta = await entrarComputadora(cliente, {
      nombre: 'Kenji',
      pin: '9999',
    }).expect(401);

    assert.equal(respuesta.body.codigo, 'PIN_INCORRECTO');
    assert.match(respuesta.body.error, /do not match/);
    const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
    assert.equal(total.n, 1);
  });

  test('exige un PIN de exactamente cuatro dígitos', async () => {
    const cliente = agente(app);
    for (const pin of ['123', '12345', '12a4', '']) {
      const respuesta = await cliente
        .post('/api/sesion')
        .send({ nombre: 'Kenji', pin })
        .expect(400);
      assert.equal(respuesta.body.codigo, 'DATOS_INVALIDOS');
    }
  });

  test('valida el nombre y no acepta HTML', async () => {
    const cliente = agente(app);
    await cliente
      .post('/api/sesion')
      .send({ nombre: '<script>x</script>', pin: '1234' })
      .expect(400);

    await cliente.post('/api/sesion').send({ nombre: 'K', pin: '1234' }).expect(400);
  });

  test('cerrar sesión borra la cookie y el acceso a la computadora', async () => {
    const cliente = agente(app);
    await entrarComputadora(cliente).expect(201);

    await cliente.delete('/api/sesion').expect(200);
    const yo = await cliente.get('/api/yo').expect(200);
    assert.equal(yo.body.usuario, null);
  });

  test('sin sesión la API de la computadora responde vacía', async () => {
    const cliente = agente(app);
    const yo = await cliente.get('/api/yo').expect(200);
    assert.deepEqual(yo.body, { usuario: null, ronin: null });
  });
});
