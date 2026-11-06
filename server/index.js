import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carga el .env de la raíz del proyecto si existe, sin obligar a tenerlo.
try {
  process.loadEnvFile(path.join(RAIZ, '.env'));
} catch {
  // No hay .env: se usan los valores por defecto.
}

const { crearApp } = await import('./app.js');
const { abrirDb } = await import('./db.js');
const { configurarSocket } = await import('./socket.js');

const db = abrirDb();
const app = crearApp({ db });
const servidor = http.createServer(app);
const io = new Server(servidor);

app.locals.io = io;
configurarSocket(io, db);

const puerto = Number(process.env.PORT || 3000);

servidor.listen(puerto, () => {
  console.log(`Tenka escucha en http://localhost:${puerto}`);
  console.log('Computadora: /  ·  Celular: /m');
});

// Cierra SQLite de forma ordenada al detener el proceso.
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    servidor.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
