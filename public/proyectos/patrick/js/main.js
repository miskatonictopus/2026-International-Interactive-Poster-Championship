import { createGiftRain } from './toys.js';

const poster = document.querySelector('.poster');
try {
  const rain = createGiftRain(poster);
  const enter = (event) => {
    rain.start();
    if (event) rain.updatePointer(event.clientX, event.clientY);
  };
  const leave = () => rain.reset();
  poster.addEventListener('mouseenter', enter);
  poster.addEventListener('mouseleave', leave);
  poster.addEventListener('mousemove', (event) => rain.updatePointer(event.clientX, event.clientY));
  window.addEventListener('blur', leave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) leave();
    else if (poster.matches(':hover')) enter();
  });
  if (poster.matches(':hover')) enter();
} catch (error) {
  console.error('No se pudo iniciar la lluvia de regalos:', error);
}
