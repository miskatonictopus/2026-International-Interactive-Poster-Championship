
## Concepto

Cartel digital (848 × 1200 px, proporción A3) para la campaña del **21 de diciembre** de Fundación ITACA: recoger donativos para comprar regalos de Navidad a niños y niñas en riesgo de exclusión social.

La idea es que **el usuario descubra lo que piden los niños**. En una noche de invierno, seis regalos cerrados esperan en una repisa. Al pasar el cursor por encima, cada regalo se abre, se ilumina y muestra un deseo escrito a mano ("Un cuento", "Una bici"…). Un indicador bajo el mensaje se va encendiendo con el color de cada regalo descubierto ("3 de 6 deseos descubiertos"). Cuando se han descubierto todos, el cartel pasa a su **estado final**: todos los deseos quedan visibles, aparece "¡Todos descubiertos! Ahora, hazlos realidad." y el botón *Dona desde 5 €* empieza a latir. El mensaje es que detrás de cada donativo hay una ilusión concreta.

El cursor funciona como una **luz cálida** en la noche: ilumina la zona por la que pasa, aparta la nieve y hace que las letras de "Ningún niño sin regalo" se eleven y cambien de color.

## Estructura

```
index.html   → maquetación del cartel
style.css    → estilos, transiciones y estado final (.is-complete)
main.js      → toda la lógica de interacción
captura.png  → captura del estado final
```

No usa librerías externas, solo HTML, CSS y JavaScript. Las tipografías (Fraunces, DM Sans y Caveat) se cargan desde Google Fonts y tienen fuentes de respaldo.

## Eventos de JavaScript utilizados

Todos los eventos se registran con `addEventListener()` en la función `registrarEventos()` de `main.js`.

| Evento | Elemento | Función |
|---|---|---|
| `mouseenter` | cada `.gift` | `abrirRegalo()` |
| `mouseleave` | cada `.gift` | `cerrarRegalo()` |
| `mousemove` | `#poster` | `manejarMovimiento()` |
| `mouseenter` / `mouseleave` | `#poster` | `entrarEnCartel()` / `salirDelCartel()` |
| `mouseenter` / `mousemove` / `mouseleave` | `#cta` (botón) | `activarBoton()` / `atraerBoton()` / `soltarBoton()` |
| `focus` / `blur` | cada `.gift` | los regalos también se abren con el teclado (Tab) |
| `keydown` | `document` | `F` = estado final, `R` = reiniciar |
| `resize` | `window` | `escalarCartel()` |

## Las tres interacciones

### 1 · `mouseenter`: el regalo se abre
Cuando el cursor entra en un regalo, `abrirRegalo()` cambia por JavaScript varias propiedades visuales:
- `transform` del regalo: sube, crece y se inclina (`translateY`, `scale`, `rotate`).
- `transform` de la tapa: salta y gira, como si se abriera.
- `filter` de la caja: más brillo y saturación.
- `opacity` de la luz interior y de la etiqueta con el deseo.

Además, `lanzarDestellos()` crea chispas con `createElement` que se eliminan al acabar su animación, y `registrarIlusion()` recuerda qué regalos se han abierto. `actualizarProgreso()` enciende la marca de ese regalo con su color (`backgroundColor`, `boxShadow`, `transform`) y cambia el texto del indicador. Al descubrir los seis regalos, `completarCampana()` añade la clase `.is-complete` al cartel.

### 2 · `mouseleave`: el regalo se cierra
`cerrarRegalo()` vacía los estilos en línea que se habían aplicado. Las transiciones CSS (con una curva con rebote) hacen que la tapa vuelva a caer y el regalo baje suavemente. Si la campaña ya está completa, el regalo vuelve a su estado final y su deseo sigue visible.

### 3 · `mousemove`: profundidad, luz, letras y nieve
`manejarMovimiento()` convierte las coordenadas del ratón a coordenadas del cartel con `coordenadasEnCartel()`, que tiene en cuenta el escalado. Esas coordenadas se aplican en un bucle `requestAnimationFrame` con interpolación para que el movimiento sea suave:
- **Profundidad:** el "21" se inclina en 3D (`rotateX` / `rotateY`), su contorno se desplaza en sentido contrario y las dos capas de estrellas se mueven a distinta velocidad (*parallax*). La estrella y el sello giran según la posición horizontal.
- **Luz:** un halo cálido sigue al cursor.
- **Titular:** cada letra de "Ningún niño sin regalo." está en su propio `<span>`. Las letras cercanas al cursor suben y cambian de color (`transform` + `color`) según la distancia. La posición de cada letra se mide una vez con `posicionEnCartel()`, que suma los `offsetLeft`/`offsetTop` hasta el cartel (así no le afecta el escalado).
- **Nieve:** en un `<canvas>`, los copos se apartan del cursor y la velocidad horizontal del ratón genera viento. La velocidad se ajusta al tiempo real entre fotogramas, así cae igual en pantallas de 60 Hz y de 120 Hz.

Extra: el botón *Dona desde 5 €* es "magnético": con `mousemove`, `atraerBoton()` calcula la distancia del cursor al centro del botón y lo desplaza hacia él (el texto un poco más, para dar profundidad). Con `mouseleave` vuelve a su sitio con un rebote.

## Escalado

`escalarCartel()` calcula la escala para que el cartel quepa en la ventana y la aplica con la variable CSS `--scale`. Así se mantienen la composición y las proporciones en cualquier pantalla.

## Cómo verlo

Abre `index.html` en el navegador. Para ver directamente el **estado final** (el de la captura), abre `index.html?final` o pulsa la tecla **F**. La tecla **R** reinicia el cartel.

## Branding

El cartel incluye el logo oficial de ITACA (`Images/logo_Itaca.webp`, en blanco sobre fondo transparente), un sello de campaña ("Navidad Solidaria · 2026") y el hashtag `#NingúnNiñoSinRegalo`.
