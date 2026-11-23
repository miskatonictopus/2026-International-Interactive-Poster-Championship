# Historial del cartel · THE INTERACTIVE POSTER

Última actualización: 17 de noviembre de 2026.

**Versión actual:** la 16, con noche estrellada y suelo nevado. La anterior, que también gustaba, es la 15 (`versiones/15-cartel-azul/`). Las dos son «Que ningún niño se quede sin regalo», con estética de libro navideño antiguo, regalos ilustrados y un estado final imprimible, para la Fundación ITACA. Es la que hay en `index.html`, `main.js` y `style.css`, en la raíz del proyecto, con Matter.js en `lib/`.

**Cambio de enunciado (17 de noviembre):** el tema pasa a ser «21 de diciembre · Fundación ITACA»: donar dinero para comprar regalos de Navidad a niños en riesgo de exclusión. El enunciado pide `mouseenter`, `mouseleave` y `mousemove`, logos de las entidades, un `README.md` y una captura del estado final. Las versiones 1 a 8 responden al enunciado anterior.

## La versión 16: noche estrellada y suelo nevado

- La versión anterior gustaba bastante y queda guardada tal cual en `versiones/15-cartel-azul/` por si se vuelve a ella.
- **Fondo:** cielo de noche navideña, un degradado de `#0e1d30` arriba a `#3a7099` en el horizonte, con un halo suave detrás del titular. En el canvas, 150 estrellas que titilan a distinto ritmo; unas pocas son más grandes y tienen destello en cruz.
- **Suelo:** nieve en dos capas por detrás de los regalos (`#b9cddc` y `#e6eef4`) y una capa por delante que les tapa un poco la base, para que parezcan apoyados en la nieve. Abajo hay bandas azuladas de sombra. Se quita la línea dorada del suelo con volutas.
- **Ajustes por el fondo oscuro:**
  - El marco dorado pasa a una capa por encima de todo, para que no lo tape la nieve.
  - La pista y el pie van en azul marino sobre la nieve.
  - El matasellos pasa a tinta dorada.
  - El medallón gana un fino borde dorado.

## La versión 14: ramas ilustradas

- El acebo dorado de contorno «se veía rarillo». Se cambia por ramas rellenas en estilo plano, a partir de una lámina de referencia de acebo, pino y muérdago:
  - Acebo a la izquierda: hojas espinosas en dos tonos con nervio claro y bayas rojas con brillo.
  - Pino a la derecha: agujas en dos verdes y bayas.
  - Muérdago colgado del marco: lazo rojo, hojas alargadas y bayas blancas.
- Se dibujan en `main.js` (`buildGreenery()` y `hollySprig()`) dentro del grupo `#greenery`. Los verdes son más claros que en la referencia para que destaquen sobre el azul.
- «se quede sin» pasa de Pinyon Script a Lobster Two, en cursiva negrita (700) a 60 px, a petición del usuario. Mantiene el degradado dorado.
- Se probó también el mensaje en Lobster Two y la cursiva 400, más fina. Al usuario le gustaba más como estaba y se deshizo: el mensaje sigue en la cursiva de Fraunces.
- El `mousemove` del titular (desplazamiento en sentido contrario) y del medallón (giro de hasta unos 20°) resultaba brusco y no pegaba con el cartel. Se cambia por una «luz sobre oro estampado», suavizada fotograma a fotograma en `updateLight()`:
  - Un brillo recorre el dorado de «se quede sin».
  - El filete dorado y la sombra de «REGALO» se mueven 2 o 3 px.
  - El medallón se inclina ±3° y su anillo punteado gira despacio.
  - Al imprimir, todo queda en su posición de reposo.
- Al usuario el movimiento de «REGALO» le parecía raro. Se quita y se sustituye por purpurina:
  - Con `mouseenter`, aparece sobre las letras una textura de motas doradas, blancas y rojas, generada en `<canvas>` y recortada al texto con `::after` y `background-clip: text`. Centellea con una animación CSS por saltos.
  - Con `mouseleave`, se apaga en 0,6 s.
  - Con `mousemove` sobre la palabra, saltan chispas en forma de estrella.
  - No aparece al imprimir ni en el estado final de la captura. Con «reducir movimiento», no centellea ni suelta chispas.
- El divisor y el mensaje suben 50 px, junto con las dos ramas de acebo laterales, porque quedaban muy separados de «REGALO».
- El muérdago y el pino salieron deformes. Tras un intento de rehacerlos, el usuario prefirió quitarlos: ahora hay tres ramas de acebo iguales, una arriba entre los sellos y el medallón y otra a cada lado del mensaje.

## La versión 13: regalos ilustrados y matasellos

- El usuario pasó tres referencias: un regalo plano con lazo rojo y ramita, una pila de regalos con lazos dorados y acebo, y unos sellos ilustrados. Pidió regalos «más pulidos» y dijo que le gustaban los sellos.
- Los regalos se dibujan en SVG con `giftSVG()`, `bowSVG()` y `tagSVG()`:
  - Tapa más ancha, cara lateral en sombra y sombra bajo la tapa.
  - Estampados con patrones SVG (`pat-dots`, `pat-sprig`, `pat-snow`, `pat-stars` y `pat-stripes`) definidos en el `<svg>` de adornos.
  - Cinta simple o en cruz, lazo con lazadas y cintas, y etiqueta de kraft con cordel.
- Paleta de los regalos: burdeos `#8b2236`, salvia `#86a98f`, pino `#2f5a46`, coral `#e0574a`, crema `#f3e9d6`, kraft `#c9a77c`, frambuesa `#a8325a`, cinta dorada `#e3c690` y cinta roja `#e0473b`.
- Sobre el sello de L'Hospitalet hay un matasellos: «L'HOSPITALET · NAVIDAD · ITACA», «21 DIC 2026» y ondas.
- La interacción y la impresión siguen como en la 12.

## La versión 12: cartel imprimible

- La estética es la de la 11, pero cambia toda la interacción. El usuario quería menos juego y un estado final que sirva como cartel impreso.
- Se quitan la física (Matter.js, ya no está en el proyecto), las cantidades, el contador en euros y el botón «Otra vez».
- La pila de 18 regalos está compuesta a mano (`PILE` en `main.js`) y es igual en la web que en papel.
- Estado inicial: huecos punteados dorados. Con `mouseenter`, el regalo de un hueco vacío cae desde arriba con rebote; si ya está, se levanta y se ladea. Con `mouseleave`, vuelve a reposar. `mousemove` sigue igual: nieve, titular y medallón.
- Estado final: todos los huecos llenos y sin la pista «Pasa el cursor por los huecos». Es el cartel imprimible. Abajo, un sello grande con «Haz tu donación · Cada regalo cuenta».
- Impresión: `@media print` y `@page` en A3 vertical sin márgenes. `beforeprint` completa la pila, así que Ctrl+P siempre saca el estado final. Se comprobó con Chrome imprimiendo a PDF: sale una sola página A3.

## La versión 11: libro navideño antiguo

- La misma mecánica que la 10: pila de regalos en el suelo y huecos punteados. Ahora la pila se completa con 26 regalos, que caen repartidos de forma uniforme a lo ancho para que la pila crezca pareja y no tape el mensaje.
- La estética sigue una referencia que pasó el usuario, la portada de *Letters from the North Pole*:
  - Papel azul `#2f6a88` con textura, marco dorado doble, volutas, acebo y estrellas.
  - Titular en Fraunces (crema y rojo `#c8322b` con filete dorado) y Pinyon Script dorada.
  - Logo en un sello azul marino, fecha en un medallón festoneado y cantidades como sellos perforados.
- Se toma el estilo, no la portada: no hay casa, ni trineo, ni cartas.
- Al completar la pila, el titular pasa de «Que ningún niño se quede sin regalo» a «Este año ningún niño se queda sin regalo».
- Con `mousemove` también gira el medallón de la fecha.
- El logo es `img/LogoHD_.webp`, el archivo que guardó el usuario. Las versiones 9 y 10 buscaban `img/logo-itaca.png` y por eso no salía.

## La versión 10: pila de regalos, estética plana

- Sin saco. Los regalos caen desde arriba de todo el cartel y se amontonan en el suelo. Hay seis huecos punteados con los regalos que faltan, que se desvanecen a medida que llegan regalos de verdad.
- Las cantidades funcionan igual que en la 9: con `mouseenter` el botón crece, gira y se vuelve amarillo y caen 1, 2, 3 o 5 regalos; con `mouseleave` vuelve a su estado inicial. Con `mousemove`, la nieve hace parallax, el titular se desplaza y los regalos que roza el cursor se remueven.
- Con 30 regalos, el título cambia a «Gracias. Ningún niño sin regalo.». `F`, `R` y `?final` funcionan como en la 9.
- Estética plana, como la web de Itaca: morado `#7333a0`, blanco, amarillo `#ffd23f` de acento, lila y negro, sin texturas ni sombras. El título va en Archivo 800 alineado a la izquierda.
- **Por qué se dejó la 9:** el saco no gustaba («parece una nuez») y tampoco la estética de papel recortado.

## La versión 9: «Llena el saco»

- Hay un saco vacío. La primera versión estaba dibujada con línea blanca y la final era de papel recortado. Al pasar el cursor por una cantidad (5, 10, 20 o 50 €), el botón cambia (`mouseenter`) y caen 1, 2, 3 o 5 regalos con física de Matter.js. Al salir, el botón vuelve a su estado inicial (`mouseleave`).
- Con el movimiento del cursor (`mousemove`), la nieve hace parallax, el título se desplaza un poco y los regalos que roza el cursor se remueven.
- Con 43 regalos aparece «¡Saco lleno!». `F` llena el saco, `R` reinicia y `?final` abre el estado final, que es el de `captura.png`.
- Estética: papel recortado sobre cartulina morada (el morado de Itaca), con un saco de papel kraft, regalos cortados a tijera, grano de papel y sombras duras. La fecha va en una etiqueta colgada del saco. Se rehízo así el mismo día porque la primera versión, plana y centrada, parecía una plantilla.
- El logo se carga desde `img/logo-itaca.png`. Si no está, se muestra el nombre en texto.

## Cómo volver a una versión anterior

Cada carpeta de `versiones/` es un cartel completo que funciona solo, con una `captura.png` para verlo de un vistazo.

- **Solo verla:** abre el `index.html` de su carpeta con doble clic.
- **Recuperarla como principal:** copia sus tres archivos (`index.html`, `main.js`, `style.css`) a la raíz del proyecto y sustituye los que hay. La versión actual sigue guardada en `versiones/16-noche-nevada/`, así que no se pierde nada.

## Las versiones

| # | Carpeta | Qué es | Paleta |
|---|---|---|---|
| 1 | `1-neurodegenerativas` | El cartel inicial, sobre enfermedades neurodegenerativas (21 de diciembre): recuerdos borrosos y una neurona que el cursor enciende | Papel `#efe8da`, tinta `#1b1720`, naranja `#e23d17` |
| 2 | `2-tipografica-verde` | Primer cartel de párkinson: PÁR/KIN/SON a sangre, abierto por una costura con seis botones | Verde ácido `#dcfb2c`, negro `#0c0c0c`, rojo `#ff3d0f`, blanco |
| 3 | `3-tipografica-azul` | El mismo cartel con la paleta Cotton Candy Dreams | `#32cbff`, `#00a5e0`, `#89a1ef`, `#ef9cda`, `#fecef1` y marino `#0e1238` |
| 4 | `4-tipografica-rosa` | El mismo cartel con la paleta rosa de Coolors | `#ffc2d4`, `#602437`, `#b9375e`, `#e05780`, `#ff7aa2`, `#ff9ebb`, `#ffe0e9` |
| 5 | `5-vintage-nueva-york` | Ilustración vectorial: un hombre con sombrero, sol rojo y cabecera de revista. El cursor es su mano | Marino `#15163f`, crema `#fbf5dc`, rojo `#e2392b`, violeta `#5a5fb0` |
| 6 | `6-poco-a-poco` | Vuelve a las enfermedades neurodegenerativas en general: cabeza de papel recortado, al estilo de Saul Bass, que se deshace poco a poco | Mostaza `#eaa91f`, negro `#17130f`, rojo `#d8381d`, verde azulado `#12695f`, crema `#f3e8cc` |
| 7 | `7-poco-a-poco-limpio` | El mismo cartel con colores limpios y sin grano de papel | Blanco roto `#f5f5f2`, negro `#111214`, cobalto `#1f3fe0`, azul claro `#c5cfe2`, gris `#e1e1dc` |
| 8 | `8-poco-a-poco-titulo-sobrio` | Sin el ojo y con un título en Archivo cuyo grosor baja de 900 a 100 letra a letra, porque las letras recortadas daban aire de comedia o acción | La misma que la 7 |
| 9 | `9-llena-el-saco-itaca` | Nuevo enunciado, Fundación ITACA: las cantidades hacen caer regalos con física dentro de un saco | Cartulina `#6b2d96`, crema `#f4ead2`, kraft `#cf9a5c`, mostaza `#f2b62b`, rojo `#d8381d`, lila `#b68ae0` |
| 10 | `10-pila-de-regalos` | Sin saco: los regalos se amontonan en el suelo del cartel, con estética plana como la web de Itaca | Morado `#7333a0`, blanco, amarillo `#ffd23f`, lila `#c9a3ee`, negro `#111111` |
| 11 | `11-libro-navideno` | La misma pila con estética de libro navideño antiguo: oro, sellos, medallón y titular rojo | Azul `#2f6a88`, crema `#f1e6cc`, rojo `#c8322b`, oro `#d4ad5a`, verde `#2e6a4f`, marino `#1d2a38` |
| 12 | `12-imprimible` | La misma estética con otra interacción: huecos que se llenan al pasar el cursor y un estado final imprimible en A3 | La misma que la 11 |
| 13 | `13-regalos-ilustrados` | Regalos ilustrados en SVG (tapa, estampados, lazos, etiquetas) y matasellos sobre el sello del lugar | La de la 11 más burdeos, salvia, pino, coral, kraft y frambuesa en los regalos |
| 16 | `16-noche-nevada` | La 15 con cielo de noche estrellada y suelo nevado bajo los regalos | Cielo `#0e1d30` → `#3a7099`, nieve `#e6eef4` y `#b9cddc` |
| 15 | `15-cartel-azul` | La 14 con purpurina en «REGALO», luz sobre el dorado, mensaje más arriba y Lobster Two | La misma que la 14 |
| 14 | `14-ramas-ilustradas` | Acebo, pino y muérdago en estilo plano en lugar del acebo dorado de contorno | La de la 13 más verdes `#2a5e45`, `#3b7a56`, `#5c9b72` |

**Las versiones 2 y 3 están reconstruidas.** En su momento no se guardaron copias, así que se rehicieron a partir de la 4 cambiando los colores. Se ven igual que entonces, con estas diferencias:

- Las dos incluyen la corrección de la línea que aparecía dentro de la Á, que se hizo durante la versión azul.
- En la verde, los botones y la flecha del cursor son blancos, con el rastro del cursor también en blanco.

## La idea de las versiones 6 a 8: «Poco a poco»

Lo que comparten estas enfermedades: la pérdida es lenta, no vuelve y alguien se queda sosteniendo.

- La cabeza está hecha de 12 trozos, y cada uno es algo que se pierde: arriba lo que se olvida («tu nombre», «el camino a casa») y abajo lo que el cuerpo deja de hacer («tragar», «dar un paso»).
- Al entrar el cursor en el cartel, los trozos empiezan a soltarse solos y en orden aleatorio. Pasar el cursor por uno lo sostiene, pero solo se puede sostener uno a la vez, y cada vez se recupera menos.
- Debajo aparece la sombra de la cabeza con las palabras **SIGUE AQUÍ**. Al final: «Todavía no tienen cura. Necesitan a quien se queda.»
- Sin hacer nada, todo cae en unos 28 segundos. Sosteniendo sin parar, un bot aguantó 61; el límite está en 60 segundos más lo que tarda en caer el último trozo (`MAX_TIME` en `main.js`).
- Para que no parezca generado: cortes irregulares de tijera, y, en las versiones 6 y 7, letras recortadas a mano con tinta mal registrada. La versión 6 tiene además grano de papel.
- Con Tab se sostienen los trozos con el teclado, y con «reducir movimiento» se desvanecen sin caer. `F` salta al final y `R` reinicia.

## La idea de las versiones 2 a 5

**"Abróchate la camisa".** Abrocharse es una tarea cotidiana que el párkinson suele dificultar. Los botones de la camisa son también los botones de la interfaz: hay que abrochar seis mientras todo tiembla. Cada acierto cierra la camisa. Al terminar, aparecen tu tiempo y tus fallos junto a la frase final, y queda un temblor pequeño a propósito, para no sugerir que la enfermedad se cura.

## Cómo funciona el temblor

Vale para las versiones 2 a 5. Las versiones 6 a 8 no usan este sistema.

- El clic cuenta donde está el cursor tembloroso (en la versión 5, la punta del dedo), no donde apunta el ratón.
- El temblor oscila a unos 4–6 Hz, la frecuencia del temblor de reposo real, y aumenta si te quedas quieto.
- Cerca de un botón, el cursor va con retraso.
- Si fallas, el botón salta, y cada fallo baja un poco el temblor de ese botón para que se pueda terminar.

**Acierto en la versión 5**, con un bot apuntando al centro: alrededor del 23 % al principio y alrededor del 60 % tras 12 fallos en el mismo botón. La dificultad se ajusta con `CURSOR_TREMOR` en `main.js`.

**Accesibilidad:** con Tab e Intro los botones se abrochan sin temblor, y con «reducir movimiento» activado el temblor desaparece.

**Atajos:** `F` salta al final, `R` reinicia, y `index.html?final` abre directamente el estado final.

## Pendiente

Versión 9:

- Guardar el logo blanco de Itaca como `img/logo-itaca.png` y añadir los logos de las demás entidades si los hay.
- Aclarar el nombre: el enunciado dice «Fundación ITACA», pero el logo dice «associació educativa».
- Probarla con un ratón real: los clics simulados no prueban el `mouseenter`, solo se comprobó el estado final con Chrome sin interfaz.
- Subirla a GitHub para la entrega.

Versiones 6 a 8 (enunciado anterior):

- Versiones 6 a 8: confirmar la fecha «21 de diciembre», que viene del cartel inicial y no se ha comprobado.
- Versiones 6 a 8: probarlas con una persona; solo se ha probado con el cursor simulado en Chrome, y la parte táctil no se ha probado.
- Versiones 6 a 8: revisar la frase final y la lista de enfermedades con una fuente médica si se va a publicar.

Versiones 2 a 5:

- Comprobar el dato «más de 8,5 millones de personas (OMS, 2019)» en la web de la OMS, además del 11 de abril y los 4–6 Hz si se van a citar.
- Probarlo con una persona y un ratón real: hasta ahora solo se ha probado con clics simulados en Chrome. La parte táctil no se ha probado.
- Decidir si la figura de la versión 5 se envejece (pelo canoso, más arrugas, sin sombrero), porque ahora recuerda a un detective de cine negro.
