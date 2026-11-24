# Ningún niño sin regalo · The Interactive Poster (3D)

**Actividad 0612 · Desarrollo web en entorno cliente**
Cartel digital interactivo para la **Fundación ITACA (L'Hospitalet)** · **21 de diciembre**

![Captura del cartel](captura.png)

## Concepto

Es una campaña de sensibilización para recaudar donaciones con las que comprar regalos de Navidad a niños y niñas en riesgo de exclusión.

El cartel es una **escena invernal en 3D real** al atardecer:
- una caseta de madera nevada con un banco lleno de regalos;
- un árbol de Navidad iluminado;
- un bosque de pinos;
- animales que viven en la escena: ciervo, zorro, conejo, ardilla y pájaros.

El mensaje es **"Dentro de cada regalo hay una sonrisa"**. Quien explora el cartel con el ratón descubre que un gesto pequeño despierta toda la escena, igual que una donación.

- **Formato:** 848 × 1200 px (A3 vertical). Si la ventana es más pequeña, el cartel se escala de forma proporcional sin deformarse.
- **Tecnología:** HTML, CSS y JavaScript con [Three.js](https://threejs.org/) r128 (WebGL), incluido en `lib/`.
- **Tipografías:** *Fraunces* e *Inter*, incluidas en `fonts/` (funcionan sin conexión).
- **Branding:** Fundación ITACA, sello "Juguete Solidario" y hashtag de la campaña.

## Todo en 3D

- **Modelado 3D:**
  - todos los objetos son geometría 3D: cajas, cilindros, conos, esferas, tornos (`LatheGeometry`) para macetas, cubo, regadera y sacos, extrusiones para las estrellas y el frontón, y tubos para la guirnalda, el muelle y la cola de la ardilla;
  - los animales tienen cuerpos orgánicos continuos (`loftGeometry`: secciones elípticas a lo largo de una columna) con el pelaje pintado en los vértices, tomando como referencia fotos reales: ciervo rojo con cornamenta, zorro rojo, conejo gris chinchilla, ardilla roja, lavandera blanca, arrendajo azul, petirrojo, cardenal y carbonero;
  - **pelo 3D** con la técnica de capas (*shell fur*): la malla se repite inflada a lo largo de la normal y recortada con un mapa de pelos sueltos (`addFur`);
  - **patas articuladas** (`makeLimb`): hombro/cadera, codo/babilla, rodilla/corvejón, menudillo y pezuña; al andar, cada articulación se dobla con su propio ciclo de paso (`poseLegs`): paso lateral en el ciervo y trote en diagonal en el zorro;
  - los pinos son abetos de once pisos con ramas de agujas sueltas en el borde (`pineCardsGeometry`).
- **Texturas procedurales:** se generan con `<canvas>` y ruido fractal repetible, sin imágenes externas:
  - madera envejecida en tablones, con veta, juntas y nudos;
  - tejas, nieve con brillos y relieve, y agujas de pino;
  - corteza, pelaje para cada animal, arpillera, barro, metal galvanizado y cinco papeles de regalo;
  - el cielo nocturno y las etiquetas "ILUSIÓN" y "semillas de ilusión".

  Muchas usan además `bumpMap` para dar relieve.
- **Iluminación real:**
  - la luz verde de la aurora, que proyecta sombras suaves (`PCFSoftShadowMap`), con un relleno magenta y una luz ambiental nocturna muy débil;
  - la luz cálida de la ventana, el resplandor de las bombillas del árbol y de la guirnalda del alero, la de la estrella y **la del cursor**, que es una linterna que proyecta sombras en tiempo real.
- **Atmósfera:** niebla de profundidad, terreno nevado con relieve, estrellas, humo de la chimenea y nieve 3D en dos capas (la cercana se aparta del cursor). Las luces tienen halos y se usa *tone mapping* cinematográfico.
- **Cámara:** al mover el ratón la cámara se desplaza en 3D (parallax real). Al cargar, entra con un travelling.
- **Postprocesado:** las luces (bombillas, estrella, ventana) brillan con *bloom* (`UnrealBloomPass`) y los bordes se suavizan con antialiasing MSAA (o FXAA si el navegador no tiene WebGL2).
- **Rendimiento:**
  - solo proyectan sombra las piezas que se notan;
  - la física de los regalos no lanza rayos contra el suelo (su altura se calcula con `groundAt()`) y cada regalo solo comprueba los objetos que tiene cerca;
  - si el ordenador va lento, la calidad baja automáticamente (menos resolución y, si hace falta, sin postprocesado).

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Lienzo WebGL y capa de texto (titular, mensaje, sello, pie) |
| `style.css` | Maquetación de la capa de texto, animaciones de entrada |
| `main.js` | Escena 3D, texturas, animaciones, viento, animales e interacciones |
| `lib/three.min.js` | Three.js r128 |
| `lib/postprocessing/` | Postprocesado oficial de Three.js r128 (bloom, FXAA) |
| `lib/three-mesh-bvh.js` | three-mesh-bvh 0.5.23 (licencia MIT, `lib/three-mesh-bvh.LICENSE.txt`): acelera los rayos del cursor y de la física de los regalos |
| `fonts/` | Fraunces, Inter, Sacramento y Neonderthaw en `.woff2` (licencia SIL OFL) y Bestigia en `.ttf` (uso personal: ver licencia) |
| `sonido/` | Efectos de sonido en MP3 |
| `captura.png` | Captura del estado final (`index.html?captura`) |
| `version-svg/` | Versión anterior en SVG (copia de seguridad; se puede borrar) |

## Interacciones

### `mousemove`

`handlePosterMove()` guarda la posición del ratón. En cada fotograma, con esa posición:

- **Hover 3D por *raycasting*** (`updateHover()`): se lanza un rayo desde la cámara para saber qué objeto 3D hay bajo el cursor. Al entrar en un objeto se llama a su función `enter()` y al salir a su función `leave()`, que equivalen a `mouseenter` y `mouseleave` en 3D. Además aparece una etiqueta con su nombre.
- **Cámara 3D** que sigue al ratón (`updateCamera()`).
- **Linterna del cursor:** ilumina y mueve las sombras (`updateLightsFx()`).
- **Viento:** al mover el ratón deprisa, sopla (`updateWind()`).
- **Miradas:** las cabezas de todos los animales giran hacia el cursor (`updateHeads()`).
- **Hierba seca:** se aparta del cursor.
- **Copos de nieve:** se calculan en la tarjeta gráfica (sin coste para el procesador). Tienen tamaños variados; los grandes son cristales de seis puntas que giran, los pequeños bolitas suaves. Se desvanecen a lo lejos y los cercanos se apartan del cursor (`makeSnowLayer`, `updateSnow`).
- **Titular:** las letras se apartan del cursor (`updateLetters()`).
- **Botón de donar:** es magnético (`updateCta()`).

### Reacciones de cada objeto 3D (`REACTIONS`)

| Objeto | Al pasar el ratón |
|---|---|
| Pinos | Se sacuden y cae su nieve |
| Ciervo | Deja de pasear, levanta la cabeza, mueve orejas y rabo, corazones |
| Zorro | Se detiene, te mira y dice "¡yip!" |
| Chimenea | Tiembla y suelta una gran bocanada de humo |
| Nieve del tejado | Una placa resbala acelerando por la pendiente, sale por el alero, cae dando vueltas y deja un montón de nieve en el suelo (se queda; los más viejos se funden). En el tejado vuelve a cuajar poco a poco |
| Alero | Las luces se persiguen y los carámbanos gotean |
| Casita de pájaros | Se balancea y se asoma un pajarito |
| Arrendajo | Sube el tejado a saltitos y grazna |
| Ventana | Se enciende la lámpara y el osito saluda |
| Corona | Se balancea y suenan las campanillas |
| Rastrillo y pala | Se tambalea y vibra / se levanta y se clava en la nieve |
| Maceta boca abajo | Se levanta y aparece un ratoncito |
| Caja de música | Se abre, gira una estrella y suenan notas |
| Semillas de ilusión | El saquito se inclina, caen semillas y brota una planta |
| Macetas | Tintinean |
| Regadera | Se inclina y riega el acebo |
| Acebo y carbonero | Las hojas se agitan / el pájaro salta y picotea |
| Regalo grande | Se abre la tapa y sale una estrella con muelle |
| Regalo pequeño | La tapa sale volando y estalla el confeti |
| Ardilla | Cambia la bellota por un regalo |
| Árbol / estrella | Las luces se persiguen y las bolas se mecen / la estrella gira y lanza destellos |
| Cardenal | Vuela en círculo alrededor del árbol |
| Conejo, gorrión, petirrojo | Salta / echa a volar y vuelve / avanza a saltitos y canta |
| Saco de ilusión | Se sacude y asoman los regalos (clic: ¡salen disparados!) |
| Regalos caídos | Se abren, muestran lo que llevan dentro y dan un salto |
| Juguetes del árbol | Osito, muñeca, robot, avión, camión, helicóptero, coche y patín (todos con lazo): saltan y las hélices giran deprisa |
| Regalos del árbol | Se abre la tapa y sale una palabra |
| Montón de nieve | Se sacude y suelta nieve en polvo |
| Papá Noel | "¡Jo, jo, jo!" y una lluvia de destellos dorados |

### `mouseenter` / `mouseleave` del DOM

Los elementos HTML usan `addEventListener('mouseenter' | 'mouseleave')`:

- **Las cuatro palabras clave:** cada una tiene un efecto propio (`WORD_FX`).
- **La fecha "21":** gira en 3D.
- **El logo:** el barco se mece.
- **El sello:** se estampa.
- **El sello "10 €":** gira más rápido.
- **El botón de donar:** cambia de texto y de color.

### `click`

- **Clic en cualquier superficie 3D** (suelo, tejado, banco…): cae un regalo con física sencilla (gravedad, rebote y giro) que se posa justo en ese punto.
- **Clic en el saco:** salen disparados cinco regalos.

## Viento y vida propia

- **Viento:** combina ráfagas naturales y el movimiento del ratón. Mece el árbol, los pinos, las bolas (que además tienen su propia física de péndulo), las bombillas, la casita, la corona, el acebo y la hierba. Arrastra el humo y la nieve, y en las ráfagas fuertes arranca hojas y nieve del tejado.
- **Animales:**
  - el ciervo pasea moviendo las patas, pasta y mira alrededor;
  - un zorro cruza el bosque trotando y desaparece detrás de la caseta;
  - el conejo y los pájaros dan saltitos y picotean;
  - la ardilla mordisquea su bellota;
  - todos parpadean y respiran;
  - una bandada cruza el cielo de vez en cuando batiendo las alas (con algún planeo);
  - los pájaros abren las alas cuando vuelan o se estiran, y las pliegan al posarse.
- **Papá Noel:** cada 40–55 s cruza el cielo entre las estrellas en un trineo dorado y rojo con farolillo, dejando una estela de polvo dorado. Lleva gafas doradas y ribete de piel blanca, sujeta las riendas con una mano y cada pocos segundos (o al pasarle el cursor) saluda con la otra. Tiran del trineo seis renos robustos que galopan en el aire como en los cuadros (se estiran y se recogen), con collares de cascabeles, mantas verdes con ribete dorado, y el reno guía tiene la nariz roja que brilla.
- **Decoración del árbol:** cinta de raso roja en espiral con lazos, cadenetas de cuentas doradas, un lazo grande bajo la estrella, lucecitas blancas que titilan y unas 35 bolas de tamaños y acabados distintos (brillantes, satinadas, con purpurina y en forma de lágrima). Cada bola cuelga de un hilo y es un péndulo: se balancea con el viento, el cursor la empuja al pasar por encima y todas se menean al tocar el árbol (`updateOrnaments`).
- **Luces navideñas:** las del árbol y las del alero son rojas, verdes, doradas y azules.
- **Titular de neón:** "Ningún Niño" en neón blanco y "Sin Regalo" en neón rojo con la fuente *Bestigia* (`fonts/bestigia-regular.ttf`). Va en un mismo bloque con la frase "Dentro de cada regalo hay una sonrisa", alineados a la izquierda. Cada letra parpadea suavemente a su ritmo, sin llegar a apagarse. **Licencia:** Bestigia es de uso personal; para usarla en una campaña (aunque sea solidaria) hay que comprar la licencia en ronnystudio.com o pedir permiso al autor.
- **Nieve que se acumula:** con el paso del tiempo la nieve va cubriendo las ramas de los pinos y del árbol de Navidad, primero lo que mira hacia arriba y en manchas irregulares (`addSnowCover`).
- **Noche:** cielo de noche cerrada y niebla azul oscura. La luz principal es la de la aurora (verde desde el fondo, con relleno magenta) y es la que proyecta las sombras; la ventana, las bombillas del árbol y la guirnalda del alero iluminan con luz cálida y de colores lo que tienen alrededor.
- **Casa decorada:** guirnalda de pino en ondas a lo largo del alero con grandes lazos rojos y bolas brillantes colgando, guirnaldas con luces de colores por los bordes del tejado y una corona con lazo en la pared lateral.
- **Puerta lateral:** puerta de roble con tablas verticales, ventana con vidriera de colores (flores y rombo azul) tras una reja de forja con volutas, dos filas de clavos negros, tirador de barra y cerradura. La ventana es un cristal normal (refleja, no da luz). Está entreabierta: por la rendija sale la luz cálida del interior, que tiembla un poco y se derrama sobre la nieve; al pasar el cursor se abre más.
- **Farolillos:** cinco faroles de metal negro (base escalonada, cristales con cruces en X, puertecita con bisagras, tejadillo con chimenea, bola y aro) con una vela blanca, repartidos por el suelo (junto al conejo, por donde pasea el ciervo, delante de la casa y a los lados). La llama parpadea y deja un charco de luz cálida en la nieve; al pasar el cursor se avivan.
- **Nido en el tejado:** nido grande de palos como los de las cigüeñas (base estrecha que se abre hacia arriba, palos entrecruzados y ramas que sobresalen, con nieve en el borde) en la punta izquierda de la cumbrera, lejos de la chimenea. Dentro hay tres polluelos que de vez en cuando estiran el cuello y abren el pico. En el tejado viven dos pájaros de colores distintos, un arrendajo azul y un cardenal rojo: al tocar cualquiera de los dos (o el nido) vuelan uno detrás del otro, se posan encima del nido junto a los polluelos mirándolos, les dan de comer y vuelven cada uno a su sitio. Su altura en cada momento sale de un rayo contra el tejado real (nieve, tejas, placa de nieve, nido), así que no atraviesan nada (`birdVisitNest`).
- **Botón 10 €:** escarapela con disco azul noche y doble filete dorado, texto girando en dorado, centro rojo con costura y cintas colgando. Solo sombras, sin brillos.
- **Linterna del cursor:** más suave y más alta, para que ilumine sin deslumbrar la nieve.
- **Estrella del árbol:** estrella de alambre dorado de 12 puntas en dos planos cruzados, con lucecitas que titilan, sobre una espiral dorada que la sujeta a la punta.
- **Aurora sin deslumbrar:** cada cortina tiene un tope de intensidad, así que aunque se solapen (o pasen detrás de la estrella) nunca llegan a deslumbrar ni disparan el brillo.
- **Luciérnagas:** unas 300 luces verdes amarillas revolotean entre los pinos del fondo y en el claro de delante, y se encienden y apagan a destellos, cada una a su ritmo (todo en la tarjeta gráfica).
- **Huellas:** el ciervo (pezuñas partidas), el zorro (almohadillas), el conejo (dos huellas largas delante y dos manos detrás) y los pájaros (tridentes, por parejas al saltar) dejan su rastro en la nieve, que se va cubriendo y desaparece al cabo de unos 45 s (`updateFootprints`).
- **Pueblo en la montaña:** dos grupos de casitas diminutas con las ventanas encendidas, un campanario y las farolas del camino en la ladera de la cordillera cercana. Están pintados (sin luces reales ni niebla), así que no iluminan ni cambian nada de la escena principal.
- **Física de los regalos:** avanzan en subpasos (como mucho 10 cm de golpe), así que no atraviesan el tejado, el banco ni las paredes; el ciervo, el zorro, el conejo, los coches y el robot los apartan al pasar; al caer en la nieve se hunden un poco y levantan nieve. Con 84 regalos lanzados sobre la casa, el banco y el árbol, ninguno queda dentro de la casa ni bajo el suelo.
- **Rendimiento:** todas las mallas grandes tienen un árbol de cajas (BVH), así que el rayo del cursor y los de los regalos solo prueban los triángulos cercanos (el cursor pasó de unos 7,6 ms a menos de 1 ms por movimiento).
- **Montañas:** dos cordilleras en silueta con las cumbres nevadas, recortadas contra la aurora.
- **Sonido:** no hay botón: el navegador no deja sonar nada hasta que la persona interactúa, así que el primer clic o tecla en el cartel activa el sonido. Sonidos en `sonido/`: ciervo, arrendajo (`mordecai.mp3`), coche, helicóptero y robot; los de los juguetes suenan también cuando cobran vida y se cortan en seco cuando "llega Andy".
- **Auroras boreales:** tres cortinas de luz al fondo del cielo (verde abajo, rosa y magenta arriba) con rayos verticales que se desplazan y pliegues que ondulan (`ShaderMaterial` propio).
- **Conejo:** patas articuladas; al saltar estira las patas traseras hacia atrás, recoge las manos y aterriza con ellas por delante.
- **Juguetes con vida propia (como en *Toy Story*):** mientras nadie mira, el coche y el camión dan vueltas solos, el avión y el helicóptero vuelan, el robot camina, la muñeca pasea y el osito se balancea. Si el cursor se acerca ("¡que viene Andy!"), se quedan quietos al instante: lo que vuela cae al suelo, la muñeca se desploma de espaldas y el osito se ladea. Al alejar el cursor, vuelven a la vida.

## Cómo ejecutarlo

Abre `index.html` en un navegador moderno con WebGL (doble clic basta). Todo va incluido en la carpeta (Three.js, postprocesado y fuentes), así que no hace falta instalar nada ni tener conexión.

- **Captura del estado final:** abre `index.html?captura`.

> La escena está modelada desde cero para este cartel. El logotipo de la Fundación ITACA y el sello "Juguete Solidario" son marcas provisionales y se pueden sustituir por los oficiales.
