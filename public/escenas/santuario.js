// Escena del Santuario en Phaser (era 1).
// Muestra el mundo en tiempo real: fondo, rōnin animado con recoloreo,
// edificios por etapa y efectos ambientales (nieve o niebla).

import { piezaDeTocado } from '/recolorear.js';

export class EscenaSantuario extends Phaser.Scene {
  constructor() {
    super({ key: 'Santuario' });
  }

  init(datos) {
    this.datos = datos || {};
    this.ronin = this.datos.ronin || {};
    this.bando = this.ronin.bando || 'luz';
    this.tocado = piezaDeTocado(this.ronin.tocado);
    this.claveVariacion = `${this.bando}-${this.tocado}`;
    this.edificios = this.datos.edificios || [];
    this.recursos = this.datos.recursos || {};
    this.kimonoColor = this.datos.kimonoColor || '#2b3a67';
    this.hakamaColor = this.datos.hakamaColor || '#1a1a1a';

    this.edificiosSprites = {};
    this.roninSprite = null;
    this.sombraSprite = null;
    // Línea del suelo donde se apoyan rōnin y edificios (el fondo es 1920x1080).
    this.suelo = this.bando === 'luz' ? 985 : 990;
    this.destinoX = 960;
    this.destinoY = this.suelo;

    // Posiciones en el suelo del santuario según la composición de las maquetas:
    // la casa a la izquierda, el torii a la derecha, el rōnin trabaja en medio.
    const y = this.suelo;
    this.posicionesEdificios = {
      luz: {
        casa: { x: 330, y, escala: 1 },
        granero: { x: 745, y: y - 10, escala: 0.9 },
        altar: { x: 1330, y, escala: 0.9 },
        torii: { x: 1720, y, escala: 1 },
      },
      sombra: {
        choza: { x: 330, y, escala: 1 },
        pozo: { x: 745, y: y - 10, escala: 0.9 },
        altar: { x: 1330, y, escala: 0.9 },
        circulo: { x: 1720, y, escala: 1 },
      },
    };
  }

  preload() {
    // 1. Fondo del santuario
    this.load.image(`fondo_${this.bando}`, `/assets/fondo-${this.bando}.jpg`);

    // 2. Edificios de la Era 1 (3 etapas: cimientos, construccion, terminado)
    const edificiosBando =
      this.bando === 'luz'
        ? ['casa', 'granero', 'torii', 'altar']
        : ['choza', 'pozo', 'circulo', 'altar'];

    for (const tipo of edificiosBando) {
      for (const etapa of ['cimientos', 'construccion', 'terminado']) {
        const clave = `edificio_${this.bando}_${tipo}_${etapa}`;
        const ruta = `/assets/edificio-${this.bando}-${tipo}-${etapa}.png`;
        this.load.image(clave, ruta);
      }
    }

    // 3. Cuadros de animación del rōnin y sus máscaras
    this.conteoCuadros = {
      idle: 4,
      walk: this.claveVariacion === 'luz-mono' ? 5 : 6,
      chop: 6,
    };

    for (const [anim, total] of Object.entries(this.conteoCuadros)) {
      for (let i = 0; i < total; i++) {
        const base = `ronin-${this.claveVariacion}-${anim}-${i}`;
        this.load.image(`${base}_img`, `/assets/${base}.png`);
        this.load.image(`${base}_mask`, `/assets/${base}-mascara.png`);
      }
    }
  }

  create() {
    // 0. Textura vacía para los marcadores de edificios
    if (!this.textures.exists('vacio')) {
      const lienzoVacio = document.createElement('canvas');
      lienzoVacio.width = 2;
      lienzoVacio.height = 2;
      this.textures.addCanvas('vacio', lienzoVacio);
    }

    // 1. Fondo a pantalla completa
    const fondo = this.add.image(960, 540, `fondo_${this.bando}`);
    fondo.setDisplaySize(1920, 1080);
    fondo.setDepth(0);

    // 2. Efectos ambientales en código (nieve o niebla)
    this.crearEfectosAmbientales();

    // 3. Edificios en sus ubicaciones
    this.crearEdificios();

    // 4. Generar texturas recoloreadas del rōnin y sus animaciones
    this.generarTexturasRonin();
    this.crearAnimacionesRonin();

    // 5. Sprite del rōnin con sombra en el suelo
    this.crearRonin();

    // 6. Aplicar estado actual (idle, recolectando, construyendo, descansando)
    this.aplicarEstado(this.ronin.estado, this.ronin.tarea);
  }

  crearEfectosAmbientales() {
    if (this.bando === 'luz') {
      // Partículas de nieve cayendo suavemente
      const lienzoNieve = document.createElement('canvas');
      lienzoNieve.width = 8;
      lienzoNieve.height = 8;
      const ctx = lienzoNieve.getContext('2d');
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(4, 4, 3, 0, Math.PI * 2);
      ctx.fill();
      this.textures.addCanvas('particula_nieve', lienzoNieve);

      this.add.particles(0, -20, 'particula_nieve', {
        x: { min: 0, max: 1920 },
        y: -10,
        lifespan: { min: 6000, max: 9000 },
        speedY: { min: 60, max: 130 },
        speedX: { min: -25, max: 25 },
        scale: { min: 0.4, max: 1.1 },
        alpha: { start: 0.85, end: 0.2 },
        quantity: 2,
        frequency: 180,
      }).setDepth(15);
    } else {
      // Niebla violeta flotando en el pantano
      const lienzoNiebla = document.createElement('canvas');
      lienzoNiebla.width = 64;
      lienzoNiebla.height = 32;
      const ctx = lienzoNiebla.getContext('2d');
      const grad = ctx.createRadialGradient(32, 16, 2, 32, 16, 30);
      grad.addColorStop(0, 'rgba(160, 110, 210, 0.22)');
      grad.addColorStop(1, 'rgba(160, 110, 210, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 32);
      this.textures.addCanvas('particula_niebla', lienzoNiebla);

      this.add.particles(0, 800, 'particula_niebla', {
        x: { min: 0, max: 1920 },
        y: { min: 720, max: 960 },
        lifespan: 12000,
        speedX: { min: 10, max: 35 },
        speedY: { min: -5, max: 5 },
        scale: { min: 3, max: 6 },
        alpha: { start: 0, end: 0.4, ease: 'Sine.easeInOut' },
        quantity: 1,
        frequency: 1200,
      }).setDepth(15);
    }
  }

  crearEdificios() {
    const mapa = this.posicionesEdificios[this.bando] || {};

    for (const [tipo, pos] of Object.entries(mapa)) {
      // Marcador de posición; la textura real llega con el estado del servidor.
      const sprite = this.add.sprite(pos.x, pos.y, 'vacio');
      sprite.setOrigin(0.5, 1);
      sprite.setScale(pos.escala || 1);
      sprite.setDepth(5);
      sprite.setVisible(false);
      this.edificiosSprites[tipo] = sprite;
    }

    this.actualizarEdificios(this.edificios);
  }

  actualizarEdificios(edificios) {
    this.edificios = edificios || [];
    const existentes = Object.fromEntries(this.edificios.map((e) => [e.tipo, e]));

    const mapa = this.posicionesEdificios[this.bando] || {};
    for (const tipo of Object.keys(mapa)) {
      const sprite = this.edificiosSprites[tipo];
      if (!sprite) continue;

      const ed = existentes[tipo];
      if (ed) {
        const claveTextura = `edificio_${this.bando}_${tipo}_${ed.etapa}`;
        if (this.textures.exists(claveTextura)) {
          sprite.setTexture(claveTextura);
          sprite.setVisible(true);
          // Si está en cimientos o construcción recién empezada, opacidad según progreso
          if (ed.progreso === 0) {
            sprite.setAlpha(0.75);
          } else {
            sprite.setAlpha(1);
          }
        }
      } else {
        sprite.setVisible(false);
      }
    }
  }

  hexARgb(color) {
    let limpio = String(color || '').replace('#', '');
    if (limpio.length === 3) {
      limpio = limpio
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const n = Number.parseInt(limpio, 16);
    if (!Number.isFinite(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  generarTexturasRonin() {
    const colorKimono = this.hexARgb(this.kimonoColor);
    const colorHakama = this.hexARgb(this.hakamaColor);

    const ANCHO = 240;
    const ALTO = 320;

    for (const [anim, total] of Object.entries(this.conteoCuadros)) {
      for (let i = 0; i < total; i++) {
        const claveBase = `ronin-${this.claveVariacion}-${anim}-${i}`;
        const claveTextura = `ronin_tex_${anim}_${i}`;

        if (this.textures.exists(claveTextura)) continue;

        const lienzo = document.createElement('canvas');
        lienzo.width = ANCHO;
        lienzo.height = ALTO;
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });

        const imgSprite = this.textures.get(`${claveBase}_img`).getSourceImage();
        const imgMascara = this.textures.get(`${claveBase}_mask`).getSourceImage();

        ctx.drawImage(imgSprite, 0, 0, ANCHO, ALTO);

        if (colorKimono || colorHakama) {
          const imgData = ctx.getImageData(0, 0, ANCHO, ALTO);
          const pixeles = imgData.data;

          // Dibujar máscara en lienzo temporal para leer sus píxeles
          const lienzoMask = document.createElement('canvas');
          lienzoMask.width = ANCHO;
          lienzoMask.height = ALTO;
          const ctxMask = lienzoMask.getContext('2d', { willReadFrequently: true });
          ctxMask.drawImage(imgMascara, 0, 0, ANCHO, ALTO);
          const maskData = ctxMask.getImageData(0, 0, ANCHO, ALTO).data;

          // Calcular referencia de brillo
          let sumaKimono = 0, cuentaKimono = 0;
          let sumaHakama = 0, cuentaHakama = 0;

          for (let p = 0; p < pixeles.length; p += 4) {
            if (pixeles[p + 3] === 0) continue;
            const brillo = (pixeles[p] + pixeles[p + 1] + pixeles[p + 2]) / 3;
            if (maskData[p] > 128) {
              sumaKimono += brillo;
              cuentaKimono++;
            } else if (maskData[p + 2] > 128) {
              sumaHakama += brillo;
              cuentaHakama++;
            }
          }

          const refKimono = cuentaKimono ? sumaKimono / cuentaKimono : 1;
          const refHakama = cuentaHakama ? sumaHakama / cuentaHakama : 1;

          for (let p = 0; p < pixeles.length; p += 4) {
            if (pixeles[p + 3] === 0) continue;
            const brillo = (pixeles[p] + pixeles[p + 1] + pixeles[p + 2]) / 3;

            let colorTarget = null;
            let refTarget = 1;

            if (colorKimono && maskData[p] > 128) {
              colorTarget = colorKimono;
              refTarget = refKimono;
            } else if (colorHakama && maskData[p + 2] > 128) {
              colorTarget = colorHakama;
              refTarget = refHakama;
            }

            if (colorTarget) {
              const prop = brillo / refTarget;
              for (let c = 0; c < 3; c++) {
                let valor =
                  prop <= 1
                    ? colorTarget[c] * Math.max(prop, 0.25)
                    : colorTarget[c] + (brillo - refTarget);
                pixeles[p + c] = Math.max(0, Math.min(255, Math.round(valor)));
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
        }

        this.textures.addCanvas(claveTextura, lienzo);
      }
    }
  }

  crearAnimacionesRonin() {
    for (const [anim, total] of Object.entries(this.conteoCuadros)) {
      const fotogramas = [];
      for (let i = 0; i < total; i++) {
        fotogramas.push({ key: `ronin_tex_${anim}_${i}` });
      }

      const frameRate = anim === 'walk' ? 8 : anim === 'chop' ? 6 : 4;
      this.anims.create({
        key: `ronin_${anim}`,
        frames: fotogramas,
        frameRate,
        repeat: -1,
      });
    }
  }

  crearRonin() {
    // Sombra ovalada en el suelo
    const lienzoSombra = document.createElement('canvas');
    lienzoSombra.width = 120;
    lienzoSombra.height = 36;
    const ctx = lienzoSombra.getContext('2d');
    const grad = ctx.createRadialGradient(60, 18, 5, 60, 18, 55);
    grad.addColorStop(0, 'rgba(10, 8, 14, 0.55)');
    grad.addColorStop(1, 'rgba(10, 8, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 120, 36);
    this.textures.addCanvas('sombra_suelo', lienzoSombra);

    this.sombraSprite = this.add.image(960, this.suelo + 2, 'sombra_suelo');
    this.sombraSprite.setOrigin(0.5, 0.5);
    this.sombraSprite.setDepth(9);

    // Sprite animado del rōnin
    this.roninSprite = this.add.sprite(960, this.suelo, 'ronin_tex_idle_0');
    this.roninSprite.setOrigin(0.5, 1);
    this.roninSprite.setScale(0.95);
    this.roninSprite.setDepth(10);
    this.roninSprite.play('ronin_idle');
  }

  aplicarEstado(estado, tareaJson) {
    if (!this.roninSprite) return;

    let tarea = null;
    try {
      tarea = typeof tareaJson === 'string' ? JSON.parse(tareaJson) : tareaJson;
    } catch {
      tarea = null;
    }

    if (estado === 'recolectando') {
      // Camina al área de recolección (bosque o cantera en el costado)
      // Recolecta en el claro del centro, entre los edificios.
      const targetX = 1030;
      const targetY = this.suelo;
      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(false);
        this.roninSprite.play('ronin_chop');
      });
    } else if (estado === 'construyendo') {
      // Camina al sitio del edificio que se está construyendo
      const tipoEdificio = tarea?.parametros?.edificio || 'casa';
      const posEdificio = this.posicionesEdificios[this.bando]?.[tipoEdificio];
      // Se para a la derecha del edificio, mirando hacia él.
      const targetX = posEdificio ? posEdificio.x + 190 : 1030;
      const targetY = this.suelo;

      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(true);
        this.roninSprite.play('ronin_chop');
      });
    } else if (estado === 'descansando') {
      // Regresa a descansar junto a la casa / refugio
      const targetX = 560;
      const targetY = this.suelo;
      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(false);
        this.roninSprite.play('ronin_idle');
      });
    } else {
      // Estado despierto / ocioso en el claro central
      const targetX = 960;
      const targetY = this.suelo;
      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(false);
        this.roninSprite.play('ronin_idle');
      });
    }
  }

  // Un edificio cambió de etapa o progreso: se reemplaza en la lista y se redibuja.
  actualizarEdificio(edificio) {
    if (!edificio) return;
    const lista = (this.edificios || []).filter((e) => e.tipo !== edificio.tipo);
    lista.push(edificio);
    this.actualizarEdificios(lista);
  }

  moverRonin(targetX, targetY, alLlegar) {
    if (Math.abs(this.roninSprite.x - targetX) < 15 && Math.abs(this.roninSprite.y - targetY) < 15) {
      if (alLlegar) alLlegar();
      return;
    }

    // Mirar hacia la dirección de movimiento
    this.roninSprite.setFlipX(targetX < this.roninSprite.x);
    this.roninSprite.play('ronin_walk');

    const distancia = Phaser.Math.Distance.Between(
      this.roninSprite.x,
      this.roninSprite.y,
      targetX,
      targetY,
    );
    const duracion = Math.max(800, (distancia / 260) * 1000);

    // Mover simultáneamente rōnin y sombra
    this.tweens.killTweensOf(this.roninSprite);
    this.tweens.killTweensOf(this.sombraSprite);

    this.tweens.add({
      targets: this.roninSprite,
      x: targetX,
      y: targetY,
      duration: duracion,
      ease: 'Linear',
      onComplete: () => {
        if (alLlegar) alLlegar();
      },
    });

    this.tweens.add({
      targets: this.sombraSprite,
      x: targetX,
      y: targetY + 2,
      duration: duracion,
      ease: 'Linear',
    });
  }

  actualizarRonin(ronin) {
    if (!ronin) return;
    this.ronin = ronin;
    this.aplicarEstado(ronin.estado, ronin.tarea);
  }
}
