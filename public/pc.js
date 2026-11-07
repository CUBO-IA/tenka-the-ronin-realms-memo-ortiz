// Pantalla de la computadora. Solo muestra y pide; la verdad está en el servidor.

import { aplicarKamon, cargarPiezas, pintarRonin } from '/recolorear.js';
import {
  actualizarAlianzas,
  actualizarEdificio,
  actualizarEdificios,
  actualizarMapa,
  batallaCombate,
  batallaInicio,
  batallaResultado,
  actualizarRecursos,
  actualizarRonin,
  mostrarMapa,
  mostrarMensaje,
  mostrarSantuario,
  ocultarSantuario,
  visitarSantuario,
} from '/santuario-pc.js';

const $ = (selector) => document.querySelector(selector);

const pantallas = {
  inicio: $('#pantalla-inicio'),
  qr: $('#pantalla-qr'),
  ronin: $('#pantalla-ronin'),
  santuario: $('#pantalla-santuario'),
};

const formInicio = $('#form-inicio');
const entradaNombre = $('#nombre');
const entradaPin = $('#pin');
const errorInicio = $('#error-inicio');
const btnEntrar = $('#btn-entrar');

const qrImagen = $('#qr-imagen');
const estadoQr = $('#estado-qr');
const btnNuevoSello = $('#btn-nuevo-sello');
const btnVolver = $('#btn-volver');
const btnSalir = $('#btn-salir');

const btnEmparejar = $('#btn-emparejar');
const btnEntrarSantuario = $('#btn-entrar-santuario');
const btnTelefono = $('#btn-telefono');
const btnMapa = $('#btn-mapa');
const btnMiSantuario = $('#btn-mi-santuario');
const btnSalirSantuario = $('#btn-salir-santuario');
const pieSesion = $('#pie-sesion');

let usuario = null;
let ronin = null;
// Estado del mundo del rōnin que manda el servidor.
let mundo = { recursos: {}, edificios: [], mensaje: null };
let catalogo = null;
let socket = null;
let vistaActual = 'inicio';
let venceSello = 0;
let relojSello = null;
let pidiendoSello = false;
let tokenRonin = 0;

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });

  let datos = {};
  try {
    datos = await respuesta.json();
  } catch {
    datos = {};
  }

  if (!respuesta.ok) {
    const error = new Error(datos.error || 'Something went wrong. Please try again.');
    error.estado = respuesta.status;
    error.codigo = datos.codigo;
    error.campos = datos.campos;
    throw error;
  }

  return datos;
}

function mostrarVista(nombre) {
  vistaActual = nombre;
  document.body.dataset.vista = nombre;
  for (const [clave, seccion] of Object.entries(pantallas)) {
    seccion.classList.toggle('oculto', clave !== nombre);
  }
}

function mostrarPie(texto) {
  if (!texto) {
    pieSesion.classList.add('oculto');
    pieSesion.textContent = '';
    return;
  }
  pieSesion.textContent = texto;
  pieSesion.classList.remove('oculto');
}

function detenerRelojSello() {
  if (relojSello) {
    clearInterval(relojSello);
    relojSello = null;
  }
}

function iniciarRelojSello() {
  detenerRelojSello();
  actualizarRelojSello();
  relojSello = setInterval(actualizarRelojSello, 250);
}

function actualizarRelojSello() {
  const restante = venceSello - Date.now();
  if (restante <= 0) {
    detenerRelojSello();
    if (vistaActual === 'qr' && !pidiendoSello) {
      estadoQr.textContent = 'The seal has faded. Drawing a new one…';
      pedirSello();
    }
    return;
  }

  const segundos = Math.ceil(restante / 1000);
  const minutos = Math.floor(segundos / 60);
  const resto = String(segundos % 60).padStart(2, '0');
  estadoQr.textContent = `The seal is alive · expires in ${minutos}:${resto}`;
}

async function pedirSello() {
  if (pidiendoSello) return;
  pidiendoSello = true;
  btnNuevoSello.disabled = true;
  estadoQr.textContent = 'Drawing the seal…';

  try {
    const datos = await api('/api/emparejamiento', { method: 'POST' });
    qrImagen.src = datos.qr;
    venceSello = datos.vence;
    iniciarRelojSello();
  } catch (error) {
    if (error.estado === 401) {
      volverAlInicio('Your session ended. Sign in again.');
      return;
    }
    estadoQr.textContent = 'The seal could not be drawn. Try again.';
  } finally {
    pidiendoSello = false;
    btnNuevoSello.disabled = false;
  }
}

function textoPieQr() {
  if (!usuario) return '';
  return ronin
    ? `Signed in as ${usuario.nombre} · Scan to command ${ronin.nombre} from your phone`
    : `Signed in as ${usuario.nombre} · Scan to create your rōnin`;
}

function mostrarQr() {
  mostrarVista('qr');
  btnVolver.classList.toggle('oculto', !ronin);
  mostrarPie(textoPieQr());
  pedirSello();
}

function colorPorId(lista, id) {
  return lista?.find((elemento) => elemento.id === id)?.color || '#888';
}

function etiquetaPorId(lista, id) {
  return lista?.find((elemento) => elemento.id === id)?.etiqueta || id;
}

function coloresDe(unRonin) {
  const bando = catalogo?.bandos?.find((elemento) => elemento.id === unRonin.bando);
  const kimono = bando?.kimonos?.find((elemento) => elemento.id === unRonin.kimono);
  const hakama = catalogo?.hakamas?.find((elemento) => elemento.id === unRonin.hakama);
  return { kimono: kimono?.color, hakama: hakama?.color };
}

function coloresDelRonin() {
  return coloresDe(ronin);
}

// La isla: todos los santuarios en vivo.
async function irAlMapa() {
  try {
    const mundo = await api('/api/mundo');
    mostrarMapa(mundo, (elegido) => visitar(elegido.id));
  } catch (error) {
    if (error.estado === 401) volverAlInicio('Your session ended. Sign in again.');
  }
}

async function visitar(roninId, aviso = null) {
  if (ronin && roninId === ronin.id) {
    irAlSantuario();
    return null;
  }
  try {
    const santuario = await api(`/api/santuario/${roninId}`);
    return await visitarSantuario(santuario, coloresDe(santuario.ronin), aviso);
  } catch {
    // Si no se puede visitar, el mapa sigue en pantalla.
    return null;
  }
}

// Mi rōnin marcha: la pantalla lo sigue hasta el santuario enemigo y vuelve al terminar.
let relojRegreso = null;

async function seguirMarcha(batalla) {
  clearTimeout(relojRegreso);
  batallaInicio(batalla);
  await visitar(batalla.defensor.id, `${ronin.nombre} marches on ${batalla.defensor.nombre}'s sanctuary`);
}

function volverTrasBatalla() {
  clearTimeout(relojRegreso);
  relojRegreso = setTimeout(() => {
    if (vistaActual === 'santuario' && ronin) irAlSantuario();
  }, 6000);
}

// El mundo en vivo: fondo del bando, rōnin animado, edificios y su voz.
function irAlSantuario() {
  detenerRelojSello();
  mostrarVista('santuario');
  mostrarPie(null);
  document.body.dataset.bando = ronin.bando;
  mostrarSantuario({
    ronin,
    recursos: mundo.recursos,
    edificios: mundo.edificios,
    mensaje: mundo.mensaje,
    colores: coloresDelRonin(),
  });
}

function guardarMundo(datos) {
  if (!datos) return;
  if (datos.recursos) mundo.recursos = datos.recursos;
  if (Array.isArray(datos.edificios)) mundo.edificios = datos.edificios;
  if (datos.mensaje) mundo.mensaje = datos.mensaje;
}

// La tarjeta "ha despertado" se muestra solo al crear el rōnin; después de
// unos segundos, o al tocar el botón, se entra al santuario.
let relojTarjeta = null;

function mostrarRonin() {
  detenerRelojSello();
  ocultarSantuario();
  mostrarVista('ronin');
  clearTimeout(relojTarjeta);
  relojTarjeta = setTimeout(() => {
    if (vistaActual === 'ronin') irAlSantuario();
  }, 7000);

  const bando = catalogo?.bandos?.find((elemento) => elemento.id === ronin.bando);
  const kimono = bando?.kimonos?.find((elemento) => elemento.id === ronin.kimono);
  const hakama = catalogo?.hakamas?.find((elemento) => elemento.id === ronin.hakama);

  document.body.dataset.bando = ronin.bando;
  aplicarKamon($('#ronin-kamon'), ronin.kamon);
  $('#ronin-titulo').textContent = `${ronin.nombre} has awakened`;
  $('#ronin-detalle').textContent = `The ${ronin.bandoEtiqueta} path is yours. Your rōnin waits for your command on the phone.`;

  $('#muestra-kimono').style.background = kimono?.color || colorPorId([], ronin.kimono);
  $('#muestra-kimono-texto').textContent = kimono?.etiqueta || ronin.kimono;
  $('#muestra-hakama').style.background = hakama?.color || colorPorId([], ronin.hakama);
  $('#muestra-hakama-texto').textContent = hakama?.etiqueta || ronin.hakama;
  $('#muestra-camino').textContent = `${ronin.bandoEtiqueta} path · Era ${ronin.era}`;

  if (usuario) {
    mostrarPie(`Signed in as ${usuario.nombre} · Your rōnin waits for your voice`);
  }

  const token = ++tokenRonin;
  cargarPiezas(ronin.bando, ronin.tocado)
    .then((dibujo) => {
      if (token !== tokenRonin) return;
      pintarRonin($('#ronin-lienzo'), dibujo, kimono?.color, hakama?.color);
    })
    .catch(() => {
      // Si el sprite no carga, la tarjeta sigue mostrando el resto.
    });
}

function conectarSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io({ forceNew: true });

  socket.on('emparejamiento:usado', (datos) => {
    if (!usuario || datos?.usuario?.id !== usuario.id) return;

    if (!ronin) {
      detenerRelojSello();
      estadoQr.textContent = 'Phone linked. Awaiting the awakening.';
      mostrarPie(`Signed in as ${usuario.nombre} · Your phone is listening`);
    }
  });

  socket.on('ronin:creado', (datos) => {
    if (!datos?.ronin) return;
    ronin = datos.ronin;
    guardarMundo(datos);
    mostrarRonin();
  });

  socket.on('ronin:actualizado', (datos) => {
    if (!datos?.ronin) return;
    ronin = datos.ronin;
    actualizarRonin(ronin);
  });

  socket.on('recursos:actualizados', (datos) => {
    if (!datos?.recursos) return;
    mundo.recursos = datos.recursos;
    actualizarRecursos(datos.recursos);
  });

  socket.on('edificios:actualizados', (datos) => {
    if (!Array.isArray(datos?.edificios)) return;
    mundo.edificios = datos.edificios;
    actualizarEdificios(datos.edificios);
  });

  socket.on('edificio:actualizado', (datos) => {
    if (!datos?.edificio) return;
    mundo.edificios = mundo.edificios.filter((e) => e.tipo !== datos.edificio.tipo);
    mundo.edificios.push(datos.edificio);
    actualizarEdificio(datos.edificio);
  });

  socket.on('mensaje:nuevo', (datos) => {
    if (!datos?.mensaje) return;
    mundo.mensaje = datos.mensaje;
    mostrarMensaje(datos.mensaje);
  });

  socket.on('mundo:ronin', (datos) => {
    if (datos?.ronin) actualizarMapa(datos.ronin);
  });

  socket.on('mundo:alianzas', (datos) => {
    if (Array.isArray(datos?.alianzas)) actualizarAlianzas(datos.alianzas);
  });

  socket.on('batalla:inicio', (datos) => {
    if (!datos?.atacante || !datos?.defensor) return;
    if (ronin && datos.atacante.id === ronin.id && vistaActual === 'santuario') {
      seguirMarcha(datos);
      return;
    }
    batallaInicio(datos);
  });

  socket.on('batalla:combate', (datos) => {
    if (datos?.golpes) batallaCombate(datos);
  });

  socket.on('batalla:resultado', (datos) => {
    if (!datos?.ganador) return;
    batallaResultado(datos);
    if (ronin && datos.atacante?.id === ronin.id) volverTrasBatalla();
  });
}

function volverAlInicio(mensaje = '') {
  detenerRelojSello();
  clearTimeout(relojTarjeta);
  ocultarSantuario();
  mundo = { recursos: {}, edificios: [], mensaje: null };
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  usuario = null;
  ronin = null;
  vistaActual = 'inicio';
  mostrarVista('inicio');
  mostrarPie(null);
  errorInicio.textContent = mensaje;
  setTimeout(() => entradaNombre.focus(), 250);
}

formInicio.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  errorInicio.textContent = '';

  const nombre = entradaNombre.value.trim().replace(/\s+/g, ' ');
  const pin = entradaPin.value.trim();

  if (!nombre) {
    errorInicio.textContent = 'Enter your name.';
    entradaNombre.focus();
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    errorInicio.textContent = 'PIN must be exactly 4 digits.';
    entradaPin.focus();
    return;
  }

  btnEntrar.disabled = true;
  btnEntrar.textContent = 'Entering…';

  try {
    const datos = await api('/api/sesion', {
      method: 'POST',
      body: JSON.stringify({ nombre, pin }),
    });

    usuario = datos.usuario;
    ronin = datos.ronin;
    formInicio.reset();
    conectarSocket();

    if (ronin) {
      guardarMundo(datos);
      irAlSantuario();
    } else {
      mostrarQr();
    }
  } catch (error) {
    errorInicio.textContent = error.message;
    if (error.campos?.nombre) entradaNombre.focus();
    else if (error.campos?.pin) entradaPin.focus();
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'Enter the Realm';
  }
});

btnNuevoSello.addEventListener('click', () => {
  if (!pidiendoSello) pedirSello();
});

btnVolver.addEventListener('click', () => {
  detenerRelojSello();
  if (ronin) irAlSantuario();
  else mostrarQr();
});

btnEntrarSantuario.addEventListener('click', () => {
  clearTimeout(relojTarjeta);
  irAlSantuario();
});

btnMapa.addEventListener('click', () => {
  irAlMapa();
});

btnMiSantuario.addEventListener('click', () => {
  irAlSantuario();
});

btnTelefono.addEventListener('click', () => {
  ocultarSantuario();
  mostrarQr();
});

btnSalirSantuario.addEventListener('click', async () => {
  try {
    await api('/api/sesion', { method: 'DELETE' });
  } catch {
    // Aunque falle en el servidor, la pantalla vuelve al inicio.
  }
  volverAlInicio();
});

btnSalir.addEventListener('click', async () => {
  try {
    await api('/api/sesion', { method: 'DELETE' });
  } catch {
    // Aunque falle en el servidor, la pantalla vuelve al inicio.
  }
  volverAlInicio();
});

btnEmparejar.addEventListener('click', () => {
  mostrarQr();
});

// El video de intro: se ve al abrir la página sin sesión. Si el navegador no
// deja arrancar con sonido, un botón lo inicia; "Skip intro" lo salta.
function mostrarIntro() {
  return new Promise((resolver) => {
    const intro = $('#intro');
    const video = $('#intro-video');
    const btnEmpezar = $('#btn-intro-empezar');
    const btnSaltar = $('#btn-saltar-intro');
    if (!intro || !video || location.search.includes('sinintro')) {
      resolver();
      return;
    }

    let terminado = false;
    const terminar = () => {
      if (terminado) return;
      terminado = true;
      video.pause();
      intro.classList.add('oculto');
      resolver();
    };

    intro.classList.remove('oculto');
    video.addEventListener('ended', terminar);
    video.addEventListener('error', terminar);
    btnSaltar.addEventListener('click', terminar);
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') terminar();
    });

    video.play().catch(() => {
      // Sin gesto del usuario no hay sonido: el botón arranca el video.
      btnEmpezar.classList.remove('oculto');
      btnEmpezar.addEventListener('click', () => {
        btnEmpezar.classList.add('oculto');
        video.play().catch(terminar);
      });
    });
  });
}

async function iniciar() {
  // Un celular que abre la raíz va a su propia pantalla: la computadora es la vista grande.
  if (/iphone|ipad|ipod|android/i.test(navigator.userAgent) && !location.search.includes('pc')) {
    location.replace('/m');
    return;
  }

  try {
    catalogo = await api('/api/opciones');
  } catch {
    catalogo = null;
  }

  try {
    const estado = await api('/api/yo');
    if (estado.usuario) {
      usuario = estado.usuario;
      ronin = estado.ronin;
      conectarSocket();
      if (ronin) {
        guardarMundo(estado);
        irAlSantuario();
      } else {
        mostrarQr();
      }
      return;
    }
  } catch {
    // Sin sesión se muestra el inicio.
  }

  // Sin sesión: primero el video, después el inicio.
  await mostrarIntro();
  volverAlInicio();
}

iniciar();
