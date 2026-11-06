import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { io as ioCliente } from 'socket.io-client';
import { Server } from 'socket.io';
import { crearApp } from '../server/app.js';
import { abrirDb } from '../server/db.js';
import { configurarSocket } from '../server/socket.js';
import { emparejar, roninValido } from './ayuda.js';

function esperarEvento(socket, nombre, milisegundos = 3000) {
  return new Promise((resolve, reject) => {
    const reloj = setTimeout(() => {
      socket.off(nombre, alRecibir);
      reject(new Error(`No llegó el evento ${nombre}`));
    }, milisegundos);

    function alRecibir(datos) {
      clearTimeout(reloj);
      resolve(datos);
    }

    socket.once(nombre, alRecibir);
  });
}

describe('avisos en tiempo real del emparejamiento y del rōnin', () => {
  let db;
  let app;
  let servidor;
  let io;
  let base;

  before(async () => {
    db = abrirDb(':memory:');
    app = crearApp({ db });
    servidor = http.createServer(app);
    io = new Server(servidor);
    app.locals.io = io;
    configurarSocket(io, db);

    await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    const { port } = servidor.address();
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await io.close();
    await new Promise((resolve) => servidor.close(resolve));
    db.close();
  });

  test('la computadora recibe el enlace y la creación del rōnin', async () => {
    const pc = request.agent(base);
    const crear = await pc
      .post('/api/sesion')
      .send({ nombre: 'Kenji', pin: '1234' })
      .expect(201);

    const cookie = crear.headers['set-cookie'][0].split(';')[0];
    const socket = ioCliente(base, {
      extraHeaders: { Cookie: cookie },
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await esperarEvento(socket, 'conectado');

      const avisoEnlace = esperarEvento(socket, 'emparejamiento:usado');
      const celular = request.agent(base);
      await emparejar(pc, celular);
      const datosEnlace = await avisoEnlace;
      assert.equal(datosEnlace.usuario.nombre, 'Kenji');

      const avisoRonin = esperarEvento(socket, 'ronin:creado');
      await celular.post('/api/ronin').send(roninValido()).expect(201);
      const datosRonin = await avisoRonin;
      assert.equal(datosRonin.ronin.nombre, 'Hideo');
      assert.equal(datosRonin.ronin.bando, 'luz');
    } finally {
      socket.close();
    }
  });

  test('un socket sin sesión no se conecta', async () => {
    const socket = ioCliente(base, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    const error = await new Promise((resolve) => {
      socket.on('connect_error', resolve);
      setTimeout(() => resolve(null), 2000);
    });

    socket.close();
    assert.ok(error);
    assert.match(error.message, /SIN_SESION/);
  });
});
