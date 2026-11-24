# Ningún niño sin regalo · Cartel interactivo

Actividad 0612 · *The Interactive Poster* · Fundación ITACA L'Hospitalet

## Concepto

Cartel digital (848 × 1200 px, proporción A3) para la campaña del **21 de diciembre** de la Fundación ITACA: recaudar donativos para comprar regalos de Navidad a niños y niñas en riesgo de exclusión.

Es una noche de invierno sobre la silueta de L'Hospitalet: guirnalda de luces, luna, nieve y cuatro regalos con el nombre de un niño o niña. **Todo el contenido importante (fecha, tema, mensaje, datos, llamada a la acción y logos) está visible en el estado estático.** La interacción solo decora o añade detalles secundarios, como qué hay dentro de cada regalo.

## Estructura

```
index.html   → maquetación del cartel
style.css    → estilos, composición y transiciones
main.js      → eventos e interacciones
```

Abre `index.html` en el navegador. Si la ventana es más pequeña que el cartel, este se escala proporcionalmente con `transform: scale()`.

## Eventos utilizados (todos con `addEventListener()`)

| Evento       | Elemento                    | Efecto |
|--------------|-----------------------------|--------|
| `mouseenter` | regalos, bombillas, botón   | Abrir regalo, encender bombilla, destacar botón |
| `mouseleave` | regalos, bombillas, botón, cartel | Volver al estado inicial |
| `mousemove`  | cartel                      | Luz, parallax, letras, ventanas y nieve |
| `click`      | cartel                      | Explosión de chispas de colores |
| `resize`     | `window`                    | Reescalar el cartel |

## Las tres interacciones

### 1 · `mouseenter`
- **Regalos** (`openGift`): la tapa salta y gira (`transform`), la caja brilla con su color (`box-shadow`) y aparece lo que contiene (`opacity`, `textContent`). Salen chispas y el contador "regalos que has abierto" sube.
- **Bombillas** (`lightBulb`): se encienden (`opacity`, `box-shadow`, `filter`) y se balancean (`transform`).
- **Botón "Dona ahora"** (`hoverCta`): cambia `backgroundColor`, `color`, `transform` y `boxShadow`.

### 2 · `mouseleave`
`closeGift`, `dimBulb` y `leaveCta` restauran las propiedades modificadas. Las transiciones CSS hacen que la salida sea suave, con rebote. Al salir del cartel, `resetMouse` apaga la luz y recoloca las letras.

### 3 · `mousemove`
`handleMouseMove` pasa las coordenadas del ratón a coordenadas del cartel y:
- Mueve una **luz cálida** que sigue al cursor.
- Aplica **parallax** a estrellas, luna y la fecha "21" según `data-depth`.
- Hace que las **letras del titular** cercanas al cursor salten y se vuelvan doradas (`reactHeadline`).
- **Enciende ventanas** de la ciudad al pasar cerca (`lightWindows`).
- Aparta los **copos de nieve** del `<canvas>` (`drawSnow`).

## Funciones propias

`fitPoster`, `toPosterCoords`, `splitHeadline`, `buildGarland`, `buildCity`, `openGift`, `closeGift`, `lightBulb`, `dimBulb`, `hoverCta`, `leaveCta`, `handleMouseMove`, `reactHeadline`, `lightWindows`, `resetMouse`, `burst`, `drawSnow`, `init`.

## Captura

Para la captura final, el cartel puede estar en reposo, porque ya contiene todo el mensaje. También puedes pasar antes el ratón por los regalos y la ciudad para que se vea el contador en 4 y más ventanas encendidas.
