// Script para generar un QR con estilo visual de Tenka
// Usa la librería 'qrcode' (ya incluida en dependencies)
// La imagen resultante se guarda en public/assets/qr-tenka.png

import QRCode from 'qrcode';
import { writeFile } from 'fs/promises';
import path from 'path';

const url = 'https://examined-nightlife-cloth-waiver.trycloudflare.com';
// Ruta de salida relativa al proyecto
const outputPath = path.resolve(process.cwd(), 'public', 'assets', 'qr-tenka.png');

// Opciones de estilo: colores basados en la paleta de Tenka (negro y dorado):
const options = {
  color: {
    dark: '#2C1B18', // tono oscuro similar a la estética de Tenka
    light: '#F5F0E1', // fondo claro, casi beige
  },
  margin: 2,
  width: 512,
};

(async () => {
  try {
    const dataUrl = await QRCode.toDataURL(url, options);
    // dataUrl es algo como 'data:image/png;base64,...'
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    await writeFile(outputPath, buffer);
    console.log(`QR generado en ${outputPath}`);
  } catch (err) {
    console.error('Error generando QR:', err);
    process.exit(1);
  }
})();
