// Sonido de la computadora, sintetizado con Web Audio: sin archivos ni
// licencias. Música tranquila por bando (koto para la luz, dron y shakuhachi
// para la sombra) y efectos cortos para lo que pasa en el mundo.
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
  reloj: null,
  musica: null,
  oyentes: new Set(),
};

// Escalas japonesas: "yo" (pentatónica alegre) para la luz e "in"
// (hirajōshi, más sombría) para la sombra. Frecuencias en Hz.
const ESCALAS = {
  luz: [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.26, 783.99],
  sombra: [146.83, 155.56, 196.0, 220.0, 233.08, 293.66, 311.13, 392.0],
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
  canalMusica.gain.value = 0.45;
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
  if (estado.bando) iniciarMusica(estado.bando);
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

// Flauta de bambú: entra despacio, vibra y se apaga con algo de aire.
function shakuhachi(frecuencia, cuando, duracion = 1.6, fuerza = 1, salida = estado.canalMusica) {
  const ctx = estado.ctx;
  const ganancia = ctx.createGain();
  ganancia.gain.setValueAtTime(0.0001, cuando);
  ganancia.gain.exponentialRampToValueAtTime(0.32 * fuerza, cuando + 0.25);
  ganancia.gain.setValueAtTime(0.32 * fuerza, cuando + duracion - 0.45);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + duracion);
  const voz = ctx.createOscillator();
  voz.type = 'sine';
  voz.frequency.setValueAtTime(frecuencia * 0.985, cuando);
  voz.frequency.exponentialRampToValueAtTime(frecuencia, cuando + 0.2);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5;
  const profundidad = ctx.createGain();
  profundidad.gain.setValueAtTime(0, cuando);
  profundidad.gain.linearRampToValueAtTime(frecuencia * 0.012, cuando + 0.6);
  vibrato.connect(profundidad).connect(voz.frequency);
  // Aire: ruido angosto alrededor de la nota.
  const aire = ruido(duracion);
  const filtroAire = ctx.createBiquadFilter();
  filtroAire.type = 'bandpass';
  filtroAire.frequency.value = frecuencia * 2;
  filtroAire.Q.value = 12;
  const gananciaAire = ctx.createGain();
  gananciaAire.gain.value = 0.12;
  aire.connect(filtroAire).connect(gananciaAire).connect(ganancia);
  voz.connect(ganancia).connect(salida);
  voz.start(cuando);
  vibrato.start(cuando);
  aire.start(cuando);
  voz.stop(cuando + duracion + 0.05);
  vibrato.stop(cuando + duracion + 0.05);
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

// ---------- Música de santuario ----------

function elegirNota(escala, anterior) {
  // Paso pequeño casi siempre, salto de vez en cuando: suena a melodía.
  if (anterior == null || Math.random() < 0.18) return Math.floor(Math.random() * escala.length);
  const paso = Math.random() < 0.5 ? -1 : 1;
  const salto = Math.random() < 0.25 ? 2 : 1;
  return Math.max(0, Math.min(escala.length - 1, anterior + paso * salto));
}

function musicaLuz() {
  const escala = ESCALAS.luz;
  let siguiente = ahora() + 0.3;
  let indice = null;
  let pulso = 0;
  const paso = 0.5;
  return {
    programar(hasta) {
      while (siguiente < hasta) {
        const t = siguiente;
        if (pulso % 8 === 0) koto(escala[0] / 2, t, 0.55);
        if (Math.random() < 0.6) {
          indice = elegirNota(escala, indice);
          koto(escala[indice], t, 0.65 + Math.random() * 0.25);
        }
        if (pulso % 16 === 12 && Math.random() < 0.5) campana(1760, t, 2, 0.12, estado.canalMusica);
        pulso += 1;
        siguiente += paso * (Math.random() < 0.15 ? 2 : 1);
      }
    },
    detener() {},
  };
}

function musicaSombra() {
  const ctx = estado.ctx;
  const escala = ESCALAS.sombra;
  // Dron grave y constante, con un filtro que respira.
  const salidaDron = ctx.createGain();
  salidaDron.gain.setValueAtTime(0.0001, ahora());
  salidaDron.gain.exponentialRampToValueAtTime(0.12, ahora() + 3);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 220;
  const respiracion = ctx.createOscillator();
  respiracion.frequency.value = 0.07;
  const profundidad = ctx.createGain();
  profundidad.gain.value = 90;
  respiracion.connect(profundidad).connect(filtro.frequency);
  respiracion.start();
  const voces = [-6, 5].map((centavos) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 73.42;
    osc.detune.value = centavos;
    osc.connect(filtro);
    osc.start();
    return osc;
  });
  filtro.connect(salidaDron).connect(estado.canalMusica);

  let siguienteNota = ahora() + 2;
  let siguienteTambor = ahora() + 1.5;
  let indice = null;
  return {
    programar(hasta) {
      while (siguienteNota < hasta) {
        indice = elegirNota(escala, indice);
        const duracion = 1.4 + Math.random() * 1.8;
        shakuhachi(escala[indice] * 2, siguienteNota, duracion, 0.5 + Math.random() * 0.3);
        siguienteNota += duracion + 1.5 + Math.random() * 3;
      }
      while (siguienteTambor < hasta) {
        taiko(siguienteTambor, 0.22, estado.canalMusica);
        taiko(siguienteTambor + 0.36, 0.14, estado.canalMusica);
        siguienteTambor += 3.6;
      }
    },
    detener() {
      const t = ahora();
      salidaDron.gain.cancelScheduledValues(t);
      salidaDron.gain.setValueAtTime(salidaDron.gain.value, t);
      salidaDron.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      for (const osc of voces) osc.stop(t + 1.3);
      respiracion.stop(t + 1.3);
    },
  };
}

// Arranca (o cambia) la música del bando que está en pantalla.
export function iniciarMusica(bando) {
  if (bando !== 'luz' && bando !== 'sombra') return;
  const mismo = estado.bando === bando && estado.musica;
  estado.bando = bando;
  if (!listo() || mismo) return;
  detenerMusica(false);
  estado.musica = bando === 'luz' ? musicaLuz() : musicaSombra();
  const programar = () => estado.musica && estado.musica.programar(ahora() + 1.2);
  programar();
  estado.reloj = setInterval(programar, 400);
}

export function detenerMusica(olvidarBando = true) {
  if (estado.reloj) clearInterval(estado.reloj);
  estado.reloj = null;
  if (estado.musica) estado.musica.detener();
  estado.musica = null;
  if (olvidarBando) estado.bando = null;
}
