// La isla vista desde arriba: cada territorio con el estandarte de su clan y
// su santuario según lo construido. Los de la era 1 van bajo niebla, salvo el
// propio. Clic en un territorio para visitarlo.

const COLOR_BANDO = { luz: 0x2b3a67, sombra: 0x5b3d7a };
const EDIFICIOS = {
  luz: ['casa', 'granero', 'torii', 'altar'],
  sombra: ['choza', 'pozo', 'circulo', 'altar'],
};
const ETAPAS = ['cimientos', 'construccion', 'terminado'];

export class EscenaMapa extends Phaser.Scene {
  constructor() {
    super({ key: 'Mapa' });
  }

  init(datos) {
    this.mundo = datos.mundo || { territorios: [], ronin: [] };
    this.propioId = datos.propioId || null;
    this.alSeleccionar = datos.alSeleccionar || null;
    this.marcadores = new Map();
  }

  preload() {
    this.load.image('fondo_mapa', '/assets/fondo-mapa.jpg');
    for (const bando of ['luz', 'sombra']) {
      for (const tipo of EDIFICIOS[bando]) {
        for (const etapa of ETAPAS) {
          this.load.image(`edificio_${bando}_${tipo}_${etapa}`, `/assets/edificio-${bando}-${tipo}-${etapa}.png`);
        }
      }
    }
    for (const ronin of this.mundo.ronin) {
      this.load.image(`kamon_${ronin.kamon}`, `/assets/kamon-${ronin.kamon}.png`);
    }
  }

  create() {
    const fondo = this.add.image(960, 540, 'fondo_mapa');
    fondo.setDisplaySize(1920, 1080);

    // Niebla suave: textura redonda dibujada en código.
    if (!this.textures.exists('niebla_mapa')) {
      const lienzo = document.createElement('canvas');
      lienzo.width = 256;
      lienzo.height = 160;
      const ctx = lienzo.getContext('2d');
      const grad = ctx.createRadialGradient(128, 80, 10, 128, 80, 120);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 160);
      this.textures.addCanvas('niebla_mapa', lienzo);
    }

    this.capaTerritorios = this.add.container(0, 0);
    this.dibujarMercado();
    this.dibujarTodo();
  }

  dibujarMercado() {
    const mercado = this.mundo.mercado;
    if (!mercado) return;
    const etiqueta = this.add.text(mercado.x, mercado.y + 60, mercado.nombre, {
      fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
      fontSize: '22px',
      color: '#241f18',
      backgroundColor: 'rgba(253, 250, 242, 0.85)',
      padding: { x: 10, y: 4 },
    });
    etiqueta.setOrigin(0.5, 0);
    etiqueta.setDepth(3);
  }

  dibujarTodo() {
    this.capaTerritorios.removeAll(true);
    this.marcadores.clear();
    for (const territorio of this.mundo.territorios) {
      const ronin = this.mundo.ronin.find((r) => r.territorio === territorio.id);
      this.dibujarTerritorio(territorio, ronin || null);
    }
  }

  edificioPrincipal(ronin) {
    // El edificio más avanzado: el que mejor cuenta cuánto ha construido.
    let mejor = null;
    for (const e of ronin.edificios || []) {
      const nivel = ETAPAS.indexOf(e.etapa);
      if (!mejor || nivel > mejor.nivel) mejor = { ...e, nivel };
    }
    return mejor;
  }

  dibujarTerritorio(territorio, ronin) {
    const grupo = this.add.container(territorio.x, territorio.y);
    this.capaTerritorios.add(grupo);

    if (!ronin) {
      // Tierra libre: un marcador discreto.
      const libre = this.add.circle(0, 0, 14, 0xfdfaf2, 0.55);
      libre.setStrokeStyle(2, 0x5a4a2a, 0.6);
      grupo.add(libre);
      return;
    }

    const esPropio = ronin.id === this.propioId;
    const color = COLOR_BANDO[ronin.bando] || 0x2b3a67;

    // Santuario: el edificio principal, chico, sobre el territorio.
    const principal = this.edificioPrincipal(ronin);
    if (principal) {
      const clave = `edificio_${ronin.bando}_${principal.tipo}_${principal.etapa}`;
      if (this.textures.exists(clave)) {
        const edificio = this.add.image(0, 20, clave);
        edificio.setOrigin(0.5, 1);
        edificio.setScale(0.32);
        grupo.add(edificio);
      }
    } else {
      const campamento = this.add.circle(0, 10, 18, color, 0.35);
      grupo.add(campamento);
    }

    // Estandarte del clan con su kamon.
    const asta = this.add.rectangle(70, -40, 4, 120, 0x3a2a18);
    const tela = this.add.rectangle(92, -72, 40, 60, color);
    tela.setStrokeStyle(2, 0xfdfaf2, 0.9);
    grupo.add([asta, tela]);
    const claveKamon = `kamon_${ronin.kamon}`;
    if (this.textures.exists(claveKamon)) {
      const kamon = this.add.image(92, -72, claveKamon);
      kamon.setDisplaySize(30, 30);
      kamon.setTint(0xfdfaf2);
      grupo.add(kamon);
    }

    // Nombre del rōnin y del territorio.
    const nombre = this.add.text(0, 42, `${ronin.nombre} · ${territorio.nombre}`, {
      fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
      fontSize: '20px',
      color: esPropio ? '#9e2b25' : '#241f18',
      backgroundColor: 'rgba(253, 250, 242, 0.88)',
      padding: { x: 8, y: 3 },
    });
    nombre.setOrigin(0.5, 0);
    grupo.add(nombre);

    // Era 1 bajo niebla, salvo el propio.
    if (ronin.era <= 1 && !esPropio) {
      const niebla = this.add.image(0, -10, 'niebla_mapa');
      niebla.setDisplaySize(300, 190);
      niebla.setAlpha(0.55);
      grupo.add(niebla);
    }

    if (esPropio) {
      const anillo = this.add.circle(0, 10, 92, 0x9e2b25, 0);
      anillo.setStrokeStyle(3, 0x9e2b25, 0.9);
      grupo.add(anillo);
    }

    // Zona de clic para visitar el santuario.
    const zona = this.add.zone(0, -10, 240, 200).setInteractive({ useHandCursor: true });
    zona.on('pointerover', () => grupo.setScale(1.04));
    zona.on('pointerout', () => grupo.setScale(1));
    zona.on('pointerdown', () => {
      if (this.alSeleccionar) this.alSeleccionar(ronin);
    });
    grupo.add(zona);

    this.marcadores.set(territorio.id, grupo);
  }

  // Un rōnin cambió (estado, edificios, era): se redibuja su territorio.
  actualizarRonin(resumen) {
    if (!resumen) return;
    const lista = this.mundo.ronin.filter((r) => r.id !== resumen.id);
    lista.push(resumen);
    this.mundo.ronin = lista;

    const claveKamon = `kamon_${resumen.kamon}`;
    if (!this.textures.exists(claveKamon)) {
      this.load.image(claveKamon, `/assets/kamon-${resumen.kamon}.png`);
      this.load.once('complete', () => this.dibujarTodo());
      this.load.start();
      return;
    }
    this.dibujarTodo();
  }

  actualizarMundo(mundo) {
    this.mundo = mundo;
    this.dibujarTodo();
  }
}
