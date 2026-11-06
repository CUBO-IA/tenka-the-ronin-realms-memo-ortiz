# Tenka: The Rōnin Realms — Documento de diseño

**Autor:** Memo Ortiz · CUBO_ai Hackathon: The Game Studio · 6 y 7 de noviembre de 2026
**Frase:** *Light or Shadow. Your rōnin builds while you sleep.*

Este documento define el juego. El arte está en `arte/`: las **maquetas** muestran cómo se ve cada pantalla y las **piezas** son lo que entra al juego.

**Costos, tiempos y ritmo del juego no se fijan en este documento.** Se definen jugando en tiempo real y se ajustan en un solo lugar del código (`server/reglas.js`).

---

## 1. Qué es Tenka

Un juego multijugador en tiempo real donde cada jugador tiene un **agente de IA**: su rōnin. El rōnin vive en una isla del Japón feudal, construye su santuario, comercia y negocia con los rōnin de otros jugadores, ataca o defiende. **El jugador no lo controla: le da órdenes como su maestro.**

- **En la computadora** se mira el mundo en tiempo real: tu santuario, tu rōnin trabajando y las civilizaciones de los demás. No se dan órdenes desde ahí.
- **En el celular** se dan las órdenes: el rōnin pregunta, el maestro responde con un toque o escribe una orden.
- **El rōnin vive en el servidor**, no en la computadora. Si cerrás la laptop, sigue trabajando.
- **No hay meta final.** Como Minecraft, cada uno construye su civilización. La tensión viene de los otros jugadores.

### La historia

Shinano, 1610. Una isla partida en dos por una cordillera. Del lado de la **luz**, nieve, cedros y disciplina. Del lado de la **sombra**, pantanos, niebla y magia. Cada jugador despierta a un rōnin sin señor, elige su camino y levanta su santuario desde cero. En el centro, sobre la frontera, el **Mercado del Cruce**: el único lugar donde los dos bandos se encuentran en paz.

---

## 2. Las pantallas

| Dónde | Pantalla | Maqueta |
|---|---|---|
| Computadora | Inicio: logo y acceso con nombre y PIN | `arte/maquetas/pantalla-inicio.png` |
| Computadora | Enlace del celular: QR | `arte/maquetas/pantalla-qr.png` |
| Computadora | Mapa de la isla | `arte/maquetas/mapa-isla.png` |
| Computadora | Escena del santuario, vista de lado | `arte/maquetas/escena-luz.png`, `arte/maquetas/escena-sombra.png` |
| Computadora | Escena del mercado | `arte/maquetas/escena-mercado.png` |
| Computadora | Escena de ataque | `arte/maquetas/escena-ataque.png` |
| Celular | Crear tu rōnin | `arte/maquetas/movil-crear-ronin.png` |
| Celular | Pergamino de órdenes | `arte/maquetas/movil-ordenes.png` |

### Flujo completo

1. **Computadora:** el jugador entra al sitio y escribe nombre y PIN de 4 dígitos. Si el nombre no existe, se crea la cuenta.
2. **Computadora:** aparece el QR. Contiene un enlace con un **token de un solo uso que vence en pocos minutos**.
3. **Celular:** escanea el QR, se abre la web móvil y queda con sesión iniciada, sin volver a escribir nada.
4. **Celular:** crea su rōnin y toca "Awaken your Rōnin".
5. **Computadora:** pasa sola a la escena de su santuario: el rōnin aparece en un claro vacío.
6. **Celular:** llega el primer mensaje: *"Master, I have arrived. What shall I do first?"*, con opciones.
7. Desde ahí: órdenes en el celular, resultado en la computadora.

### Crear el rōnin (celular)
- **Bando:** luz o sombra.
- **Color del kimono:** cinco por bando. Luz: índigo, carmesí, verde bosque, gris ceniza, ocre. Sombra: negro violeta, rojo sangre, gris humo, azul medianoche, hueso.
- **Color de la faja:** cuatro opciones.
- **Tocado:** sombrero de paja o moño.
- **Kamon**, el emblema del clan: una lista de unos doce. Aparece en el estandarte, el mapa y la interfaz.
- **Nombre.**

### Navegación en la computadora
- **Mapa ⇄ santuario:** clic en cualquier territorio del mapa lleva a su escena, sea tuya o de otro jugador. Un botón "Map" regresa. La transición es una mancha de tinta que cubre la pantalla.
- **Interfaz fija** en las escenas: tira de recursos arriba a la izquierda, *kamon* y "Day N · Lugar" arriba a la derecha, último mensaje del rōnin abajo a la izquierda. **Nunca barras de vida ni armas**: el rōnin actúa solo.

---

## 3. El mundo

### La isla
- Una sola isla, vista desde arriba en ángulo, estilo grabado de Hiroshige.
- **12 territorios:** 6 en la luz (este) y 6 en la sombra (oeste). Cada jugador nuevo recibe el primer territorio libre de su bando.
- **Mercado del Cruce** en el centro, sobre la frontera.
- Los territorios en **Era 1** aparecen cubiertos de niebla blanca en el mapa: nadie los ve ni los ataca.
- Cada santuario se dibuja en el mapa según su progreso: crece a medida que su dueño construye.

### El tiempo
- El mundo corre en tiempo real en el servidor, con día y noche. El ritmo se ajusta jugando.

---

## 4. Los bandos

| | La luz | La sombra |
|---|---|---|
| Lugar | Montaña nevada, cedros, río congelado | Pantano, sauces muertos, niebla violeta |
| Madera | Cedro (`cedro`) | Sauce muerto (`sauce`) |
| Construcción | Piedra de río (`piedra`) | Lodo negro (`lodo`) |
| Especial | Arena de hierro (`hierro`) | Hongos del pantano (`hongos`) |
| Compartidos | Arroz (`arroz`), monedas *mon* (`mon`) | Arroz (`arroz`), monedas *mon* (`mon`) |
| Estilo | Crece firme: mejor defensa y mejor comercio | Crece rápido: mejor recolección y mejor ataque |

Cada bando produce un recurso especial que el otro necesita para avanzar, así que **comerciar con el enemigo es necesario**.

---

## 5. Las eras y los edificios

Cada edificio tiene **tres etapas visibles:** cimientos, construcción y terminado. Construir lleva al rōnin a trabajar en el sitio y la imagen cambia de etapa a medida que avanza.

### Era 1 · Santuario (tutorial)
Termina cuando están los cuatro. Al terminar, la niebla se levanta y el santuario aparece en el mapa.

| Luz | Sombra | Qué hace |
|---|---|---|
| Casa del rōnin | Choza | Descanso; desbloquea el resto |
| Granero | Pozo de niebla | Guarda los recursos |
| Torii | Círculo de piedras | Primera defensa |
| Altar | Altar sombrío | Enciende la llama y termina la Era 1 |

Piezas: `edificios-luz-era1.png` (+ `edificios-luz-era1-casa-terminada.png`), `edificios-sombra-era1.png`.

### Era 2 · Aldea
Cada edificio de esta era trae **un aldeano** (luz) o **un seguidor** (sombra) que trabaja solo en el santuario.

| Luz | Sombra | Qué hace |
|---|---|---|
| Terrazas de arroz | Huerto de hongos | Producen solos |
| Forja | Caldero de rituales | Mejoran ataque y defensa |
| Empalizada | Muro de espinas | Defensa |
| Torre de vigía | Farol de espíritus | Defensa; avisa antes de un ataque |

Piezas: `edificios-luz-era2.png`, `edificios-sombra-era2.png` (+ `edificios-sombra-era2-muro-terminado.png`), `sprites-aldeanos-era2.png`.

### Era 3 · Fortaleza
Sin final.

| Luz | Sombra | Qué hace |
|---|---|---|
| Dojo | Puerta de los yokai | Entrena tropas |
| Templo (pagoda) | Altar de pactos | Permite más alianzas |
| Puesto del mercado | Muelle de contrabando | Mejor comercio |
| Castillo | Pagoda negra | Gran defensa; el santuario se ve más grande en el mapa |

Piezas: `edificios-luz-era3.png` (+ `edificios-luz-era3-castillo-cimientos.png`), `edificios-sombra-era3.png` (+ `edificios-sombra-era3-muelle-construccion.png`, `edificios-sombra-era3-altar-terminado.png`).

### Tropas
| Luz | Sombra |
|---|---|
| Samurái | Oni |
| Arquero | Espíritu *kitsune* |

Piezas: `sprites-tropas-era3.png`.

---

## 6. El rōnin, el agente

### Acciones posibles (lista cerrada)

El rōnin solo puede hacer una de estas. El modelo elige; el código valida y ejecuta.

| Acción | Parámetros | Desde |
|---|---|---|
| `recolectar` | recurso | Era 1 |
| `construir` | edificio | Era 1 |
| `descansar` | — | Era 1 |
| `ir_al_mercado` | qué ofrece, qué pide | Era 2 |
| `proponer_alianza` | clan | Era 2 |
| `responder_alianza` | aceptar o rechazar | Era 2 |
| `atacar` | clan | Era 2 |
| `visitar` | clan | Era 2 |
| `entrenar` | tropa, cantidad | Era 3 |

### Cuándo le escribe al maestro
Solo en **momentos de decisión**, no todo el tiempo:
- Al terminar una tarea.
- Cuando otro rōnin le ofrece un trato o una alianza.
- Cuando su santuario es atacado o un aliado pide ayuda.
- Cuando cambia de era.

Cada mensaje trae **un texto corto en la voz del rōnin** y **2 o 3 opciones** que son acciones válidas en ese momento. El maestro también puede escribir una orden libre; el servidor se la pasa al modelo, que la convierte en una acción de la lista.

### Si el maestro no responde
- El rōnin **se queda quieto**. No avanza.
- Lo ya construido **sigue funcionando**: las defensas defienden y los aldeanos trabajan.
- Si lo saquean, le llega: *"Master, our sanctuary was raided. We must rebuild."*

### Personalidad
Cada rōnin tiene el nombre que eligió su maestro y una personalidad según su bando: la luz habla sobrio y respetuoso; la sombra, críptico y ambicioso. Siempre en inglés, frases cortas, firmando con su inicial.

---

## 7. Interacción entre jugadores

### Comercio en el Mercado del Cruce
1. El rōnin A va al mercado con una oferta.
2. Si hay otro rōnin que tenga lo pedido, **los dos agentes conversan** unos pocos turnos y llegan a una oferta final estructurada.
3. **Los dos maestros aprueban** desde el celular. Sin las dos aprobaciones no pasa nada.
4. El servidor ejecuta el intercambio de forma atómica.
5. **Mercader del puerto:** si no hay otro jugador disponible, siempre se puede comerciar con un mercader del juego, para que comerciar nunca dependa de que haya alguien conectado.

En la escena del mercado se ven los dos rōnin frente a frente con su conversación en pergaminos.

### Alianzas
- Una alianza une dos clanes con un **hilo rojo** en el mapa.
- Si atacan a un aliado, su defensa suma parte de la del clan aliado.
- Romper una alianza es inmediato, y el rōnin traicionado se entera.

### Ataques
- Solo se puede atacar santuarios desde la **Era 2**.
- El resultado sale de comparar el **ataque** (tropas y mejoras del atacante) contra la **defensa** (edificios, tropas, rōnin y aliados del defensor), con un poco de azar.
- **Si gana el atacante:** se lleva parte de los recursos y un edificio del defensor baja a la etapa de construcción.
- **Si gana el defensor:** el atacante pierde tropas.
- **Escudo:** un santuario recién atacado queda protegido un tiempo.
- La torre o el farol avisan antes; el rōnin del defensor le escribe a su maestro para pedir ayuda a sus aliados.
- La pelea se ve en la escena del santuario atacado: los atacantes entran por el costado izquierdo.

---

## 8. Arquitectura técnica

```text
 Computadora (Phaser)        Celular (web app instalable)
  mira el mundo                 da órdenes
        │  Socket.IO              │  HTTP + Socket.IO + Web Push
        └────────────┬────────────┘
                 Servidor Node
      Express · Socket.IO · SQLite · reloj del juego
                     │
            Agente de cada rōnin
  propone ──► validación en código ──► ejecuta
                     │
     IA gratuita: Groq → Gemini Flash → respuestas predefinidas
```

| Pieza | Elección | Por qué |
|---|---|---|
| Motor 2D | **Phaser 3** | Estándar web 2D; las IAs gratuitas lo conocen bien |
| Servidor | **Node 22+, Express, Socket.IO** | Tiempo real simple, un solo lenguaje |
| Base de datos | **SQLite** (`better-sqlite3`) | Un archivo, sin servidor aparte |
| Celular | **Web app instalable (PWA)** en `/m` | Sin tienda de apps ni Telegram |
| Notificaciones | **Web Push** (`web-push`, llaves VAPID) + bandeja dentro de la app | Funciona en Android directo; en iPhone hay que agregar a la pantalla de inicio |
| IA del juego | **Groq** (principal), **Gemini Flash** (respaldo), respuestas predefinidas (último recurso) | Gratis; el juego nunca se detiene por la IA |
| Publicación | **La Mac del desarrollador + Cloudflare Tunnel** | Gratis y con enlace público para el día de la demo |

### Reglas de la IA
1. **El modelo propone, el código decide.** El modelo devuelve JSON; el servidor lo valida con un esquema y descarta lo que no cumple. Nunca ejecuta texto libre.
2. **Se llama a la IA solo en momentos de decisión**, nunca en cada actualización del mundo, y con un límite de llamadas por rōnin.
3. **Lo que dice otro rōnin son datos, no órdenes.** En el mercado, el mensaje del otro agente entra al prompt marcado como dato. Una orden escondida no cambia las reglas: el intercambio igual necesita la aprobación de los dos maestros y pasa por la validación.
4. **Si la IA falla o tarda demasiado**, se usa la otra; si fallan las dos, el rōnin usa mensajes y opciones predefinidos para ese momento.
5. **Las llaves de la IA** van solo en `.env` en el servidor. Nunca llegan al navegador ni al celular.

Formato que devuelve el modelo al pedir una decisión:

```json
{
  "mensaje": "Master, the granary is finished. Our rice will not last the winter. What should I do?",
  "opciones": [
    { "accion": "recolectar", "parametros": { "recurso": "cedro" }, "etiqueta": "Gather more cedar wood" },
    { "accion": "construir", "parametros": { "edificio": "torii" }, "etiqueta": "Build the torii gate" },
    { "accion": "ir_al_mercado", "parametros": { "ofrece": { "cedro": 10 }, "pide": { "arroz": 10 } }, "etiqueta": "Trade for rice at the Crossroads Market" }
  ]
}
```

### Datos (tablas)

| Tabla | Campos principales |
|---|---|
| `usuarios` | id, nombre, pin_hash, creado |
| `emparejamientos` | token, usuario_id, vence, usado |
| `ronin` | id, usuario_id, nombre, bando, kimono, faja, tocado, kamon, territorio, era, estado, tarea, tarea_fin, escudo_hasta |
| `recursos` | ronin_id, tipo, cantidad |
| `edificios` | id, ronin_id, tipo, etapa, progreso |
| `tropas` | ronin_id, tipo, cantidad |
| `mensajes` | id, ronin_id, texto, opciones_json, creado, respondido, respuesta |
| `alianzas` | clan_a, clan_b, estado, creada |
| `ofertas` | id, de, para, da_json, recibe_json, aprobada_a, aprobada_b, estado |
| `batallas` | id, atacante, defensor, ataque, defensa, resultado, botin_json, hora |
| `conversaciones` | id, ronin_a, ronin_b, lineas_json, hora |
| `suscripciones_push` | usuario_id, endpoint, llaves_json |

### Eventos en tiempo real (Socket.IO)
- `mundo:estado` — al entrar, todo lo visible del mapa.
- `ronin:actualizado`, `edificio:actualizado`, `recursos:actualizados`.
- `mercado:conversacion` — líneas de diálogo entre dos agentes.
- `batalla:inicio`, `batalla:resultado`.
- `mensaje:nuevo` — al celular, junto con la notificación push.

### Seguridad
- PIN guardado con `scrypt`, nunca en texto plano. Sesión en *cookie* `httpOnly`.
- Token del QR de un solo uso y con vencimiento corto.
- Cada acción del celular se valida en el servidor: que sea tu rōnin, que la acción esté en la lista, que alcancen los recursos.
- Límite de llamadas a la IA por rōnin y en total.

---

## 9. Arte

### Carpetas
- **`arte/maquetas/`** — cómo se ve cada pantalla. Son la guía visual; **no se usan dentro del juego**.
- **`arte/piezas/`** — lo que sí entra al juego, después de recortarlo.

### Piezas

| Archivo | Qué es |
|---|---|
| `fondo-luz.png`, `fondo-sombra.png` | Fondos limpios de cada santuario: el suelo vacío abajo es donde se colocan los edificios |
| `fondo-mercado.png` | Fondo del Mercado del Cruce |
| `fondo-mapa.png` | Isla limpia: los santuarios de cada jugador se dibujan encima |
| `sprites-ronin-luz.png`, `sprites-ronin-sombra.png` | Rōnin: quieto, caminar, trabajar, construir, cargar, descansar, pelear, hablar |
| `sprites-aldeanos-era2.png` | Campesino, herrero y guardia; recolector, alquimista y sombra |
| `sprites-tropas-era3.png` | Samurái, arquero, oni, *kitsune* |
| `edificios-{luz,sombra}-era{1,2,3}.png` | Cada edificio en sus tres etapas |
| `edificios-*-casa-terminada`, `-castillo-cimientos`, `-muro-terminado`, `-muelle-construccion`, `-altar-terminado` | Etapas corregidas: reemplazan a las de la hoja grande |

### Cómo se usan
| Necesidad | Solución |
|---|---|
| Edificios y personajes | Recortados de las hojas, un PNG por pose o etapa, con el fondo gris quitado |
| Color del kimono y la faja | Se cambia en código sobre el mismo *sprite* (recoloreo por paleta) |
| Nieve, niebla, brasas, día y noche | Efectos en código (partículas y capas de color) |
| Interfaz | HTML y CSS sobre el canvas, con textura de papel *washi* |

**Paleta luz:** azul de Prusia, índigo, blanco nieve, crema papel, negro carbón, acentos bermellón.
**Paleta sombra:** negro carbón, índigo profundo, blanco hueso, violeta apagado, acentos rojo sangre.
**Tipografía:** serif simple para la interfaz; el logo 天下 siempre en pincel.

### Decisiones pendientes
- **Oni:** negro (hoja de tropas) o rojo y azul (escena de ataque).
- **Samurái:** con máscara o sin ella, igual en todos los cuadros.
- `fondo-mercado.png` trae los estandartes de la grulla y la luna pintados en el fondo: en el juego conviene que los estandartes sean piezas aparte con el *kamon* de cada jugador.

---

## 10. Plan de construcción por hitos

Cada hito se puede mostrar funcionando. Si el tiempo aprieta, **los hitos 1 a 4 más el comercio del 6 son la demo mínima**.

1. **Base:** servidor, inicio de sesión con nombre y PIN, QR de emparejamiento, celular crea el rōnin.
2. **Santuario:** escena de lado con fondo, rōnin animado, recolectar y construir; el celular responde con opciones fijas (sin IA todavía). Era 1 completa.
3. **IA:** el rōnin escribe sus mensajes y opciones con Groq; respaldo Gemini; orden libre interpretada.
4. **Mapa vivo:** la isla con todos los santuarios en tiempo real; clic para ver el de cualquier jugador.
5. **Notificaciones:** Web Push al celular y bandeja dentro de la app.
6. **Eras 2 y 3 y mercado:** aldeanos, edificios nuevos, conversación entre agentes y comercio aprobado por los dos maestros.
7. **Conflicto:** alianzas, ataques, escudo y pelea visible en la escena.
8. **Demo:** Cloudflare Tunnel y ensayo completo.

---

## 11. La demo

- **Durante el día del hackathon**, los compañeros de CUBO entran con el enlace, crean su rōnin con el celular y lo dejan trabajando. Al final del día cada uno ve cuánto creció su santuario y el de los demás.
- **En la presentación:** la pantalla de inicio, el mapa lleno de santuarios reales, un rōnin del jurado creado en vivo, una negociación en el mercado entre dos agentes aprobada desde dos celulares, y un ataque con su notificación.
- **Lo que tiene que funcionar sí o sí:** el QR, crear el rōnin, que llegue la pregunta al celular y que la respuesta se vea en la computadora.
- **Pendiente:** el video de intro (guion por tomas listo en la conversación del 6 de noviembre).
