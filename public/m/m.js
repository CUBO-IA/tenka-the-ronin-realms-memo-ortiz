// Pantalla del celular: elegir el camino y despertar al rōnin.
// Nada de esto decide el juego: el servidor valida cada opción.

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
  faja: null,
  tocado: null,
  kamon: null,
};

let opciones = null;
let enviando = false;

const ICONOS_TOCADO = {
  sombrero_paja: `
    <svg viewBox="0 0 48 36" aria-hidden="true">
      <path d="M15 15Q24 3 33 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M4 17Q24 9 44 17Q45 21 39 22Q24 16 9 22Q3 21 4 17Z" fill="currentColor"/>
      <path d="M15 16Q24 12 33 16" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    </svg>`,
  mono: `
    <svg viewBox="0 0 48 36" aria-hidden="true">
      <path d="M10 34q2-12 14-12t14 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <circle cx="24" cy="15" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M19 8q5-5 10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
};

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

function fajaActual() {
  return opciones?.fajas?.find((faja) => faja.id === estado.faja) || null;
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

function renderFajas() {
  const contenedor = $('#opciones-faja');
  contenedor.innerHTML = '';

  for (const faja of opciones.fajas) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'muestra-color';
    boton.style.setProperty('--color', faja.color);
    boton.setAttribute('aria-pressed', String(faja.id === estado.faja));
    boton.setAttribute('aria-label', faja.etiqueta);
    boton.title = faja.etiqueta;
    boton.innerHTML = `<span class="solo-lectores">${faja.etiqueta}</span>`;
    boton.addEventListener('click', () => {
      estado.faja = faja.id;
      renderFajas();
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
    boton.innerHTML = ICONOS_TOCADO[tocado.id] || `<span>${tocado.etiqueta}</span>`;
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
    boton.innerHTML = `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <use href="/arte/kamon.svg#kamon-${kamon.id}"></use>
      </svg>
      <span class="solo-lectores">${kamon.etiqueta}</span>`;
    boton.addEventListener('click', () => {
      estado.kamon = kamon.id;
      renderKamon();
      actualizarPreview();
    });
    contenedor.append(boton);
  }
}

function actualizarPreview() {
  const bando = bandoActual();
  const kimono = kimonoActual();
  const faja = fajaActual();
  if (!bando) return;

  preview.dataset.bando = estado.bando;
  if (kimono) preview.style.setProperty('--kimono', kimono.color);
  if (faja) preview.style.setProperty('--faja', faja.color);

  $('#preview-kamon').setAttribute('href', `/arte/kamon.svg#kamon-${estado.kamon}`);
  $('#grupo-sombrero').classList.toggle('oculto', estado.tocado !== 'sombrero_paja');
  $('#grupo-mono').classList.toggle('oculto', estado.tocado !== 'mono');

  lemaBando.textContent = bando.lema;
  document.body.dataset.bando = estado.bando;
}

function iniciarFormulario(datos) {
  opciones = datos.opciones;

  const bando = opciones.bandos.find((elemento) => elemento.id === 'luz') || opciones.bandos[0];
  estado.bando = bando.id;
  estado.kimono = bando.kimonos[0]?.id || null;
  estado.faja = opciones.fajas[0]?.id || null;
  estado.tocado = opciones.tocados[0]?.id || null;
  estado.kamon = opciones.kamon[0]?.id || null;

  if (!estado.kimono || !estado.faja || !estado.tocado || !estado.kamon) {
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
  renderFajas();
  renderTocados();
  renderKamon();
  actualizarPreview();
  mostrarVista('form-ronin');
}

function mostrarDespierto(ronin, recienCreado) {
  opciones = opciones || { bandos: [], fajas: [] };

  const bando = opciones.bandos.find((elemento) => elemento.id === ronin.bando);
  const kimono = bando?.kimonos?.find((elemento) => elemento.id === ronin.kimono);
  const faja = opciones.fajas.find((elemento) => elemento.id === ronin.faja);

  document.body.dataset.bando = ronin.bando;
  tituloMovil.textContent = 'Your Rōnin';

  $('#despierto-titulo').textContent = `${ronin.nombre} is awake`;
  $('#despierto-detalle').textContent = recienCreado
    ? `The ${ronin.bandoEtiqueta} path is chosen. Return to the computer to watch him arrive.`
    : 'Your rōnin has already awakened. Return to the computer to watch him.';
  $('#despierto-kamon').setAttribute('href', `/arte/kamon.svg#kamon-${ronin.kamon}`);

  $('#despierto-kimono-color').style.background = kimono?.color || '#888';
  $('#despierto-kimono').textContent = kimono?.etiqueta || ronin.kimono;
  $('#despierto-faja-color').style.background = faja?.color || '#888';
  $('#despierto-faja').textContent = faja?.etiqueta || ronin.faja;
  $('#despierto-camino').textContent = `${ronin.bandoEtiqueta} path · Era ${ronin.era}`;

  mostrarVista('estado-despierto');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
        faja: estado.faja,
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
