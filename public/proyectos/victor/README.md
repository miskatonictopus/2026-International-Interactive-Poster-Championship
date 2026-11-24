# Regala Ilusión

Cartel interactivo para la campaña de Navidad de la Fundación ITACA (L'Hospitalet de Llobregat).
Actividad 0612 de Desarrollo web en entorno cliente.

Para verlo solo hay que abrir `index.html` en el navegador.

## Concepto

Mi primera idea fue poner un regalo en el centro del cartel, pero quedaba muy parecido a los de otros compañeros, así que lo cambié.

Al final el título "REGALA ILUSIÓN" está hecho con bolas de Navidad colgadas de hilos, una bola por letra (13 en total). Las bolas se mueven como péndulos y el ratón funciona como si fuera una lámpara: según dónde esté, cambia el brillo de las bolas y hacia dónde caen las sombras en la pared.

Cada bola suena como una campanita cuando pasas el ratón por encima. Las notas están puestas para que, si las tocas en orden (REGALA y luego ILUSIÓN), suene el principio de "Noche de paz". Cuando has tocado las 13 bolas, la guirnalda toca la canción sola.

En la parte de abajo, en rojo, está la información: la fecha (21 de diciembre), la frase de la campaña, el texto sobre las donaciones y el botón COLABORA, que tiene forma de etiqueta de regalo y se da la vuelta al pulsarlo.

Colores: rojo #A52A2A, crema #F5EAD5, verde #234C3D, dorado #D6A84F y blanco.
Fuentes: Bodoni Moda (letras de las bolas y el 21) y Archivo (el resto de textos).

## Eventos de JavaScript

Los eventos están en la función `registrarEventos()` de `main.js` y todos usan `addEventListener()`:

- `mouseenter` en cada bola → `encenderAdorno()`
- `mouseleave` en cada bola → `apagarAdorno()`
- `mousemove` en el cartel → `moverRaton()`
- `mouseleave` en el cartel → `salirDelCartel()`, la luz vuelve a su sitio
- `click` en cada bola → `pulsarAdorno()`, la bola gira y salen destellos
- `click` en COLABORA → `pulsarColabora()`, la etiqueta se gira y pone "¡Gracias!"
- `focus` y `blur` en las bolas, para que funcione también con el teclado
- `touchmove` y `touchend`, para que funcione en el móvil
- `pointerdown` y `keydown` → `prepararAudio()`, porque el navegador no deja reproducir sonido hasta que el usuario hace clic o pulsa una tecla
- `resize` → `ajustarEscala()`, para que el cartel quepa en la ventana

También uso `requestAnimationFrame()` para la función `animar()`, que se ejecuta en cada fotograma y mueve las bolas, los brillos y las sombras.

## Las tres interacciones

**1. mouseenter (encender la bola)**

Cuando el ratón entra en una bola, `encenderAdorno()` le añade la clase `encendida`. Con esa clase la bola se hace un poco más grande (`transform: scale`), brilla más (`filter`) y le sale un halo dorado (`box-shadow`). La letra se pone blanca, la bola se pone por delante de las otras (`z-index`) y suena su nota. Además se marca como tocada y la anilla de arriba se queda dorada, así se ve cuántas llevas.

**2. mouseleave (volver al estado normal)**

Cuando el ratón sale de la bola, `apagarAdorno()` quita la clase `encendida` y el `z-index`. Como en el CSS hay transiciones, la bola vuelve a su tamaño y color normal poco a poco, con un pequeño rebote.

**3. mousemove (luz y viento)**

Cuando mueves el ratón por el cartel, `moverRaton()` calcula la posición del ratón dentro del cartel y hace dos cosas:

- Mueve la luz: hay un círculo de luz que sigue al ratón por la pared. En `animar()` calculo para cada bola hacia dónde está el ratón, muevo el brillo de la bola hacia ese lado (con las variables CSS `--hx` y `--hy`) y pongo la sombra al lado contrario.
- Hace viento: calculo la velocidad del ratón y, si pasa cerca de una bola o de su hilo, la empuja. Si lo mueves despacio casi no se mueve y si lo mueves rápido se balancea mucho. Las bolas con el hilo más largo se mueven más lento, como un péndulo de verdad.

Cuando el ratón sale del cartel la luz vuelve poco a poco a su posición inicial. Aunque nadie toque nada, las bolas se mueven un poco solas, como si hubiera una brisa.

## Archivos

- `index.html`: estructura del cartel
- `style.css`: estilos y animaciones
- `main.js`: toda la parte de JavaScript
- `assets/`: el icono y el logo de Planeta FP
