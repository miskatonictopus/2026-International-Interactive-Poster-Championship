const cartel = document.getElementById('cartel');

const CARTEL_W = 848;
const CARTEL_H = 1200;

function fitCartel() {
  const scale = Math.min(
    window.innerWidth / CARTEL_W,
    window.innerHeight / CARTEL_H
  );
  cartel.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', fitCartel);
fitCartel();
