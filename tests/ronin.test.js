import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import {
  agente,
  crearEntorno,
  emparejar,
  entrarComputadora,
  roninValido,
} from './ayuda.js';

describe('crear el rōnin desde el celular', () => {
  let db;
  let app;
  let pc;
  let celular;

  beforeEach(async () => {
    ({ db, app } = crearEntorno());
    pc = agente(app);
    celular = agente(app);
    await entrarComputadora(pc).expect(201);
    await emparejar(pc, celular);
  });

  afterEach(() => {
    db.close();
  });

  test('el celular sin emparejar no puede crear nada', async () => {
    const suelto = agente(app);
    const respuesta = await suelto.post('/api/ronin').send(roninValido()).expect(401);
    assert.equal(respuesta.body.codigo, 'SIN_SESION_MOVIL');
  });

  test('la computadora sola no alcanza: el rōnin se crea desde el celular', async () => {
    const respuesta = await pc.post('/api/ronin').send(roninValido()).expect(401);
    assert.equal(respuesta.body.codigo, 'SIN_SESION_MOVIL');
  });

  test('crea un rōnin de la luz con todos los datos de la sección 2', async () => {
    const respuesta = await celular
      .post('/api/ronin')
      .send(roninValido())
      .expect(201);

    const ronin = respuesta.body.ronin;
    assert.equal(ronin.nombre, 'Hideo');
    assert.equal(ronin.bando, 'luz');
    assert.equal(ronin.bandoEtiqueta, 'Light');
    assert.equal(ronin.kimono, 'indigo');
    assert.equal(ronin.hakama, 'negro');
    assert.equal(ronin.tocado, 'sombrero_paja');
    assert.equal(ronin.kamon, 'grulla');
    assert.equal(ronin.era, 1);

    const guardado = db.prepare('SELECT * FROM ronin').get();
    assert.equal(guardado.nombre, 'Hideo');

    const recursos = db.prepare('SELECT tipo, cantidad FROM recursos').all();
    assert.equal(recursos.length, 5);
    assert.ok(recursos.some((recurso) => recurso.tipo === 'cedro'));

    const yo = await celular.get('/api/yo-movil').expect(200);
    assert.equal(yo.body.ronin.nombre, 'Hideo');
  });

  test('crea un rōnin de la sombra con su propio kimono', async () => {
    const respuesta = await celular
      .post('/api/ronin')
      .send(
        roninValido({
          nombre: 'Kage',
          bando: 'sombra',
          kimono: 'negro_violeta',
          hakama: 'marron',
          tocado: 'mono',
          kamon: 'luna',
        }),
      )
      .expect(201);

    assert.equal(respuesta.body.ronin.bando, 'sombra');
    assert.equal(respuesta.body.ronin.bandoEtiqueta, 'Shadow');

    const recursos = db.prepare('SELECT tipo FROM recursos').all();
    assert.ok(recursos.some((recurso) => recurso.tipo === 'sauce'));
  });

  test('no acepta dos rōnin para el mismo maestro', async () => {
    await celular.post('/api/ronin').send(roninValido()).expect(201);
    const respuesta = await celular
      .post('/api/ronin')
      .send(roninValido({ nombre: 'Otro' }))
      .expect(409);
    assert.equal(respuesta.body.codigo, 'RONIN_EXISTENTE');
  });

  test('rechaza un kimono del bando contrario', async () => {
    const respuesta = await celular
      .post('/api/ronin')
      .send(roninValido({ kimono: 'rojo_sangre' }))
      .expect(400);

    assert.equal(respuesta.body.codigo, 'DATOS_INVALIDOS');
    assert.match(respuesta.body.campos.kimono, /does not belong/);
  });

  test('rechaza bando, hakama, tocado o kamon inventados', async () => {
    for (const cambio of [
      { bando: 'niebla' },
      { hakama: 'rosa' },
      { tocado: 'corona' },
      { kamon: 'dragon' },
    ]) {
      await celular.post('/api/ronin').send(roninValido(cambio)).expect(400);
    }
  });

  test('valida el nombre del rōnin', async () => {
    await celular.post('/api/ronin').send(roninValido({ nombre: 'X' })).expect(400);
    await celular
      .post('/api/ronin')
      .send(roninValido({ nombre: '<b>Hideo</b>' }))
      .expect(400);
  });

  test('cada maestro ve solo su propio rōnin', async () => {
    await celular.post('/api/ronin').send(roninValido()).expect(201);

    const otraPc = agente(app);
    await entrarComputadora(otraPc, { nombre: 'Akira', pin: '4321' }).expect(201);
    const otroCelular = agente(app);
    await emparejar(otraPc, otroCelular);

    const yo = await otroCelular.get('/api/yo-movil').expect(200);
    assert.equal(yo.body.usuario.nombre, 'Akira');
    assert.equal(yo.body.ronin, null);
  });
});
