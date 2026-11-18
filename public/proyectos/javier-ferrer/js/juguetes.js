// Cuando el caramelo llena el TRIGGER (20 %) del cartel, las imágenes caen
// desde arriba y rebotan hasta su posición final. Cada una tiene su retraso.
(() => {
  const DROPS = [
    { id: 'juguetes', delay: 0 },
    { id: 'sin', delay: 500 }, // 0,5 s después de "juguetes"
    { id: 'peque', delay: 1000 }, // 0,5 s después de "sin"
    { id: 'ningun', delay: 1500 } // 0,5 s después de "peque"
  ]
    .map(d => ({ ...d, img: document.getElementById(d.id), animation: null }))
    .filter(d => d.img);
  if (!DROPS.length) return;

  const TRIGGER = 0.2; // fracción de llenado que dispara la caída
  const DURATION = 1600; // ms de toda la caída con los rebotes

  // Las curvas imitan la gravedad: acelera al caer (ease-in) y frena al subir (ease-out).
  const FALL = 'cubic-bezier(0.55, 0, 1, 0.45)';
  const RISE = 'cubic-bezier(0, 0.55, 0.45, 1)';

  let dropped = false;

  function drop(d) {
    const { img } = d;
    // Distancia desde fuera del cartel (por encima) hasta la posición final.
    const start = -(img.offsetTop + img.offsetHeight + 40);
    // Alturas de rebote relativas a la caída (cada una más baja que la anterior).
    const b1 = start * 0.16, b2 = start * 0.05, b3 = start * 0.012;
    // La rotación final la marca la variable CSS --rot de cada imagen.
    // Si hay --rot-from, la caída empieza con ese ángulo (si no, --rot − 6°).
    const style = getComputedStyle(img);
    const rot = style.getPropertyValue('--rot').trim() || '0deg';
    const rotFrom = style.getPropertyValue('--rot-from').trim() || `calc(${rot} - 6deg)`;
    const r = deg => `rotate(calc(${rot} + ${deg}deg))`;
    d.animation = img.animate([
      { transform: `translateY(${start}px) rotate(${rotFrom}) scale(1, 1)`, offset: 0, easing: FALL },
      { transform: `translateY(0) ${r(1.5)} scale(1.03, 0.96)`, offset: 0.46, easing: RISE },
      { transform: `translateY(${b1}px) ${r(-1.5)} scale(1, 1)`, offset: 0.64, easing: FALL },
      { transform: `translateY(0) ${r(0.6)} scale(1.015, 0.985)`, offset: 0.80, easing: RISE },
      { transform: `translateY(${b2}px) ${r(-0.4)} scale(1, 1)`, offset: 0.89, easing: FALL },
      { transform: `translateY(0) ${r(0)} scale(1, 1)`, offset: 0.96, easing: RISE },
      { transform: `translateY(${b3}px) ${r(0)} scale(1, 1)`, offset: 0.98, easing: FALL },
      { transform: `translateY(0) ${r(0)} scale(1, 1)`, offset: 1 }
    ], { duration: DURATION, delay: d.delay, fill: 'both' });
    // Visible desde el inicio: con fill 'both' espera fuera del cartel durante el retraso.
    img.style.visibility = 'visible';
  }

  window.addEventListener('caramelo:progress', event => {
    if (dropped || event.detail.progress < TRIGGER) return;
    dropped = true;
    DROPS.forEach(drop);
    // Cuando todas han terminado de caer, avisa (lo usa el osito 3D).
    Promise.all(DROPS.map(d => d.animation.finished))
      .then(() => window.dispatchEvent(new CustomEvent('textos:done')))
      .catch(() => {}); // cancelada por un reset
  });

  // "Reset simulation" vuelve a esconder las imágenes para que caigan otra vez.
  window.addEventListener('caramelo:reset', () => {
    dropped = false;
    for (const d of DROPS) {
      d.animation?.cancel();
      d.animation = null;
      d.img.style.visibility = 'hidden';
    }
  });
})();
