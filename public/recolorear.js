// Recolorea el sprite del rōnin en un canvas usando su máscara.
// La máscara marca el kimono en rojo y la faja en verde; el resto no se toca.

const imagenes = new Map();
const piezas = new Map();

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

      const lienzo = document.createElement('canvas');
      lienzo.width = 240;
      lienzo.height = 320;
      const contexto = lienzo.getContext('2d', { willReadFrequently: true });
      contexto.drawImage(mascara, 0, 0, 240, 320);

      return {
        sprite,
        datosMascara: contexto.getImageData(0, 0, 240, 320).data,
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
  if (!Number.isFinite(numero)) return [47, 63, 107];
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255];
}

export function pintarRonin(lienzo, dibujo, kimono, faja) {
  if (!lienzo || !dibujo) return;

  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  contexto.clearRect(0, 0, lienzo.width, lienzo.height);
  contexto.drawImage(dibujo.sprite, 0, 0, lienzo.width, lienzo.height);

  const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
  const pixeles = imagen.data;
  const mascara = dibujo.datosMascara;
  const colores = {
    kimono: hexARgb(kimono),
    faja: hexARgb(faja),
  };

  for (let i = 0; i < pixeles.length; i += 4) {
    if (pixeles[i + 3] === 0) continue;

    const rojo = mascara[i];
    const verde = mascara[i + 1];
    let color = null;

    if (rojo > 128 && verde < 80) color = colores.kimono;
    else if (verde > 128 && rojo < 80) color = colores.faja;
    if (!color) continue;

    const brillo = (pixeles[i] + pixeles[i + 1] + pixeles[i + 2]) / 3;
    const factor = 0.85 + 0.45 * (brillo / 255);

    pixeles[i] = Math.min(255, Math.round(color[0] * factor));
    pixeles[i + 1] = Math.min(255, Math.round(color[1] * factor));
    pixeles[i + 2] = Math.min(255, Math.round(color[2] * factor));
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
