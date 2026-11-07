// Pantalla de la computadora. Solo muestra y pide; la verdad está en el servidor.

import { aplicarKamon, cargarPiezas, pintarRonin } from '/recolorear.js';

const $ = (selector) => document.querySelector(selector);

const pantallas = {
  inicio: $('#pantalla-inicio'),
  qr: $('#pantalla-qr'),
  ronin: $('#pantalla-ronin'),
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
const pieSesion = $('#pie-sesion');

let usuario = null;
let ronin = null;
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
    ? `Signed in as ${usuario.nombre} · Your rōnin awaits his master`
    : `Signed in as ${usuario.nombre} · Waiting for your rōnin to awaken`;
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

function mostrarRonin() {
  detenerRelojSello();
  mostrarVista('ronin');

  const bando = catalogo?.bandos?.find((elemento) => elemento.id === ronin.bando);
  const kimono = bando?.kimonos?.find((elemento) => elemento.id === ronin.kimono);
  const faja = catalogo?.fajas?.find((elemento) => elemento.id === ronin.faja);

  document.body.dataset.bando = ronin.bando;
  aplicarKamon($('#ronin-kamon'), ronin.kamon);
  $('#ronin-titulo').textContent = `${ronin.nombre} has awakened`;
  $('#ronin-detalle').textContent = `The ${ronin.bandoEtiqueta} path is yours. Your rōnin waits for your command on the phone.`;

  $('#muestra-kimono').style.background = kimono?.color || colorPorId([], ronin.kimono);
  $('#muestra-kimono-texto').textContent = kimono?.etiqueta || ronin.kimono;
  $('#muestra-faja').style.background = faja?.color || colorPorId([], ronin.faja);
  $('#muestra-faja-texto').textContent = faja?.etiqueta || ronin.faja;
  $('#muestra-camino').textContent = `${ronin.bandoEtiqueta} path · Era ${ronin.era}`;

  if (usuario) {
    mostrarPie(`Signed in as ${usuario.nombre} · Your rōnin waits for your voice`);
  }

  const token = ++tokenRonin;
  cargarPiezas(ronin.bando, ronin.tocado)
    .then((dibujo) => {
      if (token !== tokenRonin) return;
      pintarRonin($('#ronin-lienzo'), dibujo, kimono?.color, faja?.color);
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
    mostrarRonin();
  });
}

function volverAlInicio(mensaje = '') {
  detenerRelojSello();
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

    if (ronin) mostrarRonin();
    else mostrarQr();
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
  if (ronin) mostrarRonin();
  else mostrarQr();
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

async function iniciar() {
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
      if (ronin) mostrarRonin();
      else mostrarQr();
      return;
    }
  } catch {
    // Sin sesión se muestra el inicio.
  }

  volverAlInicio();
}

iniciar();
