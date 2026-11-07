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
let noLeidos = 0;

// --- La voz del rōnin: sonido y vibración al llegar un mensaje ---
let audio = null;

function prepararAudio() {
  if (audio || !('AudioContext' in window)) return;
  audio = new AudioContext();
}

// Una campanita corta, dibujada en código: no hace falta ningún archivo.
function sonarCampana() {
  if (!audio) return;
  try {
    if (audio.state === 'suspended') audio.resume();
    const ahora = audio.currentTime;
    for (const [tono, inicio] of [[880, 0], [1320, 0.12]]) {
      const osc = audio.createOscillator();
      const gan = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = tono;
      gan.gain.setValueAtTime(0.0001, ahora + inicio);
      gan.gain.exponentialRampToValueAtTime(0.25, ahora + inicio + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ahora + inicio + 0.9);
      osc.connect(gan).connect(audio.destination);
      osc.start(ahora + inicio);
      osc.stop(ahora + inicio + 1);
    }
  } catch {
    // Sin audio no pasa nada: el mensaje igual se ve.
  }
}

function avisarMensajeNuevo() {
  sonarCampana();
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
}

window.addEventListener('pointerdown', prepararAudio, { once: true });

function mostrarTarjetaBatalla(resultado, soyAtacante) {
  const gane = (resultado.ganador === 'atacante') === soyAtacante;
  const otro = soyAtacante ? resultado.defensor : resultado.atacante;
  const tarjeta = $('#tarjeta-batalla');
  tarjeta.classList.toggle('derrota', !gane);
  $('#batalla-antetitulo').textContent = soyAtacante ? `Your raid on ${otro.nombre}` : `${otro.nombre} raided your sanctuary`;
  $('#batalla-titulo').textContent = gane ? 'Victory' : 'Defeat';
  $('#batalla-detalle').textContent = gane
    ? soyAtacante
      ? `${roninActual.nombre} broke the gate.`
      : `${roninActual.nombre} held the gate.`
    : soyAtacante
      ? `${otro.nombre}'s walls held. ${roninActual.nombre} retreats.`
      : `${otro.nombre} broke through.`;
  $('#batalla-marcador').textContent = `Attack ${Math.round(resultado.ataque)} · Defense ${Math.round(resultado.defensa)}`;

  const botin = $('#batalla-botin');
  botin.innerHTML = '';
  const entradas = Object.entries(resultado.botin || {});
  const ganoBotin = resultado.ganador === 'atacante';
  for (const [tipo, cantidad] of entradas) {
    const chip = document.createElement('span');
    chip.className = 'recurso-chip';
    const signo = ganoBotin === soyAtacante ? '+' : '−';
    chip.innerHTML = `<img src="/assets/icono-${iconoDeRecurso(tipo)}.png" alt="" /><span>${signo}${cantidad}</span>`;
    botin.append(chip);
  }

  const extras = [];
  if (resultado.edificioDanado) {
    extras.push(
      soyAtacante
        ? `Their ${ETIQUETA_EDIFICIO[resultado.edificioDanado.tipo] || resultado.edificioDanado.tipo} fell a stage.`
        : `Our ${ETIQUETA_EDIFICIO[resultado.edificioDanado.tipo] || resultado.edificioDanado.tipo} fell a stage.`,
    );
  }
  const perdidas = Object.entries(resultado.tropasPerdidas || {});
  if (perdidas.length && soyAtacante) {
    extras.push(`Troops lost: ${perdidas.map(([t, n]) => `${n} ${t}`).join(', ')}.`);
  }
  if (!entradas.length && !extras.length) extras.push(gane ? 'No loot this time, only honor.' : 'Nothing was taken.');
  if (soyDefensorConEscudo(resultado, soyAtacante)) extras.push('A shield protects the sanctuary for a while.');
  $('#batalla-extra').textContent = extras.join(' ');
  tarjeta.classList.remove('oculto');
  avisarMensajeNuevo();
}

function soyDefensorConEscudo(resultado, soyAtacante) {
  return !soyAtacante && resultado.escudoHasta && resultado.escudoHasta > Date.now();
}

function renderContador() {
  const contador = $('#bandeja-contador');
  if (!contador) return;
  contador.textContent = String(noLeidos);
  contador.classList.toggle('oculto', noLeidos <= 0);
}

async function marcarLeidos() {
  noLeidos = 0;
  renderContador();
  try {
    await api('/api/mensajes/leidos', { method: 'POST' });
  } catch {
    // Si falla, el contador se corrige en la próxima carga.
  }
}

function tiempoRelativo(ms) {
  const segundos = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (segundos < 60) return 'just now';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min ago`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} h ago`;
  return new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

async function abrirBandeja() {
  const lista = $('#bandeja-lista');
  lista.innerHTML = '<li class="bandeja-vacia">Unrolling the scrolls…</li>';
  $('#bandeja').classList.remove('oculto');

  try {
    const datos = await api('/api/mensajes');
    lista.innerHTML = '';
    if (!datos.mensajes.length) {
      lista.innerHTML = '<li class="bandeja-vacia">Your rōnin has not spoken yet.</li>';
    }
    for (const mensaje of datos.mensajes) {
      const item = document.createElement('li');
      if (!mensaje.leido) item.classList.add('nuevo');
      const respuesta = mensaje.respondido
        ? `<p class="respuesta">You answered: ${etiquetaDeRespuesta(mensaje)}</p>`
        : '';
      item.innerHTML = `<div class="hora"><span>${tiempoRelativo(mensaje.creado)}</span>${mensaje.leido ? '' : '<span>new</span>'}</div><p class="texto">${escapar(mensaje.texto)}</p>${respuesta}`;
      lista.append(item);
    }
    marcarLeidos();
  } catch (error) {
    lista.innerHTML = `<li class="bandeja-vacia">${escapar(error.message || 'Could not open the scrolls.')}</li>`;
  }
}

function etiquetaDeRespuesta(mensaje) {
  const elegida = (mensaje.opciones || []).find((o) => o.accion === mensaje.respuesta);
  return escapar(elegida?.etiqueta || mensaje.respuesta || '');
}

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Instalar la app y recibir avisos ---
let promptInstalar = null;
const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const estaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  promptInstalar = evento;
  renderTarjetaInstalar();
});

function pushDisponible() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function renderTarjetaInstalar() {
  const tarjeta = $('#tarjeta-instalar');
  if (!tarjeta) return;
  const btnInstalar = $('#btn-instalar');
  const btnAvisos = $('#btn-avisos');
  const pasos = $('#instalar-pasos-ios');
  const texto = $('#instalar-texto');

  // Por una IP local sin https no se puede instalar ni avisar: no se ofrece.
  if (!window.isSecureContext) {
    tarjeta.classList.add('oculto');
    return;
  }

  btnInstalar.classList.add('oculto');
  btnAvisos.classList.add('oculto');
  pasos.classList.add('oculto');

  if (estaInstalada() || (!esIphone && pushDisponible())) {
    // Ya está instalada (o es Android): solo falta permitir los avisos.
    if (!pushDisponible() || Notification.permission === 'granted' || localStorage.getItem('tenka-avisos-no')) {
      tarjeta.classList.add('oculto');
      return;
    }
    texto.textContent = 'Let your rōnin reach you when a task is done or the sanctuary is attacked.';
    btnAvisos.classList.remove('oculto');
    tarjeta.classList.remove('oculto');
    return;
  }

  if (localStorage.getItem('tenka-instalar-no')) {
    tarjeta.classList.add('oculto');
    return;
  }

  texto.textContent = 'Install Tenka on your phone and your rōnin will reach you even when the screen is locked.';
  if (promptInstalar) btnInstalar.classList.remove('oculto');
  else if (esIphone) pasos.classList.remove('oculto');
  else {
    tarjeta.classList.add('oculto');
    return;
  }
  tarjeta.classList.remove('oculto');
}

function base64AUint8(cadena) {
  const relleno = '='.repeat((4 - (cadena.length % 4)) % 4);
  const base64 = (cadena + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

async function activarAvisos() {
  if (!pushDisponible()) return;
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    localStorage.setItem('tenka-avisos-no', '1');
    renderTarjetaInstalar();
    return;
  }
  try {
    const registro = await navigator.serviceWorker.ready;
    const { clave } = await api('/api/push/clave');
    const suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64AUint8(clave),
    });
    await api('/api/push/suscribir', { method: 'POST', body: JSON.stringify(suscripcion) });
  } catch {
    // Sin push, la conversación en vivo y la bandeja siguen funcionando.
  }
  renderTarjetaInstalar();
}

document.addEventListener('click', (evento) => {
  const objetivo = evento.target.closest('button');
  if (!objetivo) return;
  if (objetivo.id === 'btn-bandeja') abrirBandeja();
  if (objetivo.id === 'btn-cerrar-bandeja') $('#bandeja').classList.add('oculto');
  if (objetivo.id === 'btn-cerrar-batalla') $('#tarjeta-batalla').classList.add('oculto');
  if (objetivo.id === 'btn-cerrar-era') $('#tarjeta-era').classList.add('oculto');
  if (objetivo.id === 'btn-cerrar-instalar') {
    localStorage.setItem(estaInstalada() ? 'tenka-avisos-no' : 'tenka-instalar-no', '1');
    renderTarjetaInstalar();
  }
  if (objetivo.id === 'btn-instalar' && promptInstalar) {
    promptInstalar.prompt();
    promptInstalar.userChoice.finally(() => {
      promptInstalar = null;
      renderTarjetaInstalar();
    });
  }
  if (objetivo.id === 'btn-avisos') activarAvisos();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && noLeidos > 0 && roninActual) marcarLeidos();
});

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

const ETIQUETA_EDIFICIO = {
  casa: "Rōnin's House",
  granero: 'Granary',
  torii: 'Torii Gate',
  altar: 'Altar',
  choza: "Rōnin's Shack",
  pozo: 'Well of Mist',
  circulo: 'Circle of Stones',
  terrazas: 'Rice Terraces',
  forja: 'Forge',
  empalizada: 'Palisade',
  torre: 'Watchtower',
  huerto: 'Mushroom Grove',
  caldero: 'Ritual Cauldron',
  muro: 'Thorn Wall',
  farol: 'Spirit Lantern',
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

  // Se terminó una era: felicitación y qué se abre ahora.
  socket.on('era:nueva', (datos) => {
    if (!datos?.era) return;
    const nombre = datos.nombre || roninActual?.nombre || 'Your rōnin';
    $('#era-antetitulo').textContent = `Era ${datos.era - 1} complete`;
    $('#era-titulo').textContent = datos.era >= 3 ? 'Era 2 complete, Master' : 'Well done, Master';
    $('#era-detalle').textContent =
      datos.era >= 3
        ? `${nombre} has raised the whole village. This is where the story pauses for now.`
        : `${nombre} lit the altar flame. The mist lifts: the island can see your sanctuary now.`;
    $('#era-extra').textContent =
      datos.era >= 3
        ? 'Era 3 is coming: unite the clans, trade at the Crossroads Market and raise your fortress. Until then, defend what you built and keep your allies close.'
        : 'Era 2 opens the village: train troops, raise the terraces, forge and walls, offer alliances, and raid other sanctuaries for resources.';
    $('#tarjeta-era').classList.remove('oculto');
    avisarMensajeNuevo();
  });

  // Mi rōnin peleó: la tarjeta de victoria o derrota, antes del parte en el chat.
  socket.on('batalla:resultado', (resultado) => {
    if (!roninActual || !resultado?.atacante || !resultado?.defensor) return;
    const soyAtacante = resultado.atacante.id === roninActual.id;
    const soyDefensor = resultado.defensor.id === roninActual.id;
    if (!soyAtacante && !soyDefensor) return;
    mostrarTarjetaBatalla(resultado, soyAtacante);
  });

  socket.on('mensaje:nuevo', (datos) => {
    if (!datos?.mensaje) return;
    if (datos.salida || datos.mensaje.de === 'maestro') {
      agregarAlHilo(datos.mensaje);
      return;
    }
    mensajeActual = datos.mensaje;
    renderMensajeYComandos();
    avisarMensajeNuevo();
    if (document.hidden) {
      noLeidos += 1;
      renderContador();
    } else {
      marcarLeidos();
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
        const edificio = tarea.parametros?.edificio;
        descripcion = `Building the ${ETIQUETA_EDIFICIO[edificio] || edificio || 'sanctuary'}`;
      } else if (tarea.accion === 'descansar') {
        descripcion = 'Resting at sanctuary';
      } else if (tarea.accion === 'entrenar') {
        descripcion = `Training a ${tarea.parametros?.tropa || 'warrior'}`;
      } else if (tarea.accion === 'atacar') {
        descripcion = 'Marching to battle';
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

// El hilo: lo que dijo el rōnin y lo que dijo el maestro, en orden.
let hilo = [];

function agregarAlHilo(mensaje) {
  if (!mensaje || hilo.some((m) => m.id === mensaje.id)) return;
  hilo.push(mensaje);
  hilo.sort((a, b) => a.id - b.id);
  if (hilo.length > 40) hilo = hilo.slice(-40);
  renderHilo();
}

function renderHilo() {
  const lista = $('#hilo');
  if (!lista) return;
  lista.innerHTML = '';
  for (const m of hilo) {
    const item = document.createElement('li');
    const esMaestro = m.de === 'maestro';
    item.className = esMaestro ? 'maestro' : 'ronin';
    if (!esMaestro && m.opciones?.length === 0 && m.respondido) item.classList.add('salida');
    item.innerHTML = `${escapar(m.texto)}<span class="hora">${esMaestro ? 'You' : roninActual?.nombre || 'Rōnin'} · ${tiempoRelativo(m.creado)}</span>`;
    lista.append(item);
  }
  lista.scrollTop = lista.scrollHeight;
}

function mostrarPensando(si) {
  $('#pensando')?.classList.toggle('oculto', !si);
  if (si) {
    const lista = $('#hilo');
    if (lista) lista.scrollTop = lista.scrollHeight;
  }
}

async function cargarHilo() {
  try {
    const datos = await api('/api/mensajes');
    hilo = [...datos.mensajes].reverse().slice(-40);
    renderHilo();
  } catch {
    // Sin historial, el hilo arranca con el último mensaje.
  }
}

function renderMensajeYComandos() {
  const textoMensaje = $('#texto-mensaje');
  const lista = $('#lista-opciones');
  if (!textoMensaje || !lista) return;

  if (mensajeActual?.texto) {
    textoMensaje.textContent = mensajeActual.texto;
    agregarAlHilo(mensajeActual);
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
      agregarAlHilo({ id: (hilo.at(-1)?.id || 0) + 0.5, de: 'maestro', texto: op.etiqueta || op.accion, creado: Date.now() });
      try {
        const respuesta = await api('/api/acciones', {
          method: 'POST',
          body: JSON.stringify(op),
        });
        if (respuesta.salida) agregarAlHilo(respuesta.salida);
        if (respuesta.ronin) {
          roninActual = respuesta.ronin;
          actualizarEstadoTarea();
        }
        if (respuesta.recursos) {
          recursosActuales = respuesta.recursos;
          renderRecursos();
        }
      } catch (err) {
        agregarAlHilo({ id: (hilo.at(-1)?.id || 0) + 0.5, de: 'ronin', texto: err.message || 'I could not do that, master.', creado: Date.now(), opciones: [], respondido: true });
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

  cargarHilo();
  noLeidos = Number(datos.noLeidos || 0);
  renderContador();
  renderTarjetaInstalar();
  if (noLeidos > 0) marcarLeidos();

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
  agregarAlHilo({ id: (hilo.at(-1)?.id || 0) + 0.5, de: 'maestro', texto, creado: Date.now() });
  entradaOrdenLibre.value = '';
  mostrarPensando(true);

  try {
    const res = await api('/api/orden-texto', {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
    mostrarPensando(false);
    if (res.lineaMaestro) {
      hilo = hilo.filter((m) => !(m.de === 'maestro' && m.texto === texto && !Number.isInteger(m.id)));
      agregarAlHilo(res.lineaMaestro);
    }
    // El rōnin contesta en el hilo; si fue una orden, el estado cambia.
    if (res.mensaje) {
      mensajeActual = res.mensaje;
      renderMensajeYComandos();
    }
    if (res.salida) agregarAlHilo(res.salida);
    if (res.ronin) {
      roninActual = res.ronin;
      actualizarEstadoTarea();
    }
    if (res.recursos) {
      recursosActuales = res.recursos;
      renderRecursos();
    }
    if (res.ejecutada) {
      respuestaOrdenLibre.textContent = `Order understood: ${res.accion?.etiqueta || res.accion?.accion}.`;
      respuestaOrdenLibre.classList.remove('oculto');
    } else if (res.ocupado && res.accion) {
      respuestaOrdenLibre.textContent = 'Your rōnin is busy. He will take that order when the task is done.';
      respuestaOrdenLibre.classList.remove('oculto');
    }
  } catch (err) {
    mostrarPensando(false);
    agregarAlHilo({ id: (hilo.at(-1)?.id || 0) + 0.5, de: 'ronin', texto: err.message || 'The wind took your words, master. Say it again.', creado: Date.now(), opciones: [], respondido: true });
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
