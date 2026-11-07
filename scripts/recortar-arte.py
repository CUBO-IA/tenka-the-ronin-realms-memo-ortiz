#!/usr/bin/env python3
"""Recorta las piezas nuevas de arte/piezas y las deja listas para la web.

Uso:
    python3 scripts/recortar-arte.py

Lee siempre de arte/ y escribe en public/assets/. No modifica los originales.
Las piezas de interfaz salen del ui-kit con fondo transparente; los sprites
quedan normalizados y con una máscara (rojo = kimono, azul = hakama) para que
el celular pueda recolorearlos en vivo. La faja no se recolorea.

    python3 scripts/recortar-arte.py --solo-mascaras
    python3 scripts/recortar-arte.py --solo-edificios

rehace solo las máscaras a partir de los sprites ya normalizados de
public/assets/, para ajustar zonas sin volver a recortar todo.
"""

from __future__ import annotations

import sys

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ARTE = RAIZ / "arte" / "piezas"
# Las piezas sueltas entregadas a mano (por ejemplo el logo final) viven en arte/.
ARTE_SUELTO = RAIZ / "arte"
SALIDA = RAIZ / "public" / "assets"
SALIDA.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------


def abrir(ruta: Path) -> Image.Image:
    return Image.open(ruta).convert("RGB")


def _fondo_desde_bordes(
    rgb: np.ndarray,
    *,
    tolerancia: int,
    admite,
    devuelve: list[tuple[int, int]],
) -> np.ndarray:
    """Rellena el fondo conectado a los bordes con un criterio adaptativo."""
    alto, ancho, _ = rgb.shape
    fondo = np.zeros((alto, ancho), dtype=bool)
    cola: deque[tuple[int, int]] = deque()

    for x, y in devuelve:
        if not fondo[y, x]:
            fondo[y, x] = True
            cola.append((y, x))

    while cola:
        y, x = cola.popleft()
        actual = rgb[y, x].astype(np.int16)

        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < alto and 0 <= nx < ancho) or fondo[ny, nx]:
                continue

            color = rgb[ny, nx].astype(np.int16)
            if np.abs(color - actual).sum() <= tolerancia and admite(color):
                fondo[ny, nx] = True
                cola.append((ny, nx))

    return fondo


def _bordes(ancho: int, alto: int) -> list[tuple[int, int]]:
    puntos: list[tuple[int, int]] = []
    puntos.extend((x, 0) for x in range(ancho))
    puntos.extend((x, alto - 1) for x in range(ancho))
    puntos.extend((0, y) for y in range(alto))
    puntos.extend((ancho - 1, y) for y in range(alto))
    return puntos


def _fondo_por_color(
    rgb: np.ndarray,
    *,
    tolerancia: int,
    incluir_sombra: bool = False,
) -> np.ndarray:
    """Rellena el fondo comparando con el color de los bordes.

    El papel y el gris del ui-kit son demasiado parecidos para comparar solo
    con el vecino: un cambio suave de textura deja que el relleno entre en la
    pieza. Comparar contra el color de la esquina evita esa fuga. Con
    ``incluir_sombra`` también se come la sombra neutra que queda debajo.
    """
    alto, ancho, _ = rgb.shape
    borde = np.concatenate(
        [
            rgb[0:6, :, :].reshape(-1, 3),
            rgb[-6:, :, :].reshape(-1, 3),
            rgb[:, 0:6, :].reshape(-1, 3),
            rgb[:, -6:, :].reshape(-1, 3),
        ]
    )
    semilla = np.median(borde, axis=0)
    distancia = np.sqrt(((rgb - semilla) ** 2).sum(2))
    saturacion = rgb.max(2) - rgb.min(2)
    brillo = rgb.mean(2)

    def admite(y: int, x: int) -> bool:
        if distancia[y, x] <= tolerancia:
            return True
        return incluir_sombra and saturacion[y, x] <= 22 and 80 < brillo[y, x] < 240

    fondo = np.zeros((alto, ancho), dtype=bool)
    cola: deque[tuple[int, int]] = deque()

    for x, y in _bordes(ancho, alto):
        if not fondo[y, x] and admite(y, x):
            fondo[y, x] = True
            cola.append((y, x))

    while cola:
        y, x = cola.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < alto and 0 <= nx < ancho) or fondo[ny, nx]:
                continue
            if admite(ny, nx):
                fondo[ny, nx] = True
                cola.append((ny, nx))

    return fondo


def _limpiar_halo(
    rgb: np.ndarray,
    fondo: np.ndarray,
    *,
    pasadas: int = 4,
    saturacion_max: int = 26,
    brillo_min: int = 135,
    brillo_max: int = 240,
) -> np.ndarray:
    """Come el halo de fondo que queda pegado al contorno del sprite."""
    for _ in range(pasadas):
        vecino = fondo.copy()
        vecino[1:, :] |= fondo[:-1, :]
        vecino[:-1, :] |= fondo[1:, :]
        vecino[:, 1:] |= fondo[:, :-1]
        vecino[:, :-1] |= fondo[:, 1:]

        saturacion = rgb.max(2) - rgb.min(2)
        brillo = rgb.mean(2)
        quitar = (
            (~fondo)
            & vecino
            & (saturacion < saturacion_max)
            & (brillo > brillo_min)
            & (brillo < brillo_max)
        )
        fondo |= quitar

    return fondo


def _rgba(imagen: Image.Image, fondo: np.ndarray) -> Image.Image:
    rgb = np.asarray(imagen)
    alfa = np.where(fondo, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, alfa]), "RGBA")


def _recortar_contenido(imagen: Image.Image, margen: int = 0) -> Image.Image:
    caja = imagen.getbbox()
    if not caja:
        return imagen
    x0, y0, x1, y1 = caja
    return imagen.crop(
        (
            max(0, x0 - margen),
            max(0, y0 - margen),
            min(imagen.width, x1 + margen),
            min(imagen.height, y1 + margen),
        )
    )


def _guardar(imagen: Image.Image, nombre: str, *, escala: float | None = None) -> None:
    if escala is not None:
        ancho = max(1, round(imagen.width * escala))
        alto = max(1, round(imagen.height * escala))
        imagen = imagen.resize((ancho, alto), Image.Resampling.LANCZOS)
    destino = SALIDA / nombre
    if imagen.mode == "RGBA":
        imagen.save(destino, optimize=True)
    else:
        imagen.save(destino, quality=86, optimize=True, progressive=True)
    print(f"  {nombre:38} {imagen.width:4d} x {imagen.height:<4d} {imagen.mode}")


# --------------------------------------------------------------------------
# Fondos y tarjetas
# --------------------------------------------------------------------------


def extraer_fondos() -> None:
    print("Fondos y tarjetas")

    fondo = abrir(ARTE / "interfaz" / "fondo-inicio.png")
    _guardar(fondo.resize((1920, 1072), Image.Resampling.LANCZOS), "fondo-inicio.jpg")

    for bando in ("luz", "sombra"):
        movil = abrir(ARTE / "interfaz" / f"fondo-movil-{bando}.png")
        _guardar(movil.resize((1080, 1935), Image.Resampling.LANCZOS), f"fondo-movil-{bando}.jpg")

        tarjeta = abrir(ARTE / "interfaz" / f"tarjeta-{bando}.png")
        _guardar(tarjeta.resize((1000, 558), Image.Resampling.LANCZOS), f"tarjeta-{bando}.jpg")

        # Fondos limpios del santuario para la computadora
        santuario = abrir(ARTE / f"fondo-{bando}.png")
        _guardar(santuario.resize((1920, 1072), Image.Resampling.LANCZOS), f"fondo-{bando}.jpg")

    # La isla vista desde arriba, para el mapa vivo
    mapa = abrir(ARTE / "fondo-mapa.png")
    _guardar(mapa.resize((1920, 1072), Image.Resampling.LANCZOS), "fondo-mapa.jpg")

    print()


# --------------------------------------------------------------------------
# Logo
# --------------------------------------------------------------------------


def extraer_logo() -> None:
    print("Logo")

    # El logo final viene limpio y con transparencia desde Illustrator.
    original = Image.open(ARTE_SUELTO / "Logo_Tenka_FINAL.png").convert("RGBA")
    logo = _recortar_contenido(original, margen=2)

    # El logo completo para la computadora.
    _guardar(logo, "logo.png")

    # El bloque de kanjis para la cabecera del celular.
    filas = np.asarray(logo)[:, :, 3].max(1) > 0
    grupos: list[tuple[int, int]] = []
    inicio = None
    for y, hay in enumerate(filas):
        if hay and inicio is None:
            inicio = y
        elif not hay and inicio is not None:
            grupos.append((inicio, y))
            inicio = None
    if inicio is not None:
        grupos.append((inicio, len(filas)))

    # El primer grupo es el bloque de kanjis y el sello.
    if grupos:
        y0, y1 = grupos[0]
        margen = round((y1 - y0) * 0.04)
        kanji = logo.crop((0, max(0, y0 - margen), logo.width, min(logo.height, y1 + margen)))
        _guardar(kanji, "logo-kanji.png")

        # Versión clara para el bando Sombra.
        claro = np.asarray(kanji).copy()
        pixeles = claro.reshape(-1, 4)
        r, g, b = pixeles[:, 0], pixeles[:, 1], pixeles[:, 2]
        es_rojo = (r > g + 35) & (r > b + 35)
        pixeles[~es_rojo, 0] = 244
        pixeles[~es_rojo, 1] = 236
        pixeles[~es_rojo, 2] = 216
        _guardar(Image.fromarray(claro, "RGBA"), "logo-kanji-claro.png")

    print()


# --------------------------------------------------------------------------
# Piezas del ui-kit
# --------------------------------------------------------------------------


def extraer_ui_kit() -> None:
    print("Interfaz (ui-kit)")

    original = abrir(ARTE / "interfaz" / "ui-kit.png")

    piezas = [
        # nombre, caja recortada, ancho final, quitar sombra
        ("pergamino.png", (300, 10, 2440, 585), 1400, False),
        ("tira-papel.png", (1000, 590, 2440, 880), 1200, True),
        ("panel-madera.png", (240, 630, 940, 1460), 800, False),
        ("boton-laca.png", (990, 920, 1660, 1200), 640, False),
        ("sello.png", (1700, 910, 2040, 1215), 400, False),
        ("boton-redondo.png", (2100, 915, 2440, 1210), 400, False),
        ("pincelada.png", (990, 1330, 2420, 1400), 1200, False),
    ]

    for nombre, caja, ancho_final, quitar_sombra in piezas:
        recorte = original.crop(caja)
        rgb = np.asarray(recorte).astype(np.int16)

        if quitar_sombra:
            fondo = _fondo_por_color(rgb, tolerancia=26, incluir_sombra=True)
            fondo = _limpiar_halo(
                rgb,
                fondo,
                pasadas=3,
                saturacion_max=22,
                brillo_min=80,
                brillo_max=240,
            )
        else:
            def admite(c: np.ndarray) -> bool:
                saturacion = int(c.max() - c.min())
                brillo = float(c.mean())
                return saturacion <= 34 and 90 <= brillo <= 246 and (c[0] - c[2]) <= 32

            fondo = _fondo_desde_bordes(
                rgb,
                tolerancia=11,
                admite=admite,
                devuelve=_bordes(recorte.width, recorte.height),
            )
            fondo = _limpiar_halo(
                rgb,
                fondo,
                pasadas=3,
                saturacion_max=34,
                brillo_min=120,
                brillo_max=246,
            )

        pieza = _recortar_contenido(_rgba(recorte, fondo), margen=1)

        escala = ancho_final / pieza.width if pieza.width > ancho_final else 1
        _guardar(pieza, nombre, escala=escala)

    print()


# --------------------------------------------------------------------------
# Kamon
# --------------------------------------------------------------------------


KAMON = [
    "grulla",
    "glicina",
    "mariposa",
    "abanico",
    "sakura",
    "tomoe",
    "libelula",
    "ola",
    "arce",
    "luna",
    "bambu",
    "koi",
]


def extraer_kamon() -> None:
    print("Kamon")

    original = abrir(ARTE / "interfaz" / "kamon.png")
    ancho, alto = original.size

    # La cuadrícula es de 4 columnas por 3 filas. Se asigna cada dibujo a la
    # opción del catálogo que mejor le corresponde.
    orden = [0, 3, 7, 8, 4, 10, 6, 5, 9, 2, 11, 1]

    for indice, id_kamon in enumerate(KAMON):
        celda = orden[indice]
        columna = celda % 4
        fila = celda // 4
        caja = (
            round(columna * ancho / 4),
            round(fila * alto / 3),
            round((columna + 1) * ancho / 4),
            round((fila + 1) * alto / 3),
        )
        recorte = original.crop(caja).convert("RGBA")
        datos = np.asarray(recorte).astype(np.int16)
        brillo = datos[:, :, :3].mean(2)

        # El dibujo es negro sobre blanco: el alfa sale de la oscuridad.
        alfa = np.clip(255 - brillo * 1.15, 0, 255).astype(np.uint8)
        alfa[alfa < 18] = 0
        limpio = np.zeros_like(datos[:, :, :3], dtype=np.uint8)
        limpio[:, :, :3] = 24
        salida = Image.fromarray(np.dstack([limpio, alfa]), "RGBA")
        salida = salida.crop(salida.getbbox())
        salida = salida.resize((320, 320), Image.Resampling.LANCZOS)

        _guardar(salida, f"kamon-{id_kamon}.png")

    print()


# --------------------------------------------------------------------------
# Iconos de recursos
# --------------------------------------------------------------------------


ICONOS = [
    "madera",
    "piedra",
    "arena-hierro",
    "arroz",
    "mon",
    "sauce",
    "lodo",
    "hongos",
]


def extraer_iconos() -> None:
    print("Iconos de recursos")

    original = abrir(ARTE / "interfaz" / "iconos-recursos.png")
    rgb = np.asarray(original).astype(np.int16)
    saturacion = rgb.max(2) - rgb.min(2)
    brillo = rgb.mean(2)
    contenido = (saturacion > 18) | (brillo < 135) | (brillo > 238)

    columnas = contenido.any(0)
    grupos: list[tuple[int, int]] = []
    inicio = None
    for x, hay in enumerate(columnas):
        if hay and inicio is None:
            inicio = x
        elif not hay and inicio is not None:
            if x - inicio > 20:
                grupos.append((inicio, x))
            inicio = None
    if inicio is not None:
        grupos.append((inicio, len(columnas)))

    if len(grupos) != len(ICONOS):
        raise RuntimeError(f"Se esperaban 8 iconos y se encontraron {len(grupos)}")

    for nombre, (x0, x1) in zip(ICONOS, grupos):
        filas = contenido[:, x0:x1].any(1)
        ys = np.where(filas)[0]
        y0, y1 = int(ys.min()), int(ys.max()) + 1

        recorte = original.crop((max(0, x0 - 8), max(0, y0 - 8), min(original.width, x1 + 8), min(original.height, y1 + 8)))
        rgb = np.asarray(recorte).astype(np.int16)

        def admite(c: np.ndarray) -> bool:
            saturacion = int(c.max() - c.min())
            brillo = float(c.mean())
            return saturacion < 20 and 150 <= brillo <= 225

        fondo = _fondo_desde_bordes(
            rgb,
            tolerancia=10,
            admite=admite,
            devuelve=_bordes(recorte.width, recorte.height),
        )
        fondo = _limpiar_halo(rgb, fondo, pasadas=3, saturacion_max=24, brillo_min=145, brillo_max=232)
        icono = _recortar_contenido(_rgba(recorte, fondo), margen=1)
        icono = icono.resize((160, 160), Image.Resampling.LANCZOS)
        _guardar(icono, f"icono-{nombre}.png")

    print()


# --------------------------------------------------------------------------
# Sprites del rōnin
# --------------------------------------------------------------------------


SPRITES = {
    "luz-sombrero": {
        "hoja": "sprites-ronin-luz.png",
        "caja": (400, 10, 575, 270),
        "sash": (45, 166, 200, 196),
        "head": (25, 0, 215, 92),
        "body": (25, 94, 215, 196),
        "hakama": (70, 194, 180, 291),
        # La vaina pasa por delante de la cadera: no es hakama.
        "excluir": [[(12, 208), (84, 193), (84, 213), (12, 228)]],
    },
    "sombra-sombrero": {
        "hoja": "sprites-ronin-sombra.png",
        "caja": (156, 27, 357, 305),
        "sash": (45, 160, 200, 194),
        "head": (20, 0, 215, 94),
        "body": (15, 96, 205, 194),
        "hakama": (66, 194, 178, 289),
        "excluir": [[(10, 213), (80, 198), (80, 221), (10, 240)], [(148, 150), (168, 150), (168, 218), (148, 218)]],
    },
    "luz-mono": {
        "hoja": "sprites-ronin-luz-mono.png",
        "caja": (246, 47, 458, 400),
        "sash": (45, 166, 200, 197),
        "head": (85, 0, 180, 95),
        "body": (25, 96, 215, 197),
        "hakama": (72, 196, 176, 289),
        "excluir": [[(20, 205), (84, 183), (84, 201), (20, 225)]],
    },
    "sombra-mono": {
        "hoja": "sprites-ronin-sombra-mono.png",
        "caja": (200, 50, 390, 445),
        "sash": (90, 146, 152, 166),
        "head": (80, 0, 180, 82),
        "body": (15, 82, 198, 166),
        "hakama": (62, 165, 172, 284),
        # Vaina a la izquierda y empuñadura sobre el brazo derecho.
        "excluir": [[(40, 195), (76, 183), (76, 201), (40, 214)], [(146, 150), (184, 122), (194, 132), (158, 168)]],
    },
}

ANCHO_SPRITE = 240
ALTO_SPRITE = 320
ALTO_CONTENIDO = 300



def _poligonos(poligonos: list, ancho: int, alto: int) -> np.ndarray:
    """Devuelve una matriz booleana con los polígonos pintados."""
    capa = Image.new("L", (ancho, alto), 0)
    dibujo = ImageDraw.Draw(capa)
    for puntos in poligonos:
        dibujo.polygon(puntos, fill=255)
    return np.asarray(capa) > 0


def mascara_de_sprite(lienzo: Image.Image, nombre: str, datos: dict) -> Image.Image:
    """Máscara del sprite: rojo = kimono, azul = hakama. El resto, negro.

    Se decide por color (tono y brillo) dentro de cajas por zona, y se
    excluyen piel, faja, cuello, sandalias y la vaina de la espada.
    """
    sprite = np.asarray(lienzo).astype(np.int16)
    alto, ancho, _ = sprite.shape
    alfa = sprite[:, :, 3]
    r, g, b = sprite[:, :, 0], sprite[:, :, 1], sprite[:, :, 2]
    brillo = (r + g + b) / 3
    saturacion = sprite[:, :, :3].max(2) - sprite[:, :, :3].min(2)
    luz = nombre.startswith("luz")

    yy, xx = np.mgrid[0:alto, 0:ancho]

    def caja(nombre_caja: str) -> np.ndarray:
        x0, y0, x1, y1 = datos[nombre_caja]
        return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)

    visible = alfa > 0
    piel = (r > b + 10) & (r > g + 5)            # piel, sandalias, rojo de la espada
    claro = brillo > 150                         # cuello, faja blanca, filo
    excluido = _poligonos(datos.get("excluir", []), ancho, alto)

    if luz:
        # Kimono índigo: azul con algo de saturación.
        kimono = (b > r + 12) & (b >= g) & (saturacion > 22) & (brillo > 40) & (brillo < 150)
        hakama = brillo < 90
    else:
        # Kimono gris pizarra, apenas violeta; hakama casi negro.
        # La faja y sus puntas son violeta saturado: fuera de las dos zonas.
        violeta = (b > r + 15) & (saturacion > 30)
        kimono = (b >= r) & (brillo > 34) & (brillo < 125) & (saturacion < 48)
        hakama = (brillo < 62) & ~violeta

    kimono &= visible & caja("body") & ~caja("sash") & ~caja("head") & ~piel & ~claro
    hakama &= visible & caja("hakama") & ~caja("sash") & ~piel & ~excluido

    mascara = np.zeros((alto, ancho, 3), dtype=np.uint8)
    mascara[kimono] = (255, 0, 0)
    mascara[hakama] = (0, 0, 255)
    return Image.fromarray(mascara, "RGB")


def solo_mascaras() -> None:
    print("Máscaras a partir de public/assets/")
    for nombre, datos in SPRITES.items():
        lienzo = Image.open(SALIDA / f"ronin-{nombre}.png").convert("RGBA")
        _guardar(mascara_de_sprite(lienzo, nombre, datos), f"ronin-{nombre}-mascara.png")
    print()


def extraer_sprites() -> None:
    print("Sprites del rōnin")

    for nombre, datos in SPRITES.items():
        hoja = abrir(ARTE / datos["hoja"])
        recorte = hoja.crop(datos["caja"])
        rgb = np.asarray(recorte).astype(np.int16)

        def admite(c: np.ndarray) -> bool:
            saturacion = int(c.max() - c.min())
            brillo = float(c.mean())
            return saturacion < 18 and 150 <= brillo <= 230

        fondo = _fondo_desde_bordes(
            rgb,
            tolerancia=12,
            admite=admite,
            devuelve=_bordes(recorte.width, recorte.height),
        )
        fondo = _limpiar_halo(rgb, fondo, pasadas=4, saturacion_max=24, brillo_min=140, brillo_max=238)
        sprite = _recortar_contenido(_rgba(recorte, fondo))

        escala = ALTO_CONTENIDO / sprite.height
        sprite = sprite.resize(
            (max(1, round(sprite.width * escala)), ALTO_CONTENIDO),
            Image.Resampling.NEAREST,
        )

        lienzo = Image.new("RGBA", (ANCHO_SPRITE, ALTO_SPRITE), (0, 0, 0, 0))
        lienzo.alpha_composite(sprite, ((ANCHO_SPRITE - sprite.width) // 2, ALTO_SPRITE - 10 - sprite.height))
        _guardar(lienzo, f"ronin-{nombre}.png")

        _guardar(mascara_de_sprite(lienzo, nombre, datos), f"ronin-{nombre}-mascara.png")

        # Cabeza suelta para los botones de tocado.
        hx0, hy0, hx1, hy1 = datos["head"]
        cabeza = lienzo.crop((hx0, hy0, hx1, hy1))
        cabeza = _recortar_contenido(cabeza)
        if cabeza.width:
            lado = max(cabeza.width, cabeza.height)
            cuadro = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
            cuadro.alpha_composite(cabeza, ((lado - cabeza.width) // 2, (lado - cabeza.height) // 2))
            nombre_tocado = "sombrero" if "sombrero" in nombre else "mono"
            bando = "luz" if nombre.startswith("luz") else "sombra"
            _guardar(
                cuadro.resize((192, 192), Image.Resampling.NEAREST),
                f"tocado-{nombre_tocado}-{bando}.png",
            )

    print()


# --------------------------------------------------------------------------
# Principal
# --------------------------------------------------------------------------


def ascii_art(im, w=50):
    im = im.convert('L')
    h = int(im.height * (w / im.width) * 0.45)
    im = im.resize((w, max(1, h)))
    arr = np.asarray(im, dtype=int)
    med = np.median(arr)
    out = []
    for row in arr:
        out.append(''.join('#' if abs(p - med) > 20 else ' ' for p in row))
    return '\n'.join(out)


# --------------------------------------------------------------------------
# Edificios Era 1
# --------------------------------------------------------------------------

EDIFICIOS_ERA1 = [
    # Luz
    ("edificio-luz-casa-cimientos.png", "edificios-luz-era1.png", (56, 117, 566, 848)),
    ("edificio-luz-casa-construccion.png", "edificios-luz-era1.png", (595, 117, 1335, 848)),
    ("edificio-luz-casa-terminado.png", "edificios-luz-era1-casa-terminada.png", (580, 183, 2214, 1233)),
    ("edificio-luz-granero-cimientos.png", "edificios-luz-era1.png", (1414, 931, 1792, 1447)),
    ("edificio-luz-granero-construccion.png", "edificios-luz-era1.png", (1841, 931, 2234, 1447)),
    ("edificio-luz-granero-terminado.png", "edificios-luz-era1.png", (2291, 931, 2679, 1447)),
    ("edificio-luz-torii-cimientos.png", "edificios-luz-era1.png", (92, 931, 454, 1447)),
    ("edificio-luz-torii-construccion.png", "edificios-luz-era1.png", (535, 931, 876, 1447)),
    ("edificio-luz-torii-terminado.png", "edificios-luz-era1.png", (940, 931, 1321, 1447)),
    ("edificio-luz-altar-cimientos.png", "edificios-luz-era1.png", (1387, 117, 1775, 848)),
    ("edificio-luz-altar-construccion.png", "edificios-luz-era1.png", (1807, 117, 2228, 848)),
    ("edificio-luz-altar-terminado.png", "edificios-luz-era1.png", (2246, 117, 2703, 848)),

    # Sombra
    ("edificio-sombra-choza-cimientos.png", "edificios-sombra-era1.png", (401, 13, 972, 415)),
    ("edificio-sombra-choza-construccion.png", "edificios-sombra-era1.png", (1139, 13, 1752, 415)),
    ("edificio-sombra-choza-terminado.png", "edificios-sombra-era1.png", (1927, 13, 2543, 415)),
    ("edificio-sombra-pozo-cimientos.png", "edificios-sombra-era1.png", (409, 417, 946, 772)),
    ("edificio-sombra-pozo-construccion.png", "edificios-sombra-era1.png", (1226, 417, 1680, 772)),
    ("edificio-sombra-pozo-terminado.png", "edificios-sombra-era1.png", (1986, 417, 2527, 772)),
    ("edificio-sombra-circulo-cimientos.png", "edificios-sombra-era1.png", (391, 779, 964, 1115)),
    ("edificio-sombra-circulo-construccion.png", "edificios-sombra-era1.png", (1140, 779, 1750, 1115)),
    ("edificio-sombra-circulo-terminado.png", "edificios-sombra-era1.png", (1932, 779, 2556, 1115)),
    ("edificio-sombra-altar-cimientos.png", "edificios-sombra-era1.png", (387, 1125, 993, 1492)),
    ("edificio-sombra-altar-construccion.png", "edificios-sombra-era1.png", (1164, 1125, 1758, 1492)),
    ("edificio-sombra-altar-terminado.png", "edificios-sombra-era1.png", (1910, 1125, 2577, 1492)),
]



def _quitar_rotulos(pieza: Image.Image, minimo: int = 500) -> Image.Image:
    """Borra los rótulos de la hoja ("Foundation", "ALTAR"…) que quedan
    pegados al recorte: son manchas chicas y sueltas, separadas del edificio.
    Se conservan solo las partes conectadas con al menos `minimo` píxeles."""
    datos = np.array(pieza.convert("RGBA"))
    visible = datos[:, :, 3] > 0
    alto, ancho = visible.shape
    etiquetas = np.zeros((alto, ancho), dtype=np.int32)
    tamanos: list[int] = [0]
    actual = 0
    for y0 in range(alto):
        for x0 in range(ancho):
            if not visible[y0, x0] or etiquetas[y0, x0]:
                continue
            actual += 1
            cola = deque([(y0, x0)])
            etiquetas[y0, x0] = actual
            cuenta = 0
            while cola:
                y, x = cola.popleft()
                cuenta += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < alto and 0 <= nx < ancho and visible[ny, nx] and not etiquetas[ny, nx]:
                        etiquetas[ny, nx] = actual
                        cola.append((ny, nx))
            tamanos.append(cuenta)
    # Umbral relativo: las letras grandes de los títulos también son chicas
    # comparadas con el edificio.
    umbral = max(minimo, int(max(tamanos) * 0.04))
    chicas = np.array([t < umbral for t in tamanos])
    datos[chicas[etiquetas] & visible] = (0, 0, 0, 0)
    return _recortar_contenido(Image.fromarray(datos, "RGBA"), margen=1)


def extraer_edificios() -> None:
    print("Edificios de la Era 1")
    hojas_abiertas: dict[str, Image.Image] = {}

    for nombre_archivo, nombre_hoja, caja in EDIFICIOS_ERA1:
        if nombre_hoja not in hojas_abiertas:
            hojas_abiertas[nombre_hoja] = abrir(ARTE / nombre_hoja)
        hoja = hojas_abiertas[nombre_hoja]
        recorte = hoja.crop(caja)
        rgb = np.asarray(recorte).astype(np.int16)

        def admite(c: np.ndarray) -> bool:
            saturacion = int(c.max() - c.min())
            brillo = float(c.mean())
            return saturacion < 26 and 130 <= brillo <= 244

        fondo = _fondo_desde_bordes(
            rgb,
            tolerancia=14,
            admite=admite,
            devuelve=_bordes(recorte.width, recorte.height),
        )
        fondo = _limpiar_halo(rgb, fondo, pasadas=3, saturacion_max=28, brillo_min=125, brillo_max=244)
        pieza = _recortar_contenido(_rgba(recorte, fondo), margen=1)
        pieza = _quitar_rotulos(pieza)

        # Ajuste de escala a tamaño óptimo en pantalla (máx 440px de ancho o 340px de alto)
        escala = min(1.0, 440 / max(1, pieza.width), 340 / max(1, pieza.height))
        _guardar(pieza, nombre_archivo, escala=escala)

    print()


# --------------------------------------------------------------------------
# Animaciones del rōnin (IDLE, WALK, CHOP)
# --------------------------------------------------------------------------

ANIMACIONES_RONIN = {
    "luz-sombrero": {
        "idle": [(434, 18, 551, 260), (671, 18, 786, 260), (902, 18, 1023, 260), (1144, 18, 1261, 260)],
        "walk": [(426, 274, 556, 520), (661, 274, 792, 520), (903, 274, 1037, 520), (1147, 274, 1280, 520), (1400, 274, 1528, 520), (1640, 274, 1768, 520)],
        "chop": [(394, 540, 535, 850), (665, 540, 824, 850), (985, 540, 1128, 850), (1679, 540, 1886, 850), (1920, 540, 2150, 850), (2178, 540, 2409, 850)],
    },
    "sombra-sombrero": {
        "idle": [(169, 25, 348, 315), (410, 25, 587, 315), (649, 25, 827, 315), (889, 25, 1066, 315)],
        "walk": [(194, 350, 345, 630), (422, 350, 573, 630), (664, 350, 803, 630), (884, 350, 1032, 630), (1117, 350, 1261, 630), (1342, 350, 1488, 630)],
        "chop": [(182, 680, 403, 940), (471, 680, 661, 940), (762, 680, 1009, 940), (1615, 680, 1807, 940), (1850, 680, 2080, 940), (2121, 680, 2353, 940)],
    },
    "luz-mono": {
        "idle": [(286, 40, 424, 410), (506, 40, 653, 410), (728, 40, 869, 410), (937, 40, 1076, 410)],
        "walk": [(1462, 40, 1641, 410), (1686, 40, 1866, 410), (1912, 40, 2094, 410), (2158, 40, 2320, 410), (2375, 40, 2554, 410)],
        "chop": [(283, 430, 454, 830), (526, 430, 697, 830), (774, 430, 982, 830), (1663, 430, 1892, 830), (1936, 430, 2167, 830), (2225, 430, 2385, 830)],
    },
    "sombra-mono": {
        "idle": [(207, 40, 364, 450), (427, 40, 587, 450), (643, 40, 805, 450), (866, 40, 1025, 450)],
        "walk": [(1340, 40, 1494, 450), (1554, 40, 1733, 450), (1779, 40, 1965, 450), (2004, 40, 2186, 450), (2231, 40, 2421, 450), (2471, 40, 2655, 450)],
        "chop": [(194, 480, 403, 880), (472, 480, 683, 880), (757, 480, 956, 880), (1512, 480, 1769, 880), (1863, 480, 2081, 880), (2135, 480, 2317, 880)],
    },
}


def extraer_animaciones() -> None:
    print("Cuadros de animación del rōnin (IDLE, WALK, CHOP)")

    for clave, anims in ANIMACIONES_RONIN.items():
        datos_sprite = SPRITES[clave]
        hoja = abrir(ARTE / datos_sprite["hoja"])

        for anim, cajas in anims.items():
            for idx, caja in enumerate(cajas):
                recorte = hoja.crop(caja)
                rgb = np.asarray(recorte).astype(np.int16)

                def admite(c: np.ndarray) -> bool:
                    saturacion = int(c.max() - c.min())
                    brillo = float(c.mean())
                    return saturacion < 20 and 140 <= brillo <= 236

                fondo = _fondo_desde_bordes(
                    rgb,
                    tolerancia=12,
                    admite=admite,
                    devuelve=_bordes(recorte.width, recorte.height),
                )
                fondo = _limpiar_halo(rgb, fondo, pasadas=3, saturacion_max=24, brillo_min=135, brillo_max=238)
                sprite = _recortar_contenido(_rgba(recorte, fondo))

                if sprite.height < 10 or sprite.width < 10:
                    continue

                escala = ALTO_CONTENIDO / sprite.height
                ancho_escalado = max(1, round(sprite.width * escala))
                sprite = sprite.resize(
                    (ancho_escalado, ALTO_CONTENIDO),
                    Image.Resampling.NEAREST,
                )

                lienzo = Image.new("RGBA", (ANCHO_SPRITE, ALTO_SPRITE), (0, 0, 0, 0))
                lienzo.alpha_composite(
                    sprite,
                    ((ANCHO_SPRITE - sprite.width) // 2, ALTO_SPRITE - 10 - sprite.height),
                )

                prefijo = f"ronin-{clave}-{anim}-{idx}"
                _guardar(lienzo, f"{prefijo}.png")
                _guardar(mascara_de_sprite(lienzo, clave, datos_sprite), f"{prefijo}-mascara.png")

    print()



# --------------------------------------------------------------------------
# Era 2: edificios y aldeanos, recortados por filas
# --------------------------------------------------------------------------

# Cada fila de la hoja trae varias piezas sobre el mismo fondo gris. Se
# separan por los huecos de columnas vacías, de izquierda a derecha.
def _piezas_de_fila(hoja: Image.Image, banda: tuple, hueco_min: int = 24, alto_min: float = 0.35) -> list:
    x0, y0, x1, y1 = banda
    recorte = hoja.crop((x0, y0, x1, y1))
    rgb = np.asarray(recorte).astype(np.int16)

    def admite(c: np.ndarray) -> bool:
        saturacion = int(c.max() - c.min())
        brillo = float(c.mean())
        return saturacion < 26 and 130 <= brillo <= 244

    fondo = _fondo_desde_bordes(rgb, tolerancia=14, admite=admite, devuelve=_bordes(recorte.width, recorte.height))
    fondo = _limpiar_halo(rgb, fondo, pasadas=3, saturacion_max=28, brillo_min=125, brillo_max=244)
    contenido = ~fondo
    columnas = contenido.any(axis=0)

    piezas = []
    inicio = None
    vacias = 0
    for x in range(recorte.width + 1):
        ocupada = x < recorte.width and bool(columnas[x])
        if ocupada:
            if inicio is None:
                inicio = x
            vacias = 0
        elif inicio is not None:
            vacias += 1
            if vacias >= hueco_min or x == recorte.width:
                fin = x - vacias + 1
                pieza = _rgba(recorte.crop((inicio, 0, fin, recorte.height)), fondo[:, inicio:fin])
                pieza = _quitar_rotulos(_recortar_contenido(pieza, margen=1))
                # Los títulos de la hoja son bajitos: fuera.
                if pieza.height >= recorte.height * alto_min:
                    piezas.append(pieza)
                inicio = None
                vacias = 0
    return piezas


EDIFICIOS_ERA2 = {
    # hoja, banda (x0, y0, x1, y1), nombres de las tres etapas en orden
    "luz": [
        ("edificios-luz-era2.png", (480, 30, 2752, 400), "terrazas"),
        ("edificios-luz-era2.png", (480, 400, 2752, 780), "forja"),
        ("edificios-luz-era2.png", (480, 780, 2752, 1060), "empalizada"),
        ("edificios-luz-era2.png", (480, 1060, 2752, 1510), "torre"),
    ],
    "sombra": [
        ("edificios-sombra-era2.png", (440, 130, 2752, 440), "huerto"),
        ("edificios-sombra-era2.png", (440, 440, 2752, 830), "caldero"),
        ("edificios-sombra-era2.png", (440, 830, 2752, 1150), "muro"),
        ("edificios-sombra-era2.png", (440, 1150, 2752, 1530), "farol"),
    ],
}

ALDEANOS = [
    # hoja, banda, [(nombre, cantidad de cuadros), ...] en el orden de la fila
    ("sprites-aldeanos-era2.png", (340, 90, 2752, 410), [("luz-granjero-caminar", 4), ("luz-granjero-sembrar", 2)]),
    ("sprites-aldeanos-era2.png", (340, 420, 1500, 790), [("luz-herrero", 4)]),
    ("sprites-aldeanos-era2.png", (340, 850, 2752, 1165), [("sombra-recolector", 4)]),
    ("sprites-aldeanos-era2.png", (340, 1170, 2752, 1530), [("sombra-alquimista", 4), ("sombra-espectro", 4)]),
]

# Los guardias llevan lanza y se tocan entre sí: van con cajas fijas.
ALDEANOS_FIJOS = [
    ("sprites-aldeanos-era2.png", "luz-guardia-0", (1640, 420, 1895, 790)),
    ("sprites-aldeanos-era2.png", "luz-guardia-1", (1900, 420, 2150, 790)),
    ("sprites-aldeanos-era2.png", "luz-guardia-2", (2160, 420, 2420, 790)),
    ("sprites-aldeanos-era2.png", "luz-guardia-3", (2425, 420, 2700, 790)),
]

# Tropas de la era 3 (en la demo se entrenan desde la era 2): 4 cuadros de
# marcha y 3 de ataque por tipo, en filas de la hoja.
TROPAS = [
    ("sprites-tropas-era3.png", (300, 85, 2752, 410), "samurai"),
    ("sprites-tropas-era3.png", (300, 420, 2752, 770), "arquero"),
    ("sprites-tropas-era3.png", (300, 820, 2752, 1190), "oni"),
    ("sprites-tropas-era3.png", (300, 1195, 2752, 1530), "kitsune"),
]
ALTO_TROPA = 200

ALTO_ALDEANO = 220
LIENZO_ALDEANO = (200, 240)


def extraer_era2() -> None:
    print("Edificios de la Era 2")
    hojas: dict[str, Image.Image] = {}

    def hoja(nombre):
        if nombre not in hojas:
            hojas[nombre] = abrir(ARTE / nombre)
        return hojas[nombre]

    for bando, filas in EDIFICIOS_ERA2.items():
        for nombre_hoja, banda, tipo in filas:
            piezas = _piezas_de_fila(hoja(nombre_hoja), banda)
            if len(piezas) != 3:
                print(f"  ⚠ {bando}/{tipo}: esperaba 3 piezas y hay {len(piezas)}")
            for etapa, pieza in zip(("cimientos", "construccion", "terminado"), piezas):
                escala = min(1.0, 440 / max(1, pieza.width), 340 / max(1, pieza.height))
                _guardar(pieza, f"edificio-{bando}-{tipo}-{etapa}.png", escala=escala)

    # El muro de espinas terminado tiene su propia hoja corregida.
    muro = _piezas_de_fila(hoja("edificios-sombra-era2-muro-terminado.png"), (0, 100, 2752, 1250))
    if muro:
        pieza = max(muro, key=lambda im: im.width * im.height)
        escala = min(1.0, 440 / max(1, pieza.width), 340 / max(1, pieza.height))
        _guardar(pieza, "edificio-sombra-muro-terminado.png", escala=escala)

    print("Tropas")
    for nombre_hoja, banda, tipo in TROPAS:
        piezas = _piezas_de_fila(hoja(nombre_hoja), banda, hueco_min=20)
        if len(piezas) < 7:
            print(f"  ⚠ {tipo}: esperaba al menos 7 cuadros y hay {len(piezas)}")
        nombres = [f"caminar-{i}" for i in range(4)] + [f"atacar-{i}" for i in range(3)]
        for nombre, pieza in zip(nombres, piezas):
            escala = ALTO_TROPA / pieza.height
            pieza = pieza.resize((max(1, round(pieza.width * escala)), ALTO_TROPA), Image.Resampling.NEAREST)
            lienzo = Image.new("RGBA", LIENZO_ALDEANO, (0, 0, 0, 0))
            lienzo.alpha_composite(pieza, ((LIENZO_ALDEANO[0] - pieza.width) // 2, LIENZO_ALDEANO[1] - 10 - pieza.height))
            _guardar(lienzo, f"tropa-{tipo}-{nombre}.png")

    print("Aldeanos de la Era 2")
    for nombre_hoja, nombre, caja in ALDEANOS_FIJOS:
        piezas = _piezas_de_fila(hoja(nombre_hoja), caja, hueco_min=200)
        if not piezas:
            print(f"  ⚠ {nombre}: no se encontró el cuadro")
            continue
        pieza = max(piezas, key=lambda im: im.width * im.height)
        escala = ALTO_ALDEANO / pieza.height
        pieza = pieza.resize((max(1, round(pieza.width * escala)), ALTO_ALDEANO), Image.Resampling.NEAREST)
        lienzo = Image.new("RGBA", LIENZO_ALDEANO, (0, 0, 0, 0))
        lienzo.alpha_composite(pieza, ((LIENZO_ALDEANO[0] - pieza.width) // 2, LIENZO_ALDEANO[1] - 10 - pieza.height))
        _guardar(lienzo, f"aldeano-{nombre}.png")

    for nombre_hoja, banda, grupos in ALDEANOS:
        piezas = _piezas_de_fila(hoja(nombre_hoja), banda, hueco_min=16)
        esperadas = sum(n for _, n in grupos)
        if len(piezas) != esperadas:
            print(f"  ⚠ fila {banda}: esperaba {esperadas} cuadros y hay {len(piezas)}")
        indice = 0
        for nombre, cantidad in grupos:
            for i in range(cantidad):
                if indice >= len(piezas):
                    break
                pieza = piezas[indice]
                indice += 1
                escala = ALTO_ALDEANO / pieza.height
                pieza = pieza.resize((max(1, round(pieza.width * escala)), ALTO_ALDEANO), Image.Resampling.NEAREST)
                lienzo = Image.new("RGBA", LIENZO_ALDEANO, (0, 0, 0, 0))
                lienzo.alpha_composite(pieza, ((LIENZO_ALDEANO[0] - pieza.width) // 2, LIENZO_ALDEANO[1] - 10 - pieza.height))
                _guardar(lienzo, f"aldeano-{nombre}-{i}.png")
    print()


def main() -> None:
    if "--solo-mascaras" in sys.argv:
        solo_mascaras()
        return
    if "--solo-edificios" in sys.argv:
        extraer_edificios()
        return
    if "--solo-fondos" in sys.argv:
        extraer_fondos()
        return
    if "--solo-era2" in sys.argv:
        extraer_era2()
        return

    print(f"Origen: {ARTE}")
    print(f"Destino: {SALIDA}\n")

    extraer_fondos()
    extraer_logo()
    extraer_ui_kit()
    extraer_kamon()
    extraer_iconos()
    extraer_sprites()
    extraer_edificios()
    extraer_era2()
    extraer_animaciones()

    print("Listo. Revisá public/assets/ antes de cambiar el CSS.")


if __name__ == "__main__":
    main()
