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
  'pantalla-ordenes',
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

let socket = null;
let relojTarea = null;
let roninActual = null;
let recursosActuales = {};
let mensajeActual = null;

const ICONO_RECURSO = {
  cedro: 'madera',
  sauce: 'sauce',
  piedra: 'piedra',
  lodo: 'lodo',
  hierro: 'arena-hierro',
  hongos: 'hongos',
  arroz: 'arroz',
  mon: 'mon',
};

const ETIQUETA_RECURSO = {
  cedro: 'cedar wood',
  sauce: 'dead willow',
  piedra: 'river stone',
  lodo: 'black mire',
  hierro: 'iron sand',
  hongos: 'swamp mushrooms',
  arroz: 'rice',
  mon: 'mon',
};

// Orden fijo de la tira de recursos: materiales del bando, arroz y mon.
const ORDEN_RECURSOS = ['cedro', 'sauce', 'piedra', 'lodo', 'hierro', 'hongos', 'arroz', 'mon'];

function recursosOrdenados(recursos) {
  return ORDEN_RECURSOS.filter((tipo) => tipo in (recursos || {})).map((tipo) => [tipo, recursos[tipo]]);
}

function iconoDeRecurso(tipo) {
  return ICONO_RECURSO[tipo] || tipo;
}

function conectarSocketMovil() {
  if (socket) return;
  if (typeof io === 'undefined') return;

  socket = io({ forceNew: true });

  socket.on('ronin:actualizado', (datos) => {
    if (datos?.ronin) {
      roninActual = datos.ronin;
      actualizarEstadoTarea();
    }
  });

  socket.on('recursos:actualizados', (datos) => {
    if (datos?.recursos) {
      recursosActuales = datos.recursos;
      renderRecursos();
    }
  });

  socket.on('mensaje:nuevo', (datos) => {
    if (datos?.mensaje) {
      mensajeActual = datos.mensaje;
      renderMensajeYComandos();
    }
  });
}

function renderRecursos() {
  const contenedor = $('#ordenes-recursos');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  for (const [tipo, cantidad] of recursosOrdenados(recursosActuales)) {
    const chip = document.createElement('span');
    chip.className = 'recurso-chip';
    const archivoIcono = iconoDeRecurso(tipo);
    chip.innerHTML = `<img src="/assets/icono-${archivoIcono}.png" alt="" /><span>${cantidad}</span>`;
    contenedor.append(chip);
  }
}

function actualizarEstadoTarea() {
  const pulso = $('#estado-pulso');
  const texto = $('#ordenes-estado-texto');
  const barra = $('#barra-progreso');
  const relleno = $('#progreso-relleno');
  const tiempo = $('#tiempo-restante');
  const botones = $$('.boton-opcion');

  if (relojTarea) {
    clearInterval(relojTarea);
    relojTarea = null;
  }

  const fin = roninActual?.tareaFin || 0;
  const ahora = Date.now();

  if (fin && fin > ahora) {
    pulso.classList.add('ocupado');
    barra.classList.remove('oculto');
    tiempo.classList.remove('oculto');

    for (const btn of botones) btn.disabled = true;

    let descripcion = 'Working…';
    try {
      const tarea = JSON.parse(roninActual.tarea || '{}');
      if (tarea.accion === 'recolectar') {
        const recurso = tarea.parametros?.recurso;
        descripcion = `Gathering ${ETIQUETA_RECURSO[recurso] || recurso || 'resources'}`;
      } else if (tarea.accion === 'construir') {
        descripcion = `Building the ${tarea.parametros?.edificio || 'sanctuary'}`;
      } else if (tarea.accion === 'descansar') {
        descripcion = 'Resting at sanctuary';
      }
    } catch {
      descripcion = 'Working on task…';
    }

    const duracionTotal = fin - ahora;

    const actualizarReloj = () => {
      const restanteMs = fin - Date.now();
      if (restanteMs <= 0) {
        clearInterval(relojTarea);
        relojTarea = null;
        texto.textContent = 'Finishing task…';
        tiempo.textContent = 'Awaiting update…';
        relleno.style.width = '100%';
        return;
      }

      const seg = Math.ceil(restanteMs / 1000);
      texto.textContent = `${descripcion}`;
      tiempo.textContent = `${seg}s remaining`;
      const pct = Math.max(0, Math.min(100, ((duracionTotal - restanteMs) / duracionTotal) * 100));
      relleno.style.width = `${pct}%`;
    };

    actualizarReloj();
    relojTarea = setInterval(actualizarReloj, 250);
  } else {
    pulso.classList.remove('ocupado');
    barra.classList.add('oculto');
    tiempo.classList.add('oculto');
    relleno.style.width = '0%';
    texto.textContent = 'At rest in the sanctuary';

    for (const btn of botones) btn.disabled = false;
  }
}

function renderMensajeYComandos() {
  const textoMensaje = $('#texto-mensaje');
  const lista = $('#lista-opciones');
  if (!textoMensaje || !lista) return;

  if (mensajeActual?.texto) {
    textoMensaje.textContent = mensajeActual.texto;
  }

  lista.innerHTML = '';
  const opcionesLista = mensajeActual?.opciones || [];
  const ocupado = Boolean(roninActual?.tareaFin && roninActual.tareaFin > Date.now());

  for (const op of opcionesLista) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton-opcion';
    btn.disabled = ocupado;
    btn.textContent = op.etiqueta || op.accion;
    btn.addEventListener('click', async () => {
      for (const b of $$('.boton-opcion')) b.disabled = true;
      try {
        const respuesta = await api('/api/acciones', {
          method: 'POST',
          body: JSON.stringify(op),
        });
        if (respuesta.ronin) {
          roninActual = respuesta.ronin;
          actualizarEstadoTarea();
        }
        if (respuesta.recursos) {
          recursosActuales = respuesta.recursos;
          renderRecursos();
        }
      } catch (err) {
        alert(err.message || 'Could not execute order.');
        actualizarEstadoTarea();
      }
    });
    lista.append(btn);
  }
}

function mostrarOrdenes(datos) {
  roninActual = datos.ronin;
  recursosActuales = datos.recursos || {};
  mensajeActual = datos.mensaje || null;

  document.body.dataset.bando = roninActual.bando;
  tituloMovil.textContent = 'Sanctuary';

  $('#ordenes-titulo').textContent = roninActual.nombre;
  $('#ordenes-camino').textContent = `${roninActual.bandoEtiqueta} path · Era ${roninActual.era} (Sanctuary)`;
  aplicarKamon($('#ordenes-kamon'), roninActual.kamon);

  renderRecursos();
  actualizarEstadoTarea();
  renderMensajeYComandos();

  conectarSocketMovil();
  mostrarVista('pantalla-ordenes');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Formulario de orden libre por texto
const formOrdenLibre = $('#form-orden-libre');
const entradaOrdenLibre = $('#entrada-orden-libre');
const respuestaOrdenLibre = $('#respuesta-orden-libre');

formOrdenLibre?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = entradaOrdenLibre.value.trim();
  if (!texto) return;

  const btn = $('#btn-enviar-orden');
  btn.disabled = true;
  respuestaOrdenLibre.classList.add('oculto');

  try {
    const res = await api('/api/orden-texto', {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
    // El rōnin contesta en su pergamino; si la orden se ejecutó, el estado cambia.
    if (res.mensaje) {
      mensajeActual = res.mensaje;
      renderMensajeYComandos();
    }
    if (res.ronin) {
      roninActual = res.ronin;
      actualizarEstadoTarea();
    }
    if (res.recursos) {
      recursosActuales = res.recursos;
      renderRecursos();
    }
    respuestaOrdenLibre.textContent = res.ejecutada
      ? `Order understood: ${res.accion?.etiqueta || res.accion?.accion}.`
      : res.ocupado
        ? 'Your rōnin is busy. He will listen when the task is done.'
        : res.mensaje?.texto || 'The rōnin heard your order.';
    respuestaOrdenLibre.classList.remove('oculto');
    entradaOrdenLibre.value = '';
  } catch (err) {
    respuestaOrdenLibre.textContent = err.message || 'Could not send order.';
    respuestaOrdenLibre.classList.remove('oculto');
  } finally {
    btn.disabled = false;
  }
});

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

    mostrarOrdenes(datos);
  } catch (error) {
    if (error.codigo === 'RONIN_EXISTENTE') {
      try {
        const actual = await api('/api/yo-movil');
        if (actual.ronin) {
          mostrarOrdenes(actual);
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
      mostrarOrdenes(datos);
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
