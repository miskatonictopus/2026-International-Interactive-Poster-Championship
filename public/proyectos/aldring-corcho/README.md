# Que ningún niño se quede fuera de la fiesta · Cartel 2 · Fundación Itaca

Segundo cartel digital interactivo para la campaña de la **Fundación Itaca**: donaciones para comprar juguetes de Navidad a niños y niñas en riesgo de exclusión. Hecho con HTML, CSS y JavaScript, con Three.js cargado desde CDN.

**Diseño:** Aldring Corcho · Planeta FP
**Asignatura:** 0612 · Desarrollo web en entorno cliente

Formato: 848 × 1200 px (A3 vertical adaptado a pantalla). Si la ventana es más pequeña, el cartel se escala proporcionalmente sin deformarse.

## Concepto

El mando de **PlayStation original** —el de la infancia de muchos adultos— rodeado de juguetes que flotan. Es un cartel **para jugar con él**: se agarran y se lanzan los juguetes, se gira el mando y se pulsan sus botones. Cada juguete es un regalo que algunos niños no tendrán esta Navidad.

**Cartel en reposo:** el mando entero y quieto, con los juguetes flotando a su alrededor y todo nítido. Es la captura de entrega y se puede imprimir tal cual.

**Contenido:** fecha (*21 de diciembre*), tema (*Que ningún niño se quede fuera de la fiesta*), mensaje (*Dona un regalo*), entidad (*Fundación Itaca · Navidad 2026*), logos de Fundación Itaca y Planeta FP, y autoría.

**Tipografía:** Michroma (titular ancho) e Inter Tight. **Fondo:** cuadrícula isométrica sobre `#0f172a`, con líneas `#475569` y casillas que se encienden en tonos pastel. **Color del texto:** cambia solo entre claro y oscuro según lo que haya detrás (ver abajo).

## Referencia

Cartel del **Taipei Golden Horse Film Festival 2021**, de **Bito Studio** (*The Moving Poster*): objetos 3D con **desenfoque de profundidad** (unos nítidos y otros borrosos, con el foco saltando de uno a otro), fondo plano y **texto pequeño y fijo** (título abajo, fechas en vertical y logo arriba).

## Archivos

| Archivo / carpeta                   | Contenido                                                   |
|-------------------------------------|-------------------------------------------------------------|
| `index.html`                        | Estructura del cartel e import map de Three.js              |
| `style.css`                         | Maquetación y tipografía                                    |
| `main.js`                           | Escena 3D, interacciones y eventos del ratón                |
| `mando ps4/`                        | Modelo 3D del mando de PS4 (`dualshock_4_ligero.glb`)       |
| `modelos/`                          | 15 juguetes en 3D (`.glb`)                                  |
| `package.json`                      | Comando `npm start` para abrirlo con un servidor local      |

## Eventos de JavaScript e interacciones

Todos los eventos se registran con `addEventListener()`. Para saber qué hay bajo el cursor se lanza un rayo desde la cámara (`THREE.Raycaster`, función `pick()`).

### 1 · `mouseenter`
- **Cartel (`#poster`)**: `handlePosterEnter()` pone el texto de ayuda.
- **Cada juguete, botón y el cuerpo del mando**: `enterTarget()` los resalta. Un juguete se agranda y el cursor pasa a "mano"; un botón se levanta un poco y el cursor pasa a "puntero".
- **"Dona un regalo" (`#cta`)**: `highlightCta()` hace que **todos los juguetes salten** y desplaza el texto y la flecha.

### 2 · `mouseleave`
- **Cartel**: `handlePosterLeave()` suelta lo que se estuviera arrastrando y quita los resaltes (`leaveTargets()`).
- **Objetos**: al salir de un juguete o botón, vuelve a su tamaño y posición.
- **"Dona un regalo"**: `resetCta()` devuelve el texto y la flecha a su sitio.

### 3 · `mousemove`
- `handleMouseMove()` hace una de estas cosas:
  - **Arrastrar un juguete** (`moveToyDrag()`): sigue al cursor sobre un plano frente a la cámara. Al soltarlo sale **lanzado** con la velocidad del movimiento, rebota en los bordes y se queda donde cae. Mientras se arrastra, **el foco salta al juguete** y todo lo demás se desenfoca.
  - **Girar el mando** (`moveControllerDrag()`): arrastrando el cuerpo del mando, se inclina poco, con inercia: unos **27° a cada lado** (`MAX_YAW`) y unos 21° arriba y abajo (`MAX_PITCH`), controlado por `MOVE_FACTOR = 0.3`. Así el mando se queda casi quieto y es fácil pulsar los botones. Los botones L y R solo le dan un pequeño giro. Sin tocarlo durante 2,5 s, **vuelve a su posición de reposo**.
  - **Resaltar** lo que hay bajo el cursor (`updateHover()`).
- Además, en cada movimiento `enterBox()` **enciende la casilla del fondo** bajo el cursor.

### 4 · `mousedown` / `mouseup`
`handleMouseDown()` decide qué se agarra según lo que haya bajo el cursor: un juguete (arrastrar), un botón (pulsar) o el cuerpo del mando (girar). `releaseAll()` lo suelta al levantar el botón del ratón.

### Los botones del mando
El mando es un DualShock 4 con texturas (`loadController()`). Sus mallas vienen con varios botones juntos, así que `splitShells()` las divide en piezas (agrupa los triángulos que comparten vértices) y `classifyShell()` reconoce cada botón por su malla, su número de triángulos y su posición. Al pulsar, el botón **se hunde de verdad** (`updatePieces()`) y hace algo:

| Botón                                   | Efecto                                                        |
|-----------------------------------------|---------------------------------------------------------------|
| △ ○ ✕ □ (acción)                        | Una **ola de color** grande en el fondo (verde, rojo, azul o rosa) que además **golpea a los juguetes**: los empuja hacia fuera desde el botón (más fuerte los cercanos), se iluminan de ese color y luego vuelven a su sitio |
| Cruceta (↑ ↓ ← →)                       | **Empuja** a todos los juguetes en esa dirección              |
| Share (a la izquierda del panel táctil)  | Los juguetes **vuelven a su sitio**                          |
| Options (a la derecha del panel táctil)  | Los juguetes **saltan** y giran, y después vuelven           |
| PS (el botón del medio)                  | Cambia el **tema de colores** del fondo: Navidad, Hielo, Oro, Violeta |
| Stick izquierdo                          | Los juguetes **giran** a toda velocidad (`spinToys()`)       |
| Stick derecho                            | Los juguetes **suben disparados y rebotan** por el cartel (`launchToys()`); con Share vuelven a su sitio |

### Propiedades visuales modificadas desde JavaScript
Posición, rotación y escala de cada juguete; hundimiento y levantamiento de los botones; rotación del mando; `transform` del botón "Dona un regalo" y su flecha; `cursor` y texto de ayuda; `--ink` y `filter` (color del texto y del logo); y en la escena 3D, el foco y la apertura del desenfoque, y el canvas del fondo.

### Funciones propias
`fitPoster`, `drawBoxGrid`, `drawBoxVeil`, `drawBoxes`, `boxAt`, `enterBox`, `holdLights`, `releaseLights`, `lightArea`, `normalizeToy`, `loadToys`, `clampToy`, `collideToy`, `updateToys`, `nudgeToys`, `shockToys`, `resetToys`, `jumpToys`, `splitShells`, `classifyPiece`, `loadController`, `updateController`, `updatePieces`, `updateCamera`, `posterPoint`, `pick`, `enterTarget`, `leaveTargets`, `updateHover`, `pressPiece`, `releasePiece`, `startToyDrag`, `moveToyDrag`, `startControllerDrag`, `moveControllerDrag`, `releaseAll`, `handleMouseDown`, `handleMouseMove`, `handlePosterEnter`, `handlePosterLeave`, `highlightCta`, `resetCta`, `updateTextTone`, `brightnessBehind`, `animate`.

## Cómo está hecho

**Fondo (Background Boxes).** Una cuadrícula de casillas de 192 × 96 (el original, de 64 × 32, multiplicado por `BOX_ZOOM = 3`, es decir, un 300 % más grandes) inclinada con la misma transformación que el componente original (`skewX(-48°) skewY(14°) scale(0.675)`), con una cruz en las esquinas pares y un velo radial que la funde con el color de fondo hacia los bordes. En lugar de miles de `<div>`, se dibuja en un canvas 2D (`drawBoxGrid()` una sola vez, `drawBoxes()` solo mientras haya casillas encendidas) y se usa como fondo de la escena 3D. Cada casilla encendida se apaga sola en 2 s. Está basado en el componente *Background Boxes* (Aceternity UI / 21st.dev), reescrito en JavaScript puro.

**Juguetes.** 15 modelos de `modelos/` (`.glb` con compresión Draco) flotan a distintas profundidades, girando despacio y subiendo y bajando (`TOYS`, `updateToys()`). Para añadir o quitar uno basta con editar la lista `TOYS` (archivo, posición, tamaño y giro). Los límites de `clampToy()` impiden que se salgan del cartel.

**Choques con el mando.** Los juguetes no atraviesan el mando. `collideToy()` lo trata como tres cajas (las dos empuñaduras y la parte central, en `COLLIDERS`, calculadas del modelo al cargarlo) que giran con él, y cada juguete como una esfera. Si lo tocan, se les empuja hacia fuera y **rebotan**; si arrastras uno contra el mando, sale por el lado por el que menos se ha metido, normalmente por delante, así que **se queda encima**. Si giras el mando, empuja a los juguetes que tenga cerca.

**Desenfoque de profundidad.** `BokehPass` de Three.js. En reposo la apertura es mínima y todo se ve nítido; al agarrar un juguete sube y el foco se coloca a su distancia.

**Color del texto según lo que haya detrás.** `updateTextTone()` copia la escena 3D a un canvas pequeño cada 6 fotogramas y mide el brillo de la zona que ocupa cada texto (`brightnessBehind()`). Si es oscuro, ese texto pasa a color claro (`--ink`), y al revés, con un margen para que no parpadee. El logo de Planeta FP se invierte a blanco sobre fondos oscuros. Así el texto no desaparece cuando el fondo o un juguete se oscurecen.

## Cómo ejecutarlo

Como `main.js` es un módulo y carga modelos 3D, hay que abrirlo con un servidor local, no con doble clic:

```
cd "C:\Users\aldri\Desktop\poster 2"
npm start
```

Se abre en http://127.0.0.1:8081.

## Créditos de los modelos 3D

**Mando:** "DualShock 4 PlayStation Controller" de **shaielwolf** (https://sketchfab.com/3d-models/dualshock-4-playstation-controller-e3c2f0dc16524fc19cdde45bad1de1a9), licencia **CC Attribution (CC BY)**. Archivo `mando ps4/dualshock_4_ligero.glb`. Cambios hechos al modelo original: texturas pasadas de PNG a WebP, geometría comprimida (Draco), carcasa recolorada en rojo, sticks en negro, botones separados en piezas para poder pulsarlos y luz azul en el panel táctil.

**Juguetes:** proceden del repositorio [codrops-singularity-demo](https://github.com/niccolofanton/codrops-singularity-demo) de Niccolò Fanton y, originalmente, de [Sketchfab](https://sketchfab.com), bajo licencia **CC BY 4.0**:

- Game Boy Color: rommalart
- Anillo esmeralda (Klonoa 2): Dr_Kryzel
- Rayman: gemmygod
- Clank: anguswyatt
- Crash Bandicoot: smitty462_
- Casco de Daft Punk: Moustache_Cat
- Pico de Minecraft: Blender3D
- Steve (Minecraft): None_Yaroslav
- Pipo Monkey (Ape Escape): mathpaula28
- Mario: ruthromantic
- Oso Dropout Bear: joe_daburca
- Casco de Deadmau5: NanoRay
- Bastón de Sly Cooper: James Allison
- Rupia de Zelda: Elhiot
- Daxter: theamazingdonovan207

Se han dejado fuera el coche, el tanque, la Pokéball y el modelo de Terraria, porque el repositorio no indica su autor ni su licencia. Algunos modelos representan personajes con marca registrada de sus compañías: se usan solo con fines educativos en esta práctica.

## Ola de color de los botones

Al pulsar △ ○ ✕ □, `lightArea()` enciende las casillas del fondo alrededor del botón, de dentro a fuera, con un radio de 3 × 4 casillas (`WAVE_RADIUS`; con las casillas a 300 % cubre la misma zona que antes 8 × 12, el doble que el primer diseño) y una velocidad de `WAVE_SPEED` segundos hasta el borde. A la vez, `shockToys()` calcula la distancia de cada juguete al botón en el cartel: la onda le llega a unos 800 px/s, y entonces `updateToys()` lo empuja hacia fuera, lo hace girar y lo ilumina del color del botón (emisivo del material), que se apaga solo. Para hacer la ola más grande o pequeña basta con cambiar `WAVE_RADIUS`.

## Luces que se quedan al salir

Cuando el cursor sale del cartel (`mouseleave`), `holdLights()` deja encendidas unas 20 casillas del fondo (cada una salta a otra casilla cada 5 s, `HOLD_CHANGE`), cada una de un color distinto (`HOLD_COUNT`): las últimas que encendió el cursor más otras repartidas al azar, siempre en la franja del cartel sin textos (`HOLD_ZONE`). Aparecen despacio, brillan con una intensidad moderada (`HOLD_ALPHA`) y "respiran" un poco. Solo iluminan el fondo, por detrás del mando y de los juguetes. Cuando el cursor vuelve a entrar (`mouseenter`), `releaseLights()` las apaga poco a poco.

## Rendimiento

- El desenfoque de profundidad (`BokehPass`) se apaga solo cuando el foco está en reposo, porque pintarlo obliga a dibujar la escena dos veces. Se enciende al agarrar un juguete.
- El fondo de casillas se repinta como mucho a 30 fotogramas por segundo y su textura es de 512 px de ancho.
- El `raycast` del cursor se hace una sola vez por fotograma, por muchos `mousemove` que lleguen.
- El color de los textos se mide cada 10 fotogramas (`TONE_EVERY`) sobre una imagen reducida de 106 × 150 px.
- La resolución de la escena está limitada a 1,5 veces (`MAX_PIXEL_RATIO`).

## Choques y rebotes

Ahora hay 20 juguetes: los 15 originales y 5 más en versión pequeña (los mismos modelos, para no añadir peso a la carga ni licencias nuevas).

- **Entre juguetes** (`collideToys`): chocan como bolas de billar en el plano del cartel; solo los que están a profundidad parecida. Se separan, se intercambian velocidad según su tamaño y giran un poco por el golpe. Un juguete agarrado no cede: empuja a los demás.
- **Contra los bordes del cartel** (`clampToy`): rebotan con `WALL_BOUNCE` (0,9; 1 sería un rebote perfecto).
- **Parámetros** al principio de la sección de juguetes: `WALL_BOUNCE`, `TOY_BOUNCE`, `TOY_DAMPING` (cuánto los frena el aire) y `MAX_SPEED`.
- Tras un golpe fuerte el juguete deja de volver solo a su sitio; con el botón Select vuelven todos.

## Zonas borrosas detrás de los textos

Detrás de las letras (arriba, abajo y los dos textos verticales) el fondo se ve borroso y un poco más oscuro, con `backdrop-filter` (clase `.blur-zone` en `style.css`). Los bordes se desvanecen con una máscara para que no se note el corte. La cantidad de desenfoque se cambia con `--blur` (9 px por defecto) y el tinte con el `background` de `.blur-zone`.

## Navidad y vuelta a la posición original

- **Adornos de Navidad:** un Papá Noel, un reno con la nariz roja, un gorro de Papá Noel y una estrella dorada, modelados con formas simples de Three.js (`makeSanta`, `makeReindeer`, `makeSantaHat`, `makeStar`; lista `XMAS`), sin archivos externos ni licencias. Se comportan como el resto de juguetes: se agarran, se lanzan, chocan y rebotan. Ahora hay 24 en total.
- **Vuelta al sitio:** un segundo después de sacar el cursor del cartel (`RETURN_DELAY`, `sendHome()`), todos los juguetes vuelven a su posición original y el mando a su reposo. Si el cursor vuelve a entrar antes, no pasa nada.

## Juguetes que resaltan

Para que se separen del fondo oscuro, los juguetes tienen más reflejos y un poco de luz propia (`punchUp()`, ajustable con `TOY_PUNCH`; 0 es como antes) y una luz de contorno azulada desde atrás (`rimLight`) que les dibuja un borde claro.

## Título llamativo

La última palabra (**fiesta.**) va en grande, con un relleno dorado metálico que brilla de forma continua y destellos en forma de estrella (`.title .hl` en `style.css`); con `prefers-reduced-motion` se quita la animación.

## Colores y escarcha del mando

Los colores salen de una imagen de referencia de un mando rojo y negro: la carcasa tiene un degradado vertical de negro (arriba) a rojo brillante (abajo), los sticks son de goma roja y los símbolos △ ○ ✕ □ y las flechas son rojos. Se hace en el shader (`makeFrostMaterial()`, `PS_RED`, `PS_BLACK`) conservando las texturas del modelo (relieve de los sticks, panel táctil, logo). La escarcha son granos que brillan y parpadean con un reloj compartido (`glitterTime`); son emisivos, así que alumbran un poco (`GLITTER_SIZE` para su finura y `GLITTER_GLOW` para cuánto brillan).

## Título de neón

El título lleva un brillo de neón fijo (blanco con aura roja, `.title.tone`) y la palabra "fiesta." un relleno dorado con aura. Todos los efectos del título son fijos: no parpadean ni cambian con el cursor.

## Cartel limpio para imprimir

Mientras el cursor no está sobre el cartel (y al cargar la página), se esconden el mensaje de ayuda de arriba y el nombre del autor (clase `is-idle` en `#poster`, que `handlePosterEnter()` quita y `handlePosterLeave()` pone). Al volver a entrar con el cursor reaparecen.

## Logo de la Fundación Itaca

El logo (`logo-itaca.png`, de la asociación Itaca: letras blancas sobre fondo morado) está arriba a la derecha, con su color original.

## Botones mantenidos

Mientras se mantiene pulsado un botón, su efecto sigue: las casillas de colores de △ ○ ✕ □ se quedan encendidas y la onda sobre los juguetes se repite; la cruceta, Share, Options y los sticks repiten su acción cada fracción de segundo (`REPEAT_EVERY`, `repeatHeld()`). Al soltar, las casillas se apagan poco a poco. El botón PS cambia de tema solo una vez por pulsación.
