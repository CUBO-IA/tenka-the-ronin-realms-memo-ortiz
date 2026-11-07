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
    // Las texturas recoloreadas son de este rōnin: otro rōnin genera las suyas.
    this.prefijo = `ronin_${this.ronin.id || 'x'}_`;
    this.edificios = this.datos.edificios || [];
    this.recursos = this.datos.recursos || {};
    this.kimonoColor = this.datos.kimonoColor || '#2b3a67';
    this.hakamaColor = this.datos.hakamaColor || '#1a1a1a';

    this.edificiosSprites = {};
    this.roninSprite = null;
    this.sombraSprite = null;
    // Línea del suelo donde se apoyan rōnin y edificios (el fondo es 1920x1080).
    this.suelo = this.bando === 'luz' ? 985 : 990;
    this.sueloRonin = this.suelo + 28;
    this.destinoX = 960;
    this.destinoY = this.suelo;

    // Composición por zonas (fondo 1920x1080, suelo en `y`). Escala: la casa
    // mide el doble que el rōnin, como en las maquetas. La fila de atrás es
    // más chica y queda detrás de la de adelante.
    const y = this.suelo;
    const atras = y - 95;
    this.posicionesEdificios = {
      luz: {
        empalizada: { x: 95, y: y + 20, escala: 0.9, fondo: true },
        casa: { x: 290, y, escala: 1.3 },
        terrazas: { x: 680, y: atras, escala: 0.85, fondo: true },
        granero: { x: 930, y: atras, escala: 0.85, fondo: true },
        forja: { x: 1180, y: atras, escala: 0.85, fondo: true },
        altar: { x: 1440, y: atras, escala: 0.85, fondo: true },
        torre: { x: 1650, y: atras - 10, escala: 0.8, fondo: true },
        torii: { x: 1790, y, escala: 1.2 },
      },
      sombra: {
        muro: { x: 95, y: y + 20, escala: 0.9, fondo: true },
        choza: { x: 290, y, escala: 1.3 },
        huerto: { x: 680, y: atras, escala: 0.85, fondo: true },
        pozo: { x: 930, y: atras, escala: 0.85, fondo: true },
        caldero: { x: 1180, y: atras, escala: 0.85, fondo: true },
        altar: { x: 1440, y: atras, escala: 0.85, fondo: true },
        farol: { x: 1650, y: atras - 10, escala: 0.8, fondo: true },
        circulo: { x: 1790, y, escala: 1.2 },
      },
    };

    // Cada aldeano trabaja en su edificio (granjero en las terrazas, herrero en
    // la forja); los guardias van al patio de armas, con las tropas.
    this.aldeanosPorEdificio = {
      terrazas: { tipo: 'luz-granjero-sembrar', cuadros: 2, ritmo: 2, x: 640, y: atras + 8, guardia: false, flip: true, escala: 0.52 },
      forja: { tipo: 'luz-herrero', cuadros: 4, ritmo: 5, x: 1255, y: atras + 10, guardia: false },
      empalizada: { tipo: 'luz-guardia', cuadros: 4, ritmo: 6, guardia: true },
      torre: { tipo: 'luz-guardia', cuadros: 4, ritmo: 6, guardia: true },
      huerto: { tipo: 'sombra-recolector', cuadros: 4, ritmo: 5, x: 640, y: atras + 8, guardia: false, flip: true, escala: 0.52 },
      caldero: { tipo: 'sombra-alquimista', cuadros: 4, ritmo: 5, x: 1255, y: atras + 10, guardia: false },
      muro: { tipo: 'sombra-espectro', cuadros: 4, ritmo: 6, guardia: true },
      farol: { tipo: 'sombra-espectro', cuadros: 4, ritmo: 6, guardia: true },
    };
    // El patio de armas: filas de a 5 a la derecha del claro, frente al torii.
    this.patio = { x: 1440, y: y - 70, paso: 52, porFila: 5, filaAlto: 22 };
    this.escalaRonin = 0.72;
    this.escalaAldeano = 0.62;
    this.escalaTropa = 0.6;
    this.aldeanos = {};
    this.tropas = this.datos.tropas || {};
    this.tropasSprites = [];
    this.tiposTropa = this.bando === 'luz' ? ['samurai', 'arquero'] : ['oni', 'kitsune'];
  }

  preload() {
    // 1. Fondo del santuario
    if (!this.textures.exists(`fondo_${this.bando}`)) this.load.image(`fondo_${this.bando}`, `/assets/fondo-${this.bando}.jpg`);

    // 2. Edificios de la Era 1 (3 etapas: cimientos, construccion, terminado)
    const edificiosBando =
      this.bando === 'luz'
        ? ['casa', 'granero', 'torii', 'altar', 'terrazas', 'forja', 'empalizada', 'torre']
        : ['choza', 'pozo', 'circulo', 'altar', 'huerto', 'caldero', 'muro', 'farol'];

    // Tropas del bando (4 cuadros de marcha)
    for (const tipo of this.tiposTropa) {
      for (let i = 0; i < 4; i += 1) {
        if (!this.textures.exists(`tropa_${tipo}_${i}`)) this.load.image(`tropa_${tipo}_${i}`, `/assets/tropa-${tipo}-caminar-${i}.png`);
      }
    }

    // Aldeanos del bando
    for (const info of Object.values(this.aldeanosPorEdificio)) {
      if (!info.tipo.startsWith(this.bando)) continue;
      for (let i = 0; i < info.cuadros; i += 1) {
        if (!this.textures.exists(`aldeano_${info.tipo}_${i}`)) this.load.image(`aldeano_${info.tipo}_${i}`, `/assets/aldeano-${info.tipo}-${i}.png`);
      }
    }

    for (const tipo of edificiosBando) {
      for (const etapa of ['cimientos', 'construccion', 'terminado']) {
        const clave = `edificio_${this.bando}_${tipo}_${etapa}`;
        const ruta = `/assets/edificio-${this.bando}-${tipo}-${etapa}.png`;
        if (!this.textures.exists(clave)) this.load.image(clave, ruta);
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
        if (!this.textures.exists(`${base}_img`)) this.load.image(`${base}_img`, `/assets/${base}.png`);
        if (!this.textures.exists(`${base}_mask`)) this.load.image(`${base}_mask`, `/assets/${base}-mascara.png`);
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

    // 7. Las tropas, formadas frente a la puerta
    this.actualizarTropas(this.tropas);
  }

  // ---------- Tropas ----------

  actualizarTropas(tropas) {
    this.tropas = tropas || {};
    for (const sprite of this.tropasSprites) sprite.destroy();
    this.tropasSprites = [];

    for (const tipo of this.tiposTropa) {
      const cantidad = Math.min(10, this.tropas[tipo] || 0);
      const animacion = `tropa_${tipo}`;
      if (cantidad > 0 && !this.anims.exists(animacion)) {
        this.anims.create({
          key: animacion,
          frames: [0, 1, 2, 3].map((i) => ({ key: `tropa_${tipo}_${i}` })),
          frameRate: 6,
          repeat: -1,
        });
      }
      for (let i = 0; i < cantidad; i += 1) {
        const sprite = this.add.sprite(this.patio.x, this.patio.y, `tropa_${tipo}_0`);
        sprite.setOrigin(0.5, 1);
        sprite.setScale(this.escalaTropa);
        sprite.texturaQuieta = `tropa_${tipo}_0`;
        sprite.animacionPaso = animacion;
        this.tropasSprites.push(sprite);
      }
    }
    this.formarPatio();
  }

  // Ronda continua entre dos puntos: una sola animación de caminar, sin cortes.
  patrullar(sprite, centro, rango) {
    const animacion = sprite.animacionPaso;
    if (animacion && this.anims.exists(animacion)) sprite.play(animacion, true);
    sprite.x = centro - rango;
    sprite.setFlipX(false);
    this.tweens.add({
      targets: sprite,
      x: centro + rango,
      duration: rango * 2 * 28,
      ease: 'Linear',
      yoyo: true,
      repeat: -1,
      onYoyo: () => sprite.active && sprite.setFlipX(true),
      onRepeat: () => sprite.active && sprite.setFlipX(false),
    });
  }

  // Guardias y tropas en filas de a cinco; cada nuevo se suma al final.
  formarPatio() {
    const guardias = Object.values(this.aldeanos || {}).filter((sprite) => sprite.esGuardia && sprite.active);
    const fila = [...guardias, ...this.tropasSprites];
    fila.forEach((sprite, i) => {
      const columna = i % this.patio.porFila;
      const renglon = Math.floor(i / this.patio.porFila);
      const x = this.patio.x + columna * this.patio.paso + renglon * 18;
      const y = this.patio.y - renglon * this.patio.filaAlto;
      this.tweens.killTweensOf(sprite);
      sprite.setDepth(9 - renglon);
      sprite.setFlipX(false);
      sprite.x = x;
      sprite.y = y;
      sprite.anims?.stop();
      if (sprite.texturaQuieta) sprite.setTexture(sprite.texturaQuieta);
      // Las tropas montan guardia quietas; los guardias patrullan ida y vuelta,
      // a paso parejo y sin frenar, mirando hacia donde caminan.
      if (sprite.esGuardia) this.patrullar(sprite, x, 70 + renglon * 20);
    });
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
      if (!this.textures.exists('particula_nieve')) this.textures.addCanvas('particula_nieve', lienzoNieve);

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
      if (!this.textures.exists('particula_niebla')) this.textures.addCanvas('particula_niebla', lienzoNiebla);

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
      sprite.setDepth(pos.fondo ? 4 : 5);
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
      // El aldeano llega cuando su edificio está terminado.
      const info = this.aldeanosPorEdificio[tipo];
      if (info) {
        if (ed?.etapa === 'terminado') this.crearAldeano(tipo, info);
        else this.quitarAldeano(tipo);
      }
    }
  }

  // ---------- Aldeanos ----------

  crearAldeano(tipo, info) {
    if (this.aldeanos[tipo]) return;
    const animacion = `aldeano_${info.tipo}`;
    if (!this.anims.exists(animacion)) {
      const cuadros = [];
      for (let i = 0; i < info.cuadros; i += 1) cuadros.push({ key: `aldeano_${info.tipo}_${i}` });
      this.anims.create({ key: animacion, frames: cuadros, frameRate: info.ritmo, repeat: -1 });
    }
    const sprite = this.add.sprite(info.x || 0, info.y || this.suelo, `aldeano_${info.tipo}_0`);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(info.escala || this.escalaAldeano);
    sprite.setDepth(info.guardia ? 8 : 4.5);
    if (info.flip) sprite.setFlipX(true);
    sprite.esGuardia = Boolean(info.guardia);
    sprite.texturaQuieta = `aldeano_${info.tipo}_0`;
    sprite.animacionPaso = animacion;
    if (!info.guardia) sprite.play(animacion);
    this.aldeanos[tipo] = sprite;
    if (info.guardia) this.formarPatio();
  }

  // Un paseo corto y lento, ida y vuelta, mirando hacia donde camina.
  pasear(sprite, centro, rango = 90) {
    if (!sprite.active) return;
    const destino = centro + Phaser.Math.Between(-rango, rango);
    sprite.setFlipX(destino < sprite.x);
    const animacion = sprite.animacionPaso;
    if (animacion && this.anims.exists(animacion)) sprite.play(animacion, true);
    this.tweens.add({
      targets: sprite,
      x: destino,
      duration: Math.abs(destino - sprite.x) * 20 + 300,
      ease: 'Linear',
      onComplete: () => {
        if (!sprite.active) return;
        sprite.anims.stop();
        if (sprite.texturaQuieta) sprite.setTexture(sprite.texturaQuieta);
        this.time.delayedCall(Phaser.Math.Between(1500, 4000), () => {
          if (sprite.active) this.pasear(sprite, centro, rango);
        });
      },
    });
  }

  quitarAldeano(tipo) {
    if (!this.aldeanos[tipo]) return;
    this.aldeanos[tipo].destroy();
    delete this.aldeanos[tipo];
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
        const claveTextura = `${this.prefijo}${anim}_${i}`;

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
        fotogramas.push({ key: `${this.prefijo}${anim}_${i}` });
      }

      const frameRate = anim === 'walk' ? 8 : anim === 'chop' ? 6 : 4;
      const clave = `${this.prefijo}${anim}`;
      if (this.anims.exists(clave)) this.anims.remove(clave);
      this.anims.create({
        key: clave,
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
    if (!this.textures.exists('sombra_suelo')) this.textures.addCanvas('sombra_suelo', lienzoSombra);

    this.sombraSprite = this.add.image(960, this.sueloRonin + 2, 'sombra_suelo');
    this.sombraSprite.setOrigin(0.5, 0.5);
    this.sombraSprite.setDepth(9);

    // Sprite animado del rōnin
    this.roninSprite = this.add.sprite(960, this.sueloRonin, `${this.prefijo}idle_0`);
    this.roninSprite.setOrigin(0.5, 1);
    this.roninSprite.setScale(this.escalaRonin);
    this.roninSprite.setDepth(10);
    this.roninSprite.play(`${this.prefijo}idle`);
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
      const targetY = this.sueloRonin;
      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(false);
        this.roninSprite.play(`${this.prefijo}chop`);
      });
    } else if (estado === 'construyendo') {
      // Camina al sitio del edificio que se está construyendo
      const tipoEdificio = tarea?.parametros?.edificio || 'casa';
      const posEdificio = this.posicionesEdificios[this.bando]?.[tipoEdificio];
      // Se para a la derecha del edificio, mirando hacia él.
      const ancho = posEdificio ? 150 * (posEdificio.escala || 1) : 150;
      const targetX = posEdificio ? Phaser.Math.Clamp(posEdificio.x + ancho, 120, 1800) : 1030;
      const targetY = this.sueloRonin;

      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(true);
        this.roninSprite.play(`${this.prefijo}chop`);
      });
    } else if (estado === 'entrenando') {
      // Entrena en el claro: golpes al aire frente al santuario.
      this.moverRonin(1180, this.sueloRonin, () => {
        this.roninSprite.setFlipX(true);
        this.roninSprite.play(`${this.prefijo}chop`);
      });
    } else if (estado === 'atacando') {
      // Marcha: sale por la derecha del santuario hacia la isla.
      this.ocultarGlobo();
      this.moverRonin(2050, this.sueloRonin, () => {
        this.roninSprite.play(`${this.prefijo}idle`);
      });
    } else if (estado === 'descansando') {
      // Regresa a descansar junto a la casa / refugio
      const targetX = 560;
      const targetY = this.sueloRonin;
      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(false);
        this.roninSprite.play(`${this.prefijo}idle`);
      });
    } else {
      // Estado despierto / ocioso en el claro central
      const targetX = 960;
      const targetY = this.sueloRonin;
      this.moverRonin(targetX, targetY, () => {
        this.roninSprite.setFlipX(false);
        this.roninSprite.play(`${this.prefijo}idle`);
      });
    }
  }

  // ---------- Pelea en este santuario ----------

  // Llega un atacante por el costado izquierdo y se traba con el rōnin.
  mostrarAtaque(atacante) {
    if (!atacante || !this.roninSprite) return;
    this.terminarAtaque();
    const variacion = `${atacante.bando}-${atacante.tocado === 'mono' ? 'mono' : 'sombrero'}`;
    const claves = ['idle-0', 'walk-0', 'walk-1', 'walk-2', 'walk-3', 'chop-0', 'chop-1', 'chop-2', 'chop-3'];
    for (const cuadro of claves) {
      const clave = `atacante_${variacion}_${cuadro}`;
      if (!this.textures.exists(clave)) this.load.image(clave, `/assets/ronin-${variacion}-${cuadro}.png`);
    }
    this.load.once('complete', () => this.entrarAtacante(atacante, variacion));
    this.load.start();
  }

  entrarAtacante(atacante, variacion) {
    const clave = (cuadro) => `atacante_${variacion}_${cuadro}`;
    for (const [nombre, cuadros] of [['walk', ['walk-0', 'walk-1', 'walk-2', 'walk-3']], ['chop', ['chop-0', 'chop-1', 'chop-2', 'chop-3']]]) {
      const animacion = `atacante_${variacion}_${nombre}`;
      if (!this.anims.exists(animacion)) {
        this.anims.create({
          key: animacion,
          frames: cuadros.map((c) => ({ key: clave(c) })),
          frameRate: nombre === 'walk' ? 8 : 6,
          repeat: -1,
        });
      }
    }

    this.atacanteSprite = this.add.sprite(-150, this.sueloRonin, clave('idle-0'));
    this.atacanteSprite.setOrigin(0.5, 1);
    this.atacanteSprite.setScale(this.escalaRonin);
    this.atacanteSprite.setDepth(11);
    this.atacanteSprite.play(`atacante_${variacion}_walk`);
    this.variacionAtacante = variacion;

    // Las tropas del atacante entran en columna detrás de él.
    this.tropasAtacante = [];
    const tiposAtacante = atacante.bando === 'luz' ? ['samurai', 'arquero'] : ['oni', 'kitsune'];
    let puesto = 0;
    for (const tipo of tiposAtacante) {
      const cantidad = Math.min(4, atacante.tropas?.[tipo] || 0);
      for (let i = 0; i < cantidad && puesto < 6; i += 1) {
        const sprite = this.add.sprite(-260 - puesto * 60, this.suelo - 4 + (puesto % 2) * 8, `tropa_${tipo}_0`);
        sprite.setOrigin(0.5, 1);
        sprite.setScale(this.escalaTropa);
        sprite.setDepth(10);
        this.cargarYAnimarTropa(sprite, tipo);
        this.tropasAtacante.push(sprite);
        this.tweens.add({ targets: sprite, x: 700 - puesto * 60, duration: 1800 + puesto * 120, ease: 'Linear', onComplete: () => sprite.active && sprite.anims.stop() });
        puesto += 1;
      }
    }

    // Las tropas del defensor se forman delante de su rōnin.
    this.tropasSprites.forEach((sprite, i) => {
      this.tweens.killTweensOf(sprite);
      sprite.setFlipX(true);
      this.tweens.add({ targets: sprite, x: 1120 + i * 48, y: this.suelo - 4 + (i % 2) * 8, duration: 900, onComplete: () => sprite.active && sprite.anims.stop() });
    });

    const cartel = this.add.text(960, 120, `${atacante.nombre} attacks the sanctuary!`, {
      fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
      fontSize: '40px',
      color: '#fdfaf2',
      stroke: '#6f1a18',
      strokeThickness: 6,
    });
    cartel.setOrigin(0.5, 0.5);
    cartel.setDepth(25);
    this.cartelAtaque = cartel;

    // El defensor sale a recibirlo.
    this.tweens.killTweensOf(this.roninSprite);
    this.tweens.killTweensOf(this.sombraSprite);
    this.roninSprite.setFlipX(true);
    this.roninSprite.play(`${this.prefijo}walk`);
    this.tweens.add({ targets: [this.roninSprite], x: 1010, duration: 900 });
    this.tweens.add({ targets: [this.sombraSprite], x: 1010, duration: 900 });

    this.tweens.add({
      targets: this.atacanteSprite,
      x: 880,
      duration: 1800,
      ease: 'Linear',
      onComplete: () => {
        if (!this.atacanteSprite) return;
        // En guardia: los golpes se ven uno por uno, no como un trabajo.
        this.atacanteSprite.anims.stop();
        this.atacanteSprite.setTexture(clave('idle-0'));
        this.roninSprite.play(`${this.prefijo}idle`);
        this.cameras.main.shake(400, 0.004);
      },
    });
  }

  // Un sprite de tropa de otro bando puede no tener sus cuadros cargados todavía.
  cargarYAnimarTropa(sprite, tipo) {
    const animacion = `tropa_${tipo}`;
    const listo = () => {
      if (!sprite.active) return;
      if (!this.anims.exists(animacion)) {
        this.anims.create({ key: animacion, frames: [0, 1, 2, 3].map((i) => ({ key: `tropa_${tipo}_${i}` })), frameRate: 6, repeat: -1 });
      }
      sprite.play(animacion);
    };
    if (this.textures.exists(`tropa_${tipo}_0`)) {
      listo();
      return;
    }
    for (let i = 0; i < 4; i += 1) this.load.image(`tropa_${tipo}_${i}`, `/assets/tropa-${tipo}-caminar-${i}.png`);
    this.load.once('complete', listo);
    this.load.start();
  }

  // El combate golpe a golpe que decidió el servidor: barras de vida sobre los
  // dos y un golpe animado en cada tiempo.
  mostrarCombate(datos) {
    if (!this.roninSprite || !datos?.golpes) return;
    this.golpesPendientes = datos.golpes;
    this.vidaMax = datos.vida || 100;
    this.combateInicio = Date.now();
    this.mostrarAtaque(datos.atacante);
    this.crearBarras();
    for (const golpe of datos.golpes) {
      this.time.delayedCall(golpe.t, () => this.aplicarGolpe(golpe));
    }
  }

  crearBarras() {
    this.quitarBarras();
    this.barras = this.add.graphics();
    this.barras.setDepth(21);
    this.vidaA = this.vidaMax;
    this.vidaD = this.vidaMax;
    this.dibujarBarras();
  }

  dibujarBarras() {
    if (!this.barras) return;
    this.barras.clear();
    const pintar = (sprite, vida, alto) => {
      if (!sprite) return;
      const ancho = 170;
      const x = sprite.x - ancho / 2;
      const y = sprite.y - sprite.displayHeight - alto;
      const fraccion = Math.max(0, vida / this.vidaMax);
      this.barras.fillStyle(0x1d1c1a, 0.75);
      this.barras.fillRoundedRect(x - 3, y - 3, ancho + 6, 20, 5);
      this.barras.fillStyle(fraccion > 0.5 ? 0x2a8a48 : fraccion > 0.25 ? 0xc86820 : 0x9e2b25, 1);
      this.barras.fillRoundedRect(x, y, Math.max(4, ancho * fraccion), 14, 4);
    };
    // Una barra más arriba que la otra, porque pelean pegados.
    pintar(this.atacanteSprite, this.vidaA, 64);
    pintar(this.roninSprite, this.vidaD, 36);
  }

  aplicarGolpe(golpe) {
    if (!this.roninSprite) return;
    this.vidaA = golpe.vidaA;
    this.vidaD = golpe.vidaD;
    const pegaAtacante = golpe.quien === 'atacante';
    const golpeadores = pegaAtacante
      ? [this.atacanteSprite, ...(this.tropasAtacante || [])]
      : [this.roninSprite, ...this.tropasSprites];
    const golpeados = pegaAtacante
      ? [this.roninSprite, ...this.tropasSprites]
      : [this.atacanteSprite, ...(this.tropasAtacante || [])];
    const sentido = pegaAtacante ? 1 : -1;

    for (const sprite of golpeadores) {
      if (!sprite?.active) continue;
      // Embestida corta hacia el enemigo y vuelta.
      this.tweens.add({ targets: sprite, x: sprite.x + 34 * sentido, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
    for (const sprite of golpeados) {
      if (!sprite?.active) continue;
      sprite.setTint(0xffffff);
      if (sprite.setTintMode && Phaser.TintModes) sprite.setTintMode(Phaser.TintModes.FILL);
      this.tweens.add({ targets: sprite, x: sprite.x + 12 * sentido, duration: 80, yoyo: true, delay: 100 });
      this.time.delayedCall(190, () => {
        if (!sprite.active) return;
        sprite.clearTint();
        if (sprite.setTintMode && Phaser.TintModes) sprite.setTintMode(Phaser.TintModes.NORMAL);
      });
    }
    this.cameras.main.shake(120, 0.0025);
    this.dibujarBarras();
  }

  quitarBarras() {
    if (this.barras) {
      this.barras.destroy();
      this.barras = null;
    }
  }

  // Resultado: el perdedor cae y se desvanece; el ganador queda en pie.
  resolverAtaque(resultado) {
    if (!this.roninSprite) return;
    const ganaAtacante = resultado?.ganador === 'atacante';
    const perdedores = ganaAtacante
      ? [this.roninSprite, ...this.tropasSprites]
      : [this.atacanteSprite, ...(this.tropasAtacante || [])];
    const ganador = ganaAtacante ? this.atacanteSprite : this.roninSprite;

    this.cameras.main.flash(300, 255, 240, 220);
    if (ganador?.anims) ganador.play(ganador === this.roninSprite ? `${this.prefijo}idle` : `atacante_${this.variacionAtacante}_walk`);
    for (const perdedor of perdedores) {
      if (!perdedor?.active) continue;
      perdedor.setTint(0x663333);
      this.tweens.add({ targets: perdedor, alpha: 0.25, angle: ganaAtacante ? -80 : 80, duration: 700 });
    }
    if (this.cartelAtaque) {
      this.cartelAtaque.setText(ganaAtacante ? `${resultado.atacante?.nombre || 'The attacker'} breaks the gate` : 'The sanctuary holds!');
    }

    this.time.delayedCall(3500, () => {
      // Todo vuelve a su lugar: el daño real ya lo mandó el servidor.
      this.terminarAtaque();
      if (this.roninSprite) {
        this.roninSprite.clearTint();
        this.roninSprite.setAlpha(1);
        this.roninSprite.setAngle(0);
        this.aplicarEstado(this.ronin.estado, this.ronin.tarea);
      }
    });
  }

  terminarAtaque() {
    this.quitarBarras();
    for (const sprite of this.tropasAtacante || []) sprite.destroy();
    this.tropasAtacante = [];
    // Las tropas del defensor vuelven a su puesto, enteras.
    this.actualizarTropas(this.tropas);
    if (this.atacanteSprite) {
      this.atacanteSprite.destroy();
      this.atacanteSprite = null;
    }
    if (this.cartelAtaque) {
      this.cartelAtaque.destroy();
      this.cartelAtaque = null;
    }
  }

  // Globo de diálogo sobre el rōnin: lo que le dice a su maestro, para que
  // el público lo vea aunque el maestro mire el celular.
  mostrarGlobo(texto) {
    if (!this.roninSprite || !texto) return;
    this.ocultarGlobo();

    const anchoMax = 380;
    const etiqueta = this.add.text(0, 0, texto, {
      fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      fontSize: '26px',
      fontStyle: 'italic',
      color: '#241f18',
      align: 'center',
      wordWrap: { width: anchoMax - 40 },
    });
    etiqueta.setOrigin(0.5, 1);

    const ancho = etiqueta.width + 40;
    const alto = etiqueta.height + 28;
    const fondo = this.add.graphics();
    fondo.fillStyle(0xfdfaf2, 0.96);
    fondo.lineStyle(3, 0x5a4a2a, 0.9);
    fondo.fillRoundedRect(-ancho / 2, -alto - 14, ancho, alto, 10);
    fondo.strokeRoundedRect(-ancho / 2, -alto - 14, ancho, alto, 10);
    fondo.fillTriangle(-12, -14, 12, -14, 0, 0);
    etiqueta.setPosition(0, -28);

    this.globo = this.add.container(0, 0, [fondo, etiqueta]);
    this.globo.setDepth(20);
    this.globo.setAlpha(0);
    this.ubicarGlobo();
    this.tweens.add({ targets: this.globo, alpha: 1, duration: 250 });

    this.temporizadorGlobo = this.time.delayedCall(8000, () => this.ocultarGlobo());
  }

  ubicarGlobo() {
    if (!this.globo || !this.roninSprite) return;
    const alto = this.roninSprite.displayHeight;
    const x = Phaser.Math.Clamp(this.roninSprite.x, 220, 1700);
    this.globo.setPosition(x, this.roninSprite.y - alto - 10);
  }

  ocultarGlobo() {
    if (this.temporizadorGlobo) {
      this.temporizadorGlobo.remove(false);
      this.temporizadorGlobo = null;
    }
    if (this.globo) {
      this.globo.destroy();
      this.globo = null;
    }
  }

  update() {
    this.ubicarGlobo();
    if (this.barras) this.dibujarBarras();
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
    this.roninSprite.play(`${this.prefijo}walk`);

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
