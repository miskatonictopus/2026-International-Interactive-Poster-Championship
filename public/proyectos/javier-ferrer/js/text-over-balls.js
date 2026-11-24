// Texto blanco solo donde pasa por encima de las bolas.
//
// Los textos de #overlay siguen siendo HTML normal (negros, editables en DevTools).
// Encima hay un canvas 2D transparente donde, en cada fotograma:
//   1. se redibuja cada letra en blanco, en la posición exacta que tiene en el HTML
//      (la lee del propio DOM, así que respeta cualquier ajuste hecho a mano);
//   2. se recorta con la silueta de las bolas, que es el canal alfa del canvas 3D
//      (el fondo es transparente y las bolas opacas).
// Resultado: la parte de cada letra que cae sobre una bola se ve blanca, siguiendo
// el contorno de la bola, y el resto de la letra sigue negro.

const INVERT_COLOR = '#fff';

export function createTextOverBalls({ glCanvas, overlay, cartel, width, height }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'text-over-balls';
  canvas.setAttribute('aria-hidden', 'true');
  overlay.after(canvas);

  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  const range = document.createRange();

  // Recorre todos los nodos de texto visibles de la capa delantera
  function textNodes() {
    const walker = document.createTreeWalker(overlay, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function transform(text, mode) {
    if (mode === 'uppercase') return text.toUpperCase();
    if (mode === 'lowercase') return text.toLowerCase();
    return text;
  }

  return function draw() {
    const box = cartel.getBoundingClientRect();
    const scale = box.width / width; // el cartel está escalado con CSS (js/main.js)

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INVERT_COLOR;
    ctx.textBaseline = 'alphabetic';

    for (const node of textNodes()) {
      const style = getComputedStyle(node.parentElement);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ascent = ctx.measureText('H').fontBoundingBoxAscent;

      const text = node.data;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (!ch.trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        // La caja de una letra va de la parte alta de la fuente a la baja,
        // sin importar el line-height: la línea base está a "ascent" de su borde.
        const x = (rect.left - box.left) / scale;
        const y = (rect.top - box.top) / scale + ascent;
        ctx.fillText(transform(ch, style.textTransform), x, y);
      }
    }

    // Deja solo lo que cae sobre una bola
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(glCanvas, 0, 0, canvas.width, canvas.height);
  };
}
