# Ningún niño sin regalo 🎄

## Concepto del cartel

**«Ningún niño sin regalo»** es un *Moving Poster* navideño e interactivo que busca sensibilizar sobre la importancia de que todos los niños puedan recibir un regalo en Navidad. El cartel combina un árbol de Navidad, regalos en 3D y animaciones que responden al movimiento del ratón.

El póster está diseñado en formato vertical de **848 × 1200 píxeles**. Se ha desarrollado con **HTML, CSS y JavaScript**, utilizando **Three.js** para los elementos 3D y **cannon-es** para simular la gravedad y las colisiones.

## Eventos de JavaScript y tres interacciones

| Evento | Interacción | Funcionamiento |
| --- | --- | --- |
| `mouseenter` | **Comienza la lluvia de regalos** | Al entrar el cursor en el cartel, aparecen regalos 3D desde la parte superior. Caen, giran, rebotan y se acumulan alrededor del árbol. |
| `mousemove` | **La estrella hace levitar los regalos** | Se sigue la posición del cursor para detectar cuándo está sobre la estrella del árbol. Mientras permanezca sobre ella, los regalos levitan; al apartarlo de la estrella sin salir del cartel, vuelven a caer por gravedad. |
| `mouseleave` | **Reinicio del cartel** | Al sacar el cursor del póster, se detiene la lluvia y se eliminan los regalos, devolviendo la escena a su estado inicial. |

La interacción se realiza **sin clics**. El título permanece visible durante toda la experiencia.

## Funcionamiento técnico

- **HTML y CSS:** estructura, composición vertical, tipografía, decoración navideña y footer.
- **JavaScript:** gestión de eventos y estados interactivos.
- **Three.js:** carga, representación y animación de los modelos 3D.
- **cannon-es:** gravedad, rebotes, colisiones y acumulación de los regalos.

## Ejecución

Abrir `index.html` desde un **servidor local estático** (por ejemplo, Live Server de VS Code), para garantizar que el navegador pueda cargar correctamente los módulos JavaScript y los modelos 3D. No se necesita un backend.
