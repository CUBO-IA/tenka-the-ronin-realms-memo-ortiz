// Service worker del celular: hace instalable la web y recibe los avisos push.
// Nunca cachea la API ni el socket: el servidor siempre manda.

const CACHE = 'tenka-movil-v4';
const CAPARAZON = [
  '/m',
  '/m/m.css',
  '/m/m.js',
  '/recolorear.js',
  '/estilos/tenka.css',
  '/assets/fondo-movil-luz.jpg',
  '/assets/fondo-movil-sombra.jpg',
  '/assets/tarjeta-luz.jpg',
  '/assets/tarjeta-sombra.jpg',
  '/assets/logo-kanji.png',
  '/assets/logo-kanji-claro.png',
  '/assets/panel-madera.png',
  '/assets/tira-papel.png',
  '/assets/boton-laca.png',
  '/arte/icono.svg',
  '/m/manifest.webmanifest',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CAPARAZON))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  if (evento.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        const guardada = await caches.match(evento.request);
        if (guardada) return guardada;
        if (evento.request.mode === 'navigate') return caches.match('/m');
        return Response.error();
      }),
  );
});

// El rōnin habla aunque el celular esté bloqueado.
self.addEventListener('push', (evento) => {
  let carga = {};
  try {
    carga = evento.data ? evento.data.json() : {};
  } catch {
    carga = { cuerpo: evento.data ? evento.data.text() : '' };
  }

  evento.waitUntil(
    self.registration.showNotification(carga.titulo || 'Tenka', {
      body: carga.cuerpo || 'Your rōnin has something to say.',
      icon: '/arte/icono.svg',
      badge: '/arte/icono.svg',
      tag: carga.tag || 'tenka-ronin',
      renotify: true,
      data: { url: carga.url || '/m' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || '/m';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((ventana) => ventana.url.includes('/m'));
      if (abierta) return abierta.focus();
      return self.clients.openWindow(destino);
    }),
  );
});
