#!/usr/bin/env python3
"""Recorta las piezas nuevas de arte/piezas y las deja listas para la web.

Uso:
    python3 scripts/recortar-arte.py

Lee siempre de arte/ y escribe en public/assets/. No modifica los originales.
Las piezas de interfaz salen del ui-kit con fondo transparente; los sprites
quedan normalizados y con una máscara (rojo = kimono, verde = faja) para que
el celular pueda recolorearlos en vivo.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ARTE = RAIZ / "arte" / "piezas"
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


# --------------------------------------------------------------------------
# Logo
# --------------------------------------------------------------------------


def extraer_logo() -> None:
    print("Logo")

    original = abrir(ARTE / "interfaz" / "logo.png")
    rgb = np.asarray(original).astype(np.int16)
    saturacion = rgb.max(2) - rgb.min(2)
    brillo = rgb.mean(2)

    # Cualquier cosa que no sea blanco puro es contenido.
    contenido = (brillo < 246) | (saturacion > 18)
    ys, xs = np.where(contenido)
    caja = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    recorte = original.crop(caja)

    rgb = np.asarray(recorte).astype(np.int16)
    fondo = _fondo_desde_bordes(
        rgb,
        tolerancia=10,
        admite=lambda c: c.mean() > 232 and (c.max() - c.min()) < 24,
        devuelve=_bordes(recorte.width, recorte.height),
    )
    fondo = _limpiar_halo(rgb, fondo, saturacion_max=22, brillo_min=190, brillo_max=255)
    logo = _recortar_contenido(_rgba(recorte, fondo), margen=2)

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

    # Solo la marca de kanjis, por si hace falta en otro lado.
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
    },
    "sombra-sombrero": {
        "hoja": "sprites-ronin-sombra.png",
        "caja": (156, 27, 357, 305),
        "sash": (45, 160, 200, 194),
        "head": (20, 0, 215, 94),
        "body": (15, 96, 205, 194),
    },
    "luz-mono": {
        "hoja": "sprites-ronin-luz-mono.png",
        "caja": (246, 47, 458, 400),
        "sash": (45, 166, 200, 197),
        "head": (85, 0, 180, 95),
        "body": (25, 96, 215, 197),
    },
    "sombra-mono": {
        "hoja": "sprites-ronin-sombra-mono.png",
        "caja": (200, 50, 390, 445),
        "sash": (45, 175, 198, 203),
        "head": (80, 0, 180, 98),
        "body": (15, 98, 198, 203),
    },
}

ANCHO_SPRITE = 240
ALTO_SPRITE = 320
ALTO_CONTENIDO = 300


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

        # Máscara: rojo = kimono, verde = faja. El resto, negro.
        datos_sprite = np.asarray(lienzo).astype(np.int16)
        alto, ancho, _ = datos_sprite.shape
        alfa = datos_sprite[:, :, 3]
        r, g, b = datos_sprite[:, :, 0], datos_sprite[:, :, 1], datos_sprite[:, :, 2]
        brillo = (r + g + b) / 3
        saturacion = datos_sprite.max(2) - datos_sprite.min(2)

        x0, y0, x1, y1 = datos["sash"]
        sy0, sy1 = y0, y1
        hx0, hy0, hx1, hy1 = datos["head"]
        bx0, by0, bx1, by1 = datos["body"]

        yy, xx = np.mgrid[0:alto, 0:ancho]
        piel = (r > b + 10) & (r > g + 5)
        collar = (brillo > 170) & (saturacion < 45) & (~piel)

        en_faja = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) & (alfa > 0)
        faja = en_faja & (~piel) & (brillo > 18)

        en_cabeza = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
        en_cuerpo = (xx >= bx0) & (xx < bx1) & (yy >= by0) & (yy < by1)
        kimono = en_cuerpo & (alfa > 0) & (~piel) & (~collar) & (~faja) & (~en_cabeza) & (brillo > 18)

        mascara = np.zeros((alto, ancho, 3), dtype=np.uint8)
        mascara[kimono] = (255, 0, 0)
        mascara[faja] = (0, 255, 0)
        _guardar(Image.fromarray(mascara, "RGB"), f"ronin-{nombre}-mascara.png")

        # Cabeza suelta para los botones de tocado.
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


def main() -> None:
    print(f"Origen: {ARTE}")
    print(f"Destino: {SALIDA}\n")

    extraer_fondos()
    extraer_logo()
    extraer_ui_kit()
    extraer_kamon()
    extraer_iconos()
    extraer_sprites()

    print("Listo. Revisá public/assets/ antes de cambiar el CSS.")


if __name__ == "__main__":
    main()
