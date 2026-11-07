// Sonido de la computadora. La música son pistas de /assets/audio (una por
// bando y una de batalla) que se mezclan por Web Audio; los efectos cortos
// (espadas, tambores, gong, campanas) se sintetizan, sin archivos.
//
// El navegador no deja sonar nada sin un gesto del usuario: el sonido arranca
// con el botón "Sound" y la preferencia queda guardada en el navegador.

const CLAVE_GUARDADA = 'tenka-sonido';

const estado = {
  activo: false,
  ctx: null,
  maestro: null,
  canalMusica: null,
  canalEfectos: null,
  bando: null,
  oyentes: new Set(),
};

function ahora() {
  return estado.ctx ? estado.ctx.currentTime : 0;
}

function avisar() {
  for (const oyente of estado.oyentes) oyente(estado.activo);
}

export function sonidoActivo() {
  return estado.activo;
}

export function alCambiarSonido(oyente) {
  estado.oyentes.add(oyente);
  return () => estado.oyentes.delete(oyente);
}

// Si el usuario dejó el sonido encendido, se reanuda con su primer clic.
export function prepararSonido() {
  let guardado = null;
  try {
    guardado = localStorage.getItem(CLAVE_GUARDADA);
  } catch {
    guardado = null;
  }
  if (guardado !== '1') return;
  const reanudar = () => {
    document.removeEventListener('pointerdown', reanudar);
    document.removeEventListener('keydown', reanudar);
    activarSonido();
  };
  document.addEventListener('pointerdown', reanudar);
  document.addEventListener('keydown', reanudar);
}

function crearContexto() {
  if (estado.ctx) return estado.ctx;
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return null;
  const ctx = new Contexto();
  const maestro = ctx.createGain();
  maestro.gain.value = 0.7;
  maestro.connect(ctx.destination);
  const canalMusica = ctx.createGain();
  canalMusica.gain.value = 0.55;
  canalMusica.connect(maestro);
  const canalEfectos = ctx.createGain();
  canalEfectos.gain.value = 0.8;
  canalEfectos.connect(maestro);
  Object.assign(estado, { ctx, maestro, canalMusica, canalEfectos });
  return ctx;
}

export function activarSonido() {
  const ctx = crearContexto();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  estado.activo = true;
  try {
    localStorage.setItem(CLAVE_GUARDADA, '1');
  } catch {
    // Sin almacenamiento, igual suena esta vez.
  }
  if (estado.bando) fundir(estado.bando, 1);
  avisar();
  return true;
}

export function desactivarSonido() {
  estado.activo = false;
  try {
    localStorage.setItem(CLAVE_GUARDADA, '0');
  } catch {
    // Sin almacenamiento no hay nada que guardar.
  }
  detenerMusica(false);
  avisar();
}

export function alternarSonido() {
  if (estado.activo) desactivarSonido();
  else activarSonido();
  return estado.activo;
}

// ---------- Instrumentos ----------

function ruido(duracion) {
  const ctx = estado.ctx;
  const muestras = Math.max(1, Math.floor(ctx.sampleRate * duracion));
  const bufer = ctx.createBuffer(1, muestras, ctx.sampleRate);
  const datos = bufer.getChannelData(0);
  for (let i = 0; i < muestras; i += 1) datos[i] = Math.random() * 2 - 1;
  const fuente = ctx.createBufferSource();
  fuente.buffer = bufer;
  return fuente;
}

// Cuerda pulsada: ataque seco y caída larga, con un armónico suave.
function koto(frecuencia, cuando, fuerza = 1, salida = estado.canalMusica) {
  const ctx = estado.ctx;
  const ganancia = ctx.createGain();
  ganancia.gain.setValueAtTime(0.0001, cuando);
  ganancia.gain.exponentialRampToValueAtTime(0.5 * fuerza, cuando + 0.008);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + 1.6);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(3200, cuando);
  filtro.frequency.exponentialRampToValueAtTime(700, cuando + 1.2);
  const cuerda = ctx.createOscillator();
  cuerda.type = 'triangle';
  cuerda.frequency.value = frecuencia;
  const armonico = ctx.createOscillator();
  armonico.type = 'sine';
  armonico.frequency.value = frecuencia * 2;
  const gananciaArmonico = ctx.createGain();
  gananciaArmonico.gain.value = 0.25;
  cuerda.connect(filtro);
  armonico.connect(gananciaArmonico).connect(filtro);
  filtro.connect(ganancia).connect(salida);
  cuerda.start(cuando);
  armonico.start(cuando);
  cuerda.stop(cuando + 1.7);
  armonico.stop(cuando + 1.7);
}

// Tambor grave: un golpe que baja de tono, con el chasquido del parche.
function taiko(cuando, fuerza = 1, salida = estado.canalEfectos) {
  const ctx = estado.ctx;
  const ganancia = ctx.createGain();
  ganancia.gain.setValueAtTime(0.0001, cuando);
  ganancia.gain.exponentialRampToValueAtTime(0.9 * fuerza, cuando + 0.01);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.55);
  const cuerpo = ctx.createOscillator();
  cuerpo.type = 'sine';
  cuerpo.frequency.setValueAtTime(150, cuando);
  cuerpo.frequency.exponentialRampToValueAtTime(48, cuando + 0.35);
  cuerpo.connect(ganancia).connect(salida);
  const parche = ruido(0.06);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 1800;
  const gananciaParche = ctx.createGain();
  gananciaParche.gain.setValueAtTime(0.35 * fuerza, cuando);
  gananciaParche.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.06);
  parche.connect(filtro).connect(gananciaParche).connect(salida);
  cuerpo.start(cuando);
  parche.start(cuando);
  cuerpo.stop(cuando + 0.6);
}

function campana(frecuencia, cuando, duracion = 1.8, fuerza = 1, salida = estado.canalEfectos) {
  const ctx = estado.ctx;
  for (const [multiplo, peso] of [[1, 0.5], [2.76, 0.18], [5.4, 0.07]]) {
    const ganancia = ctx.createGain();
    ganancia.gain.setValueAtTime(0.0001, cuando);
    ganancia.gain.exponentialRampToValueAtTime(peso * fuerza, cuando + 0.005);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + duracion / (multiplo > 1 ? 2 : 1));
    const parcial = ctx.createOscillator();
    parcial.type = 'sine';
    parcial.frequency.value = frecuencia * multiplo;
    parcial.connect(ganancia).connect(salida);
    parcial.start(cuando);
    parcial.stop(cuando + duracion + 0.05);
  }
}

// ---------- Efectos ----------

function listo() {
  return estado.activo && estado.ctx && estado.ctx.state === 'running';
}

// Dos espadas chocan: chispa de ruido agudo y un timbre metálico corto.
export function sonarEspadas() {
  if (!listo()) return;
  const ctx = estado.ctx;
  const t = ahora();
  const chispa = ruido(0.14);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'highpass';
  filtro.frequency.value = 2600;
  const ganancia = ctx.createGain();
  ganancia.gain.setValueAtTime(0.55, t);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  chispa.connect(filtro).connect(ganancia).connect(estado.canalEfectos);
  chispa.start(t);
  const desafinacion = 0.9 + Math.random() * 0.2;
  for (const frecuencia of [2100 * desafinacion, 3300 * desafinacion]) {
    const metal = ctx.createOscillator();
    metal.type = 'triangle';
    metal.frequency.value = frecuencia;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    metal.connect(g).connect(estado.canalEfectos);
    metal.start(t);
    metal.stop(t + 0.35);
  }
}

// Tambores de guerra: tres golpes que anuncian la batalla.
export function sonarTambores() {
  if (!listo()) return;
  const t = ahora();
  taiko(t, 1);
  taiko(t + 0.42, 0.8);
  taiko(t + 0.72, 1.1);
}

// Un golpe de madera: el rōnin sale a trabajar.
export function sonarMadera() {
  if (!listo()) return;
  const ctx = estado.ctx;
  const t = ahora();
  const golpe = ctx.createOscillator();
  golpe.type = 'sine';
  golpe.frequency.setValueAtTime(420, t);
  golpe.frequency.exponentialRampToValueAtTime(160, t + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  golpe.connect(g).connect(estado.canalEfectos);
  golpe.start(t);
  golpe.stop(t + 0.13);
  const chasquido = ruido(0.03);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 1200;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.3, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  chasquido.connect(filtro).connect(g2).connect(estado.canalEfectos);
  chasquido.start(t);
}

// Campanita del santuario: llegó un mensaje del rōnin.
export function sonarCampana() {
  if (!listo()) return;
  campana(1320, ahora(), 1.4, 0.5);
}

// Campana grande: cambio de era.
export function sonarCampanaGrande() {
  if (!listo()) return;
  const t = ahora();
  campana(660, t, 2.6, 0.7);
  campana(880, t + 0.5, 2.2, 0.5);
}

// Gong: terminó la batalla.
export function sonarGong(victoria = true) {
  if (!listo()) return;
  const t = ahora();
  campana(victoria ? 196 : 123, t, 3.2, 0.9);
  campana(victoria ? 294 : 164, t + 0.03, 2.6, 0.5);
  if (victoria) {
    koto(587.33, t + 0.4, 0.8, estado.canalEfectos);
    koto(783.99, t + 0.65, 0.8, estado.canalEfectos);
    koto(1174.66, t + 0.9, 0.9, estado.canalEfectos);
  } else {
    taiko(t + 0.3, 0.7);
  }
}

// ---------- Música ----------

const PISTAS = {
  luz: '/assets/audio/musica-luz.mp3',
  sombra: '/assets/audio/musica-sombra.mp3',
  batalla: '/assets/audio/musica-batalla.mp3',
};
const pistas = new Map();
let pistaActual = null;

// Cada pista es un <audio> en loop enchufado al canal de música, con su
// propia ganancia para fundir entre una y otra.
function pista(nombre) {
  if (pistas.has(nombre)) return pistas.get(nombre);
  const elemento = new Audio(PISTAS[nombre]);
  elemento.loop = true;
  elemento.preload = 'auto';
  elemento.crossOrigin = 'anonymous';
  const ganancia = estado.ctx.createGain();
  ganancia.gain.value = 0.0001;
  estado.ctx.createMediaElementSource(elemento).connect(ganancia).connect(estado.canalMusica);
  const datos = { elemento, ganancia };
  pistas.set(nombre, datos);
  return datos;
}

function fundir(nombre, duracion = 1.5) {
  if (!listo() || !PISTAS[nombre]) return;
  if (pistaActual === nombre) return;
  const t = ahora();
  if (pistaActual && pistas.has(pistaActual)) {
    const saliente = pistas.get(pistaActual);
    saliente.ganancia.gain.cancelScheduledValues(t);
    saliente.ganancia.gain.setValueAtTime(Math.max(saliente.ganancia.gain.value, 0.0001), t);
    saliente.ganancia.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    const elemento = saliente.elemento;
    setTimeout(() => {
      if (pistaActual !== nombre) return;
      elemento.pause();
    }, duracion * 1000 + 50);
  }
  const entrante = pista(nombre);
  entrante.ganancia.gain.cancelScheduledValues(t);
  entrante.ganancia.gain.setValueAtTime(0.0001, t);
  entrante.ganancia.gain.exponentialRampToValueAtTime(1, t + duracion);
  entrante.elemento.play().catch(() => {});
  pistaActual = nombre;
}

// La música del bando que está en pantalla (si hay batalla, espera a que termine).
export function iniciarMusica(bando) {
  if (bando !== 'luz' && bando !== 'sombra') return;
  estado.bando = bando;
  if (pistaActual === 'batalla') return;
  fundir(bando, 2);
}

// Tambores y cuerdas de guerra mientras dura la pelea.
export function iniciarMusicaBatalla() {
  fundir('batalla', 0.8);
}

// Terminó la pelea: vuelve la música del santuario que se está viendo.
export function terminarMusicaBatalla() {
  if (pistaActual !== 'batalla') return;
  if (estado.bando) {
    pistaActual = null;
    fundir(estado.bando, 2.5);
    const batalla = pistas.get('batalla');
    if (batalla) {
      const t = ahora();
      batalla.ganancia.gain.cancelScheduledValues(t);
      batalla.ganancia.gain.setValueAtTime(Math.max(batalla.ganancia.gain.value, 0.0001), t);
      batalla.ganancia.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      setTimeout(() => {
        if (pistaActual !== 'batalla') batalla.elemento.pause();
      }, 2600);
    }
  } else {
    detenerMusica();
  }
}

export function detenerMusica(olvidarBando = true) {
  for (const { elemento, ganancia } of pistas.values()) {
    ganancia.gain.cancelScheduledValues(ahora());
    ganancia.gain.value = 0.0001;
    elemento.pause();
  }
  pistaActual = null;
  if (olvidarBando) estado.bando = null;
}
