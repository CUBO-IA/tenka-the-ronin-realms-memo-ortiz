// Recolorea el sprite del rōnin en un canvas usando su máscara.
// La máscara marca el kimono en rojo y el hakama en azul; el resto (piel,
// faja, sandalias, espada, contornos) no se toca.
//
// Cómo se cambia el color sin perder el dibujo: cada prenda tiene un brillo
// de referencia (la mediana de sus píxeles). Un píxel más oscuro que la
// referencia oscurece el color nuevo en la misma proporción; uno más claro
// le suma la misma diferencia de brillo. Así los pliegues y las luces del
// pixel art quedan iguales con cualquier color.

const imagenes = new Map();
const piezas = new Map();

const ANCHO = 240;
const ALTO = 320;

function cargarImagen(ruta) {
  if (!imagenes.has(ruta)) {
    imagenes.set(
      ruta,
      new Promise((resolver, rechazar) => {
        const imagen = new Image();
        imagen.onload = () => resolver(imagen);
        imagen.onerror = () => rechazar(new Error(`No se pudo cargar ${ruta}`));
        imagen.src = ruta;
      }),
    );
  }
  return imagenes.get(ruta);
}

export function piezaDeTocado(tocado) {
  return tocado === 'mono' ? 'mono' : 'sombrero';
}

function datosDe(imagen) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(imagen, 0, 0, ANCHO, ALTO);
  return contexto.getImageData(0, 0, ANCHO, ALTO).data;
}

// Mediana del brillo de los píxeles que cumplen `pertenece`.
function brilloDeReferencia(pixeles, pertenece) {
  const brillos = [];
  for (let i = 0; i < pixeles.length; i += 4) {
    if (pixeles[i + 3] === 0 || !pertenece(i)) continue;
    brillos.push((pixeles[i] + pixeles[i + 1] + pixeles[i + 2]) / 3);
  }
  if (!brillos.length) return 1;
  brillos.sort((a, b) => a - b);
  return brillos[Math.floor(brillos.length / 2)] || 1;
}

export async function cargarPiezas(bando, tocado) {
  const pieza = piezaDeTocado(tocado);
  const clave = `${bando}-${pieza}`;

  if (!piezas.has(clave)) {
    const promesa = (async () => {
      const base = `/assets/ronin-${clave}`;
      const [sprite, mascara] = await Promise.all([
        cargarImagen(`${base}.png`),
        cargarImagen(`${base}-mascara.png`),
      ]);

      const datosSprite = datosDe(sprite);
      const datosMascara = datosDe(mascara);
      const esKimono = (i) => datosMascara[i] > 128;
      const esHakama = (i) => datosMascara[i + 2] > 128;

      return {
        sprite,
        datosMascara,
        referencia: {
          kimono: brilloDeReferencia(datosSprite, esKimono),
          hakama: brilloDeReferencia(datosSprite, esHakama),
        },
      };
    })();

    piezas.set(clave, promesa);
  }

  return piezas.get(clave);
}

function hexARgb(color) {
  let limpio = String(color || '').replace('#', '');
  if (limpio.length === 3) {
    limpio = limpio
      .split('')
      .map((caracter) => caracter + caracter)
      .join('');
  }
  const numero = Number.parseInt(limpio, 16);
  if (!Number.isFinite(numero)) return null;
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255];
}

function tenir(pixeles, i, color, referencia) {
  const brillo = (pixeles[i] + pixeles[i + 1] + pixeles[i + 2]) / 3;
  const proporcion = brillo / referencia;

  for (let canal = 0; canal < 3; canal += 1) {
    let valor;
    if (proporcion <= 1) {
      // Sombra: el color nuevo se oscurece en la misma proporción.
      valor = color[canal] * Math.max(proporcion, 0.25);
    } else {
      // Luz: se suma la misma diferencia de brillo que tenía el original.
      valor = color[canal] + (brillo - referencia);
    }
    pixeles[i + canal] = Math.max(0, Math.min(255, Math.round(valor)));
  }
}

export function pintarRonin(lienzo, dibujo, kimono, hakama) {
  if (!lienzo || !dibujo) return;

  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  contexto.clearRect(0, 0, lienzo.width, lienzo.height);
  contexto.drawImage(dibujo.sprite, 0, 0, lienzo.width, lienzo.height);

  const colorKimono = hexARgb(kimono);
  const colorHakama = hexARgb(hakama);
  if (!colorKimono && !colorHakama) return;

  const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
  const pixeles = imagen.data;
  const mascara = dibujo.datosMascara;

  for (let i = 0; i < pixeles.length; i += 4) {
    if (pixeles[i + 3] === 0) continue;

    if (colorKimono && mascara[i] > 128) {
      tenir(pixeles, i, colorKimono, dibujo.referencia.kimono);
    } else if (colorHakama && mascara[i + 2] > 128) {
      tenir(pixeles, i, colorHakama, dibujo.referencia.hakama);
    }
  }

  contexto.putImageData(imagen, 0, 0);
}

export function aplicarKamon(elemento, kamon) {
  if (!elemento || !kamon) return;
  const url = `url("/assets/kamon-${kamon}.png")`;
  elemento.style.setProperty('--kamon', url);
  elemento.style.webkitMaskImage = url;
  elemento.style.maskImage = url;
}
