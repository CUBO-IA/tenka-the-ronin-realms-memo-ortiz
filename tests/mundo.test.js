import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agente, crearEntorno, emparejar, entrarComputadora, roninValido } from './ayuda.js';
import { TERRITORIOS, asignarTerritoriosFaltantes } from '../server/territorios.js';

async function jugador(app, nombre, datosRonin) {
  const pc = agente(app);
  const movil = agente(app);
  await entrarComputadora(pc, { nombre, pin: '1234' });
  await emparejar(pc, movil);
  const res = await movil.post('/api/ronin').send(roninValido(datosRonin)).expect(201);
  return { pc, movil, ronin: res.body.ronin };
}

describe('la isla y el mapa vivo', () => {
  test('hay 12 territorios, 6 por bando', () => {
    assert.equal(TERRITORIOS.length, 12);
    assert.equal(TERRITORIOS.filter((t) => t.bando === 'luz').length, 6);
    assert.equal(TERRITORIOS.filter((t) => t.bando === 'sombra').length, 6);
  });

  test('cada rōnin nuevo recibe el primer territorio libre de su bando', async () => {
    const { app } = crearEntorno();
    const a = await jugador(app, 'Ana', { nombre: 'Hana' });
    const b = await jugador(app, 'Beto', { nombre: 'Ryo', bando: 'sombra', kimono: 'negro_violeta' });
    const c = await jugador(app, 'Caro', { nombre: 'Kenji' });
    assert.equal(a.ronin.territorio, 'luz-1');
    assert.equal(b.ronin.territorio, 'sombra-1');
    assert.equal(c.ronin.territorio, 'luz-2');
  });

  test('el mapa muestra a todos sin sus recursos y permite visitar un santuario', async () => {
    const { app } = crearEntorno();
    const a = await jugador(app, 'Ana', { nombre: 'Hana' });
    const b = await jugador(app, 'Beto', { nombre: 'Ryo', bando: 'sombra', kimono: 'negro_violeta' });

    await b.movil
      .post('/api/acciones')
      .send({ accion: 'construir', parametros: { edificio: 'choza' } })
      .expect(200);

    const mundo = await a.pc.get('/api/mundo').expect(200);
    assert.equal(mundo.body.ronin.length, 2);
    const ryo = mundo.body.ronin.find((r) => r.nombre === 'Ryo');
    assert.equal(ryo.territorio, 'sombra-1');
    assert.equal(ryo.x, TERRITORIOS.find((t) => t.id === 'sombra-1').x);
    assert.deepEqual(ryo.edificios, [{ tipo: 'choza', etapa: 'cimientos' }]);
    assert.equal(ryo.recursos, undefined);

    const santuario = await a.pc.get(`/api/santuario/${ryo.id}`).expect(200);
    assert.equal(santuario.body.ronin.nombre, 'Ryo');
    assert.equal(santuario.body.edificios.length, 1);
    assert.equal(santuario.body.recursos, undefined);

    await a.pc.get('/api/santuario/999').expect(404);
    await agente(app).get('/api/mundo').expect(401);
  });

  test('un rōnin viejo sin territorio lo recibe al arrancar', async () => {
    const { db, app } = crearEntorno();
    const a = await jugador(app, 'Ana', { nombre: 'Hana' });
    db.prepare('UPDATE ronin SET territorio = NULL WHERE id = ?').run(a.ronin.id);
    assert.equal(asignarTerritoriosFaltantes(db), 1);
    assert.equal(db.prepare('SELECT territorio FROM ronin WHERE id = ?').get(a.ronin.id).territorio, 'luz-1');
  });
});
