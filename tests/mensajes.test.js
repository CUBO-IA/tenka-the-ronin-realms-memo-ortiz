import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { agente, crearEntorno, emparejar, entrarComputadora, roninValido } from './ayuda.js';
import { configurarPush, enviarPush, suscripcionesDe } from '../server/push.js';
import { ejecutarAccion } from '../server/acciones.js';
import { avanzarMundo } from '../server/reloj.js';

// web-push falso: registra lo que mandaría y simula celulares que ya no existen.
function pushFalso() {
  const enviados = [];
  const muertos = new Set();
  return {
    enviados,
    muertos,
    generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }),
    setVapidDetails: () => {},
    async sendNotification(suscripcion, carga) {
      if (muertos.has(suscripcion.endpoint)) {
        const error = new Error('gone');
        error.statusCode = 410;
        throw error;
      }
      enviados.push({ endpoint: suscripcion.endpoint, carga: JSON.parse(carga) });
    },
  };
}

async function roninListo() {
  const { db, app } = crearEntorno();
  const pc = agente(app);
  const movil = agente(app);
  const sesion = await entrarComputadora(pc);
  await emparejar(pc, movil);
  await movil.post('/api/ronin').send(roninValido()).expect(201);
  return { db, app, pc, movil, usuarioId: sesion.body.usuario.id };
}

afterEach(() => configurarPush({ webpush: pushFalso() }));

describe('bandeja del celular', () => {
  test('lista los mensajes con no leídos y los marca como leídos', async () => {
    const { movil } = await roninListo();

    const bandeja = await movil.get('/api/mensajes').expect(200);
    assert.equal(bandeja.body.mensajes.length, 1);
    assert.equal(bandeja.body.noLeidos, 1);
    assert.equal(bandeja.body.mensajes[0].leido, false);

    await movil.post('/api/mensajes/leidos').expect(200);
    const despues = await movil.get('/api/mensajes').expect(200);
    assert.equal(despues.body.noLeidos, 0);
    assert.equal(despues.body.mensajes[0].leido, true);
  });

  test('sin sesión del celular, la bandeja responde 401', async () => {
    const { app } = crearEntorno();
    await agente(app).get('/api/mensajes').expect(401);
  });
});

describe('avisos push', () => {
  test('entrega la llave pública y guarda la suscripción del celular', async () => {
    configurarPush({ webpush: pushFalso() });
    const { db, movil, usuarioId } = await roninListo();

    const clave = await movil.get('/api/push/clave').expect(200);
    assert.equal(clave.body.clave, 'PUB');

    await movil
      .post('/api/push/suscribir')
      .send({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } })
      .expect(201);
    await movil.post('/api/push/suscribir').send({ endpoint: 'http://inseguro', keys: {} }).expect(400);

    assert.equal(suscripcionesDe(db, usuarioId).length, 1);
  });

  test('al terminar una tarea manda el aviso y olvida los celulares que ya no existen', async () => {
    const falso = pushFalso();
    configurarPush({ webpush: falso });
    const { db, movil, usuarioId } = await roninListo();

    for (const endpoint of ['https://push.example/uno', 'https://push.example/dos']) {
      await movil.post('/api/push/suscribir').send({ endpoint, keys: { p256dh: 'p', auth: 'a' } }).expect(201);
    }
    falso.muertos.add('https://push.example/dos');

    const ronin = db.prepare('SELECT * FROM ronin WHERE usuario_id = ?').get(usuarioId);
    const ahora = 500000;
    const res = ejecutarAccion(db, ronin.id, { accion: 'descansar', parametros: {} }, ahora);
    await avanzarMundo(db, null, ahora + res.duracionMs + 1);
    // enviarPush corre sin esperar al reloj: se le da un tic.
    await new Promise((resolver) => setTimeout(resolver, 20));

    assert.equal(falso.enviados.length, 1);
    assert.equal(falso.enviados[0].endpoint, 'https://push.example/uno');
    assert.match(falso.enviados[0].carga.titulo, /Hideo speaks/);
    assert.equal(suscripcionesDe(db, usuarioId).length, 1);

    const directo = await enviarPush(db, usuarioId, { titulo: 't', cuerpo: 'c' });
    assert.equal(directo, 1);
  });
});
