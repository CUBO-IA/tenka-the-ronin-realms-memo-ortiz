// Vista del santuario en la computadora: el canvas de Phaser más la capa de
// interfaz (recursos, estado, voz del rōnin). Solo muestra; la verdad llega
// del servidor por la API y por Socket.IO.

import { EscenaSantuario } from '/escenas/santuario.js';
import { aplicarKamon } from '/recolorear.js';

const $ = (selector) => document.querySelector(selector);

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
  cedro: 'Cedar',
  sauce: 'Willow',
  piedra: 'Stone',
  lodo: 'Mire',
  hierro: 'Iron sand',
  hongos: 'Mushrooms',
  arroz: 'Rice',
  mon: 'Mon',
};

// Orden fijo de la tira de recursos: materiales del bando, arroz y mon.
const ORDEN_RECURSOS = ['cedro', 'sauce', 'piedra', 'lodo', 'hierro', 'hongos', 'arroz', 'mon'];

const ETIQUETA_EDIFICIO = {
  casa: "Rōnin's House",
  granero: 'Granary',
  torii: 'Torii Gate',
  altar: 'Altar',
  choza: "Rōnin's Shack",
  pozo: 'Well of Mist',
  circulo: 'Circle of Stones',
};

let juego = null;
let relojTarea = null;
let estadoActual = { ronin: null, recursos: {}, edificios: [], mensaje: null, colores: {} };

function escena() {
  return juego?.scene?.getScene('Santuario') || null;
}

function crearJuego() {
  if (juego) return juego;
  juego = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'juego',
    width: 1920,
    height: 1080,
    backgroundColor: '#171522',
    pixelArt: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [EscenaSantuario],
  });
  return juego;
}

// Arranca (o reinicia) la escena con el estado completo del rōnin.
export function mostrarSantuario(estado) {
  estadoActual = { ...estadoActual, ...estado };
  const { ronin, colores } = estadoActual;

  renderIdentidad(ronin);
  renderRecursos(estadoActual.recursos);
  renderMensaje(estadoActual.mensaje);
  renderEstado(ronin);

  const datos = {
    ronin,
    edificios: estadoActual.edificios,
    recursos: estadoActual.recursos,
    kimonoColor: colores?.kimono,
    hakamaColor: colores?.hakama,
  };

  const partida = crearJuego();
  const iniciar = () => {
    if (partida.scene.isActive('Santuario')) {
      partida.scene.stop('Santuario');
    }
    partida.scene.start('Santuario', datos);
  };

  if (partida.isBooted) iniciar();
  else partida.events.once('ready', iniciar);
}

export function ocultarSantuario() {
  if (relojTarea) {
    clearInterval(relojTarea);
    relojTarea = null;
  }
  if (juego?.scene?.isActive('Santuario')) {
    juego.scene.stop('Santuario');
  }
}

export function actualizarRonin(ronin) {
  if (!ronin) return;
  estadoActual.ronin = ronin;
  renderEstado(ronin);
  escena()?.actualizarRonin(ronin);
}

export function actualizarRecursos(recursos) {
  if (!recursos) return;
  estadoActual.recursos = recursos;
  renderRecursos(recursos);
}

export function actualizarEdificios(edificios) {
  if (!Array.isArray(edificios)) return;
  estadoActual.edificios = edificios;
  escena()?.actualizarEdificios(edificios);
}

export function actualizarEdificio(edificio) {
  if (!edificio) return;
  const lista = estadoActual.edificios.filter((e) => e.tipo !== edificio.tipo);
  lista.push(edificio);
  estadoActual.edificios = lista;
  escena()?.actualizarEdificio(edificio);
}

export function mostrarMensaje(mensaje) {
  if (!mensaje) return;
  estadoActual.mensaje = mensaje;
  renderMensaje(mensaje);
  escena()?.mostrarGlobo(mensaje.texto);
}

function renderIdentidad(ronin) {
  if (!ronin) return;
  $('#hud-nombre').textContent = ronin.nombre;
  $('#hud-camino').textContent = `${ronin.bandoEtiqueta} path · Era ${ronin.era}`;
  aplicarKamon($('#hud-kamon'), ronin.kamon);
}

function renderRecursos(recursos) {
  const contenedor = $('#hud-recursos');
  contenedor.innerHTML = '';
  const ordenados = ORDEN_RECURSOS.filter((tipo) => tipo in (recursos || {})).map((tipo) => [tipo, recursos[tipo]]);
  for (const [tipo, cantidad] of ordenados) {
    const chip = document.createElement('span');
    chip.className = 'recurso';
    chip.title = ETIQUETA_RECURSO[tipo] || tipo;
    chip.innerHTML = `<img src="/assets/icono-${ICONO_RECURSO[tipo] || tipo}.png" alt="" /><span>${cantidad}</span>`;
    contenedor.append(chip);
  }
}

function renderMensaje(mensaje) {
  const texto = $('#hud-mensaje-texto');
  const caja = texto.closest('.hud-mensaje');
  if (!mensaje?.texto) {
    texto.textContent = '';
    caja.classList.add('oculto');
    return;
  }
  texto.textContent = mensaje.texto;
  caja.classList.remove('oculto');
}

function descripcionDeTarea(ronin) {
  let tarea = null;
  try {
    tarea = typeof ronin.tarea === 'string' ? JSON.parse(ronin.tarea) : ronin.tarea;
  } catch {
    tarea = null;
  }
  if (!tarea) return 'Working…';
  if (tarea.accion === 'recolectar') {
    return `Gathering ${(ETIQUETA_RECURSO[tarea.parametros?.recurso] || 'resources').toLowerCase()}`;
  }
  if (tarea.accion === 'construir') {
    const edificio = tarea.parametros?.edificio;
    return `Building the ${ETIQUETA_EDIFICIO[edificio] || edificio || 'sanctuary'}`;
  }
  if (tarea.accion === 'descansar') return 'Resting';
  return 'Working…';
}

function renderEstado(ronin) {
  const pulso = $('#hud-pulso');
  const texto = $('#hud-estado-texto');
  const barra = $('#hud-barra');
  const relleno = $('#hud-relleno');

  if (relojTarea) {
    clearInterval(relojTarea);
    relojTarea = null;
  }

  const fin = ronin?.tareaFin || 0;
  const ahora = Date.now();

  if (fin && fin > ahora) {
    pulso.classList.add('ocupado');
    barra.classList.remove('oculto');
    const descripcion = descripcionDeTarea(ronin);
    const total = fin - ahora;

    const tic = () => {
      const restante = fin - Date.now();
      if (restante <= 0) {
        clearInterval(relojTarea);
        relojTarea = null;
        texto.textContent = `${descripcion} · done`;
        relleno.style.width = '100%';
        return;
      }
      texto.textContent = `${descripcion} · ${Math.ceil(restante / 1000)}s`;
      relleno.style.width = `${Math.min(100, ((total - restante) / total) * 100)}%`;
    };
    tic();
    relojTarea = setInterval(tic, 250);
  } else {
    pulso.classList.remove('ocupado');
    barra.classList.add('oculto');
    relleno.style.width = '0%';
    texto.textContent = 'At rest · waiting for your command';
  }
}
