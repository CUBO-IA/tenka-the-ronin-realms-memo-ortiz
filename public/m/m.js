// Pantalla del celular: elegir el camino y despertar al rōnin.
// Nada de esto decide el juego: el servidor valida cada opción.

import { aplicarKamon, cargarPiezas, piezaDeTocado, pintarRonin } from '/recolorear.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const VISTAS = [
  'estado-cargando',
  'estado-sin-sesion',
  'estado-error',
  'estado-despierto',
  'form-ronin',
];

const tituloMovil = $('#titulo-movil');
const formRonin = $('#form-ronin');
const entradaNombre = $('#nombre-ronin');
const errorRonin = $('#error-ronin');
const btnDespertar = $('#btn-despertar');
const preview = $('#preview');
const lemaBando = $('#lema-bando');

const estado = {
  bando: 'luz',
  kimono: null,
  hakama: null,
  tocado: null,
  kamon: null,
};

let opciones = null;
let enviando = false;
let tokenPreview = 0;

async function api(ruta, opcionesPeticion = {}) {
  const respuesta = await fetch(ruta, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opcionesPeticion,
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

function mostrarVista(id) {
  for (const vista of VISTAS) {
    document.getElementById(vista)?.classList.toggle('oculto', vista !== id);
  }
}

function bandoActual() {
  return opciones?.bandos?.find((bando) => bando.id === estado.bando) || null;
}

function kimonoActual() {
  return bandoActual()?.kimonos?.find((kimono) => kimono.id === estado.kimono) || null;
}

function hakamaActual() {
  return opciones?.hakamas?.find((hakama) => hakama.id === estado.hakama) || null;
}

function elegirBando(id) {
  if (id === estado.bando) return;
  const bando = opciones?.bandos?.find((elemento) => elemento.id === id);
  if (!bando) return;

  estado.bando = id;
  estado.kimono = bando.kimonos[0]?.id || null;

  for (const boton of $$('.bando')) {
    const activo = boton.dataset.bando === id;
    boton.classList.toggle('activo', activo);
    boton.setAttribute('aria-pressed', String(activo));
  }

  document.body.dataset.bando = id;
  renderKimonos();
  renderTocados();
  actualizarPreview();
}

function renderKimonos() {
  const contenedor = $('#opciones-kimono');
  contenedor.innerHTML = '';
  const bando = bandoActual();
  if (!bando) return;

  for (const kimono of bando.kimonos) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'muestra-color';
    boton.style.setProperty('--color', kimono.color);
    boton.setAttribute('aria-pressed', String(kimono.id === estado.kimono));
    boton.setAttribute('aria-label', kimono.etiqueta);
    boton.title = kimono.etiqueta;
    boton.innerHTML = `<span class="solo-lectores">${kimono.etiqueta}</span>`;
    boton.addEventListener('click', () => {
      estado.kimono = kimono.id;
      renderKimonos();
      actualizarPreview();
    });
    contenedor.append(boton);
  }
}

function renderHakamas() {
  const contenedor = $('#opciones-hakama');
  contenedor.innerHTML = '';

  for (const hakama of opciones.hakamas) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'muestra-color';
    boton.style.setProperty('--color', hakama.color);
    boton.setAttribute('aria-pressed', String(hakama.id === estado.hakama));
    boton.setAttribute('aria-label', hakama.etiqueta);
    boton.title = hakama.etiqueta;
    boton.innerHTML = `<span class="solo-lectores">${hakama.etiqueta}</span>`;
    boton.addEventListener('click', () => {
      estado.hakama = hakama.id;
      renderHakamas();
      actualizarPreview();
    });
    contenedor.append(boton);
  }
}

function renderTocados() {
  const contenedor = $('#opciones-tocado');
  contenedor.innerHTML = '';

  for (const tocado of opciones.tocados) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'muestra-tocado';
    boton.setAttribute('aria-pressed', String(tocado.id === estado.tocado));
    boton.setAttribute('aria-label', tocado.etiqueta);
    boton.title = tocado.etiqueta;

    const pieza = piezaDeTocado(tocado.id);
    const imagen = document.createElement('img');
    imagen.src = `/assets/tocado-${pieza}-${estado.bando}.png`;
    imagen.alt = '';
    boton.append(imagen);

    const texto = document.createElement('span');
    texto.className = 'solo-lectores';
    texto.textContent = tocado.etiqueta;
    boton.append(texto);

    boton.addEventListener('click', () => {
      estado.tocado = tocado.id;
      renderTocados();
      actualizarPreview();
    });
    contenedor.append(boton);
  }
}

function renderKamon() {
  const contenedor = $('#opciones-kamon');
  contenedor.innerHTML = '';

  for (const kamon of opciones.kamon) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'muestra-kamon';
    boton.setAttribute('aria-pressed', String(kamon.id === estado.kamon));
    boton.setAttribute('aria-label', kamon.etiqueta);
    boton.title = kamon.etiqueta;

    const icono = document.createElement('span');
    icono.className = 'kamon-icono';
    aplicarKamon(icono, kamon.id);
    boton.append(icono);

    const texto = document.createElement('span');
    texto.className = 'solo-lectores';
    texto.textContent = kamon.etiqueta;
    boton.append(texto);

    boton.addEventListener('click', () => {
      estado.kamon = kamon.id;
      renderKamon();
      actualizarPreview();
    });
    contenedor.append(boton);
  }
}

async function actualizarPreview() {
  const bando = bandoActual();
  const kimono = kimonoActual();
  const hakama = hakamaActual();
  if (!bando) return;

  preview.dataset.bando = estado.bando;
  document.body.dataset.bando = estado.bando;
  if (kimono) preview.style.setProperty('--kimono', kimono.color);
  if (hakama) preview.style.setProperty('--hakama', hakama.color);

  aplicarKamon($('#preview-kamon'), estado.kamon);
  lemaBando.textContent = bando.lema;

  const token = ++tokenPreview;
  try {
    const dibujo = await cargarPiezas(estado.bando, estado.tocado);
    if (token !== tokenPreview) return;
    pintarRonin($('#ronin-lienzo'), dibujo, kimono?.color, hakama?.color);
  } catch {
    // Si el sprite no llega, se queda el dibujo anterior.
  }
}

function iniciarFormulario(datos) {
  opciones = datos.opciones;

  const bando = opciones.bandos.find((elemento) => elemento.id === 'luz') || opciones.bandos[0];
  estado.bando = bando.id;
  estado.kimono = bando.kimonos[0]?.id || null;
  estado.hakama = opciones.hakamas[0]?.id || null;
  estado.tocado = opciones.tocados[0]?.id || null;
  estado.kamon = opciones.kamon[0]?.id || null;

  if (!estado.kimono || !estado.hakama || !estado.tocado || !estado.kamon) {
    $('#texto-error').textContent = 'The options could not be loaded. Reload the page.';
    mostrarVista('estado-error');
    return;
  }

  for (const boton of $$('.bando')) {
    const activo = boton.dataset.bando === estado.bando;
    boton.classList.toggle('activo', activo);
    boton.setAttribute('aria-pressed', String(activo));
    boton.addEventListener('click', () => elegirBando(boton.dataset.bando));
  }

  document.body.dataset.bando = estado.bando;
  tituloMovil.textContent = 'Create your Rōnin';
  renderKimonos();
  renderHakamas();
  renderTocados();
  renderKamon();
  actualizarPreview();
  mostrarVista('form-ronin');
}

async function mostrarDespierto(ronin, recienCreado) {
  opciones = opciones || { bandos: [], hakamas: [] };

  const bando = opciones.bandos.find((elemento) => elemento.id === ronin.bando);
  const kimono = bando?.kimonos?.find((elemento) => elemento.id === ronin.kimono);
  const hakama = opciones.hakamas.find((elemento) => elemento.id === ronin.hakama);

  document.body.dataset.bando = ronin.bando;
  tituloMovil.textContent = 'Your Rōnin';

  $('#despierto-titulo').textContent = `${ronin.nombre} is awake`;
  $('#despierto-detalle').textContent = recienCreado
    ? `The ${ronin.bandoEtiqueta} path is chosen. Return to the computer to watch him arrive.`
    : 'Your rōnin has already awakened. Return to the computer to watch him.';
  aplicarKamon($('#despierto-kamon'), ronin.kamon);

  $('#despierto-kimono-color').style.background = kimono?.color || '#888';
  $('#despierto-kimono').textContent = kimono?.etiqueta || ronin.kimono;
  $('#despierto-hakama-color').style.background = hakama?.color || '#888';
  $('#despierto-hakama').textContent = hakama?.etiqueta || ronin.hakama;
  $('#despierto-camino').textContent = `${ronin.bandoEtiqueta} path · Era ${ronin.era}`;

  mostrarVista('estado-despierto');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const dibujo = await cargarPiezas(ronin.bando, ronin.tocado);
    pintarRonin($('#despierto-lienzo'), dibujo, kimono?.color, hakama?.color);
  } catch {
    // La tarjeta sigue mostrando el resto aunque falte el sprite.
  }
}

formRonin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (enviando) return;

  errorRonin.textContent = '';
  const nombre = entradaNombre.value.trim().replace(/\s+/g, ' ');

  if (nombre.length < 2) {
    errorRonin.textContent = 'Give your rōnin a name of at least 2 characters.';
    entradaNombre.focus();
    return;
  }

  enviando = true;
  btnDespertar.disabled = true;
  btnDespertar.textContent = 'Awakening…';

  try {
    const datos = await api('/api/ronin', {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        bando: estado.bando,
        kimono: estado.kimono,
        hakama: estado.hakama,
        tocado: estado.tocado,
        kamon: estado.kamon,
      }),
    });

    mostrarDespierto(datos.ronin, true);
  } catch (error) {
    if (error.codigo === 'RONIN_EXISTENTE') {
      try {
        const actual = await api('/api/yo-movil');
        if (actual.ronin) {
          mostrarDespierto(actual.ronin, false);
          return;
        }
      } catch {
        // Si tampoco se puede leer, se muestra el error original.
      }
    }

    errorRonin.textContent = error.message;
    if (error.campos?.nombre) entradaNombre.focus();
  } finally {
    enviando = false;
    btnDespertar.disabled = false;
    btnDespertar.textContent = 'Awaken your Rōnin';
  }
});

async function iniciar() {
  tituloMovil.textContent = 'Create your Rōnin';

  try {
    const datos = await api('/api/yo-movil');
    opciones = datos.opciones;

    if (datos.ronin) {
      mostrarDespierto(datos.ronin, false);
      return;
    }

    iniciarFormulario(datos);
  } catch (error) {
    if (error.estado === 401) {
      tituloMovil.textContent = 'Tenka';
      mostrarVista('estado-sin-sesion');
      return;
    }

    $('#texto-error').textContent =
      error.message || 'The server could not be reached. Try again.';
    mostrarVista('estado-error');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/m/sw.js').catch(() => {
      // En http por LAN el navegador no permite service workers; la app funciona igual.
    });
  });
}

iniciar();
