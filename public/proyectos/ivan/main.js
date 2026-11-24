/* =========================================================
   Ningún niño sin regalo · Fundación ITACA · 21 de diciembre
   Todo el contenido es visible en estado estático; las
   interacciones solo decoran o añaden detalles secundarios.
   ========================================================= */

const POSTER_W = 848;
const POSTER_H = 1200;
const CITY_TOP = 775;
const CITY_H = 130;
const COLORS = ["#e63946", "#ffcf5c", "#2a9d8f", "#8ecae6", "#f4a261"];

const poster = document.getElementById("poster");
const gifts = document.querySelectorAll(".gift");
const counter = document.getElementById("counter");
const glow = document.getElementById("glow");
const cta = document.getElementById("cta");
const parallaxLayers = document.querySelectorAll(".parallax");
const canvas = document.getElementById("snow");
const ctx = canvas.getContext("2d");

let scale = 1;
let opened = 0;
const mouse = { x: -9999, y: -9999 };
let chars = [];
let windows = [];

/* ---------- Utilidades ---------- */
function fitPoster() {
  scale = Math.min(window.innerWidth / POSTER_W, window.innerHeight / POSTER_H, 1);
  poster.style.transform = `scale(${scale})`;
}

/* Coordenadas de pantalla → coordenadas del cartel (848×1200) */
function toPosterCoords(event) {
  const rect = poster.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale,
  };
}

/* ---------- Construcción de elementos decorativos ---------- */

/* Divide el titular en letras para animarlas individualmente */
function splitHeadline() {
  document.querySelectorAll("[data-split]").forEach((line) => {
    const text = line.textContent;
    line.textContent = "";
    for (const letter of text) {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = letter === " " ? " " : letter;
      line.appendChild(span);
    }
  });
  chars = Array.from(document.querySelectorAll(".char"));
}

/* Coloca las bombillas a lo largo de la curva de la guirnalda */
function buildGarland() {
  const path = document.getElementById("garlandPath");
  const container = document.getElementById("bulbs");
  const total = path.getTotalLength();
  const count = 17;

  for (let i = 1; i < count; i++) {
    const point = path.getPointAtLength((total / count) * i);
    const bulb = document.createElement("div");
    bulb.className = "bulb";
    bulb.style.left = `${point.x}px`;
    bulb.style.top = `${point.y - 2}px`;
    bulb.style.setProperty("--c", COLORS[i % COLORS.length]);
    bulb.innerHTML = '<span class="bulb__glass"></span>';
    bulb.addEventListener("mouseenter", () => lightBulb(bulb));
    bulb.addEventListener("mouseleave", () => dimBulb(bulb));
    container.appendChild(bulb);
  }
}

/* Genera el skyline de la ciudad con ventanas */
function buildCity() {
  const city = document.getElementById("city");
  let x = -10;
  while (x < POSTER_W) {
    const w = 40 + Math.random() * 50;
    const h = 40 + Math.random() * 85;
    const b = document.createElement("div");
    b.className = "building";
    b.style.cssText = `left:${x}px;width:${w}px;height:${h}px`;

    for (let wy = 12; wy < h - 10; wy += 16) {
      for (let wx = 8; wx < w - 8; wx += 12) {
        const win = document.createElement("span");
        win.className = "window";
        win.style.cssText = `left:${wx}px;top:${wy}px`;
        if (Math.random() < 0.25) win.classList.add("on");
        b.appendChild(win);
        windows.push({ el: win, x: x + wx, y: CITY_TOP + (CITY_H - h) + wy });
      }
    }
    city.appendChild(b);
    x += w + 4;
  }
}

/* ---------- Interacción 1 · mouseenter ---------- */
function openGift(gift) {
  const color = gift.dataset.color;
  gift.style.transform = "translateY(-8px) scale(1.05)";
  gift.querySelector(".gift__lid").style.transform = "translate(-14px, -26px) rotate(-30deg)";
  gift.querySelector(".gift__box").style.boxShadow =
    `0 0 46px 8px ${color}99, inset 0 -12px 0 rgba(0,0,0,.15)`;

  const msg = gift.querySelector(".gift__msg");
  msg.textContent = gift.dataset.msg;
  msg.style.opacity = "1";
  msg.style.transform = "translate(-50%, -20px)";

  const rect = gift.getBoundingClientRect();
  burst((rect.left + rect.width / 2 - poster.getBoundingClientRect().left) / scale,
        (rect.top - poster.getBoundingClientRect().top) / scale + 10, 14);

  if (!gift.dataset.opened) {
    gift.dataset.opened = "true";
    opened++;
    counter.textContent = opened;
    counter.animate(
      [{ transform: "scale(1.6)", color: "#ffffff" }, { transform: "scale(1)" }],
      { duration: 450, easing: "ease-out" }
    );
  }
}

function lightBulb(bulb) {
  const glass = bulb.querySelector(".bulb__glass");
  glass.style.opacity = "1";
  glass.style.boxShadow = "0 0 22px 8px var(--c)";
  glass.style.filter = "brightness(1.3)";
  bulb.style.transform = `rotate(${Math.random() < 0.5 ? -24 : 24}deg)`;
}

function hoverCta() {
  cta.style.transform = "translateY(-4px) rotate(-2deg) scale(1.05)";
  cta.style.backgroundColor = "#ffcf5c";
  cta.style.color = "#0a1430";
  cta.style.boxShadow = "0 10px 0 #b8902f";
}

/* ---------- Interacción 2 · mouseleave ---------- */
function closeGift(gift) {
  gift.style.transform = "";
  gift.querySelector(".gift__lid").style.transform = "";
  gift.querySelector(".gift__box").style.boxShadow = "";
  const msg = gift.querySelector(".gift__msg");
  msg.style.opacity = "0";
  msg.style.transform = "translate(-50%, 20px)";
}

function dimBulb(bulb) {
  const glass = bulb.querySelector(".bulb__glass");
  glass.style.opacity = "";
  glass.style.boxShadow = "";
  glass.style.filter = "";
  bulb.style.transform = "";
}

function leaveCta() {
  cta.style.transform = "";
  cta.style.backgroundColor = "";
  cta.style.color = "";
  cta.style.boxShadow = "";
}

/* ---------- Interacción 3 · mousemove ---------- */
function handleMouseMove(event) {
  const p = toPosterCoords(event);
  mouse.x = p.x;
  mouse.y = p.y;

  // Luz cálida que sigue al cursor
  glow.style.opacity = "1";
  glow.style.transform = `translate(${p.x}px, ${p.y}px)`;

  // Parallax por capas según data-depth
  const nx = p.x / POSTER_W - 0.5;
  const ny = p.y / POSTER_H - 0.5;
  parallaxLayers.forEach((layer) => {
    const depth = Number(layer.dataset.depth);
    layer.style.transform = `translate(${nx * depth}px, ${ny * depth}px)`;
  });

  reactHeadline(p);
  lightWindows(p);
}

/* Las letras cercanas al cursor saltan y se iluminan */
function reactHeadline(p) {
  const posterRect = poster.getBoundingClientRect();
  chars.forEach((c) => {
    const r = c.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - posterRect.left) / scale;
    const cy = (r.top + r.height / 2 - posterRect.top) / scale;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    const force = Math.max(0, 1 - dist / 120);
    c.style.transform = `translateY(${-force * 10}px) rotate(${(p.x - cx) * force * -0.08}deg)`;
    c.style.color = force > 0.5 ? "#ffcf5c" : "";
  });
}

/* Las ventanas de la ciudad se encienden al pasar cerca */
function lightWindows(p) {
  if (p.y < CITY_TOP || p.y > CITY_TOP + CITY_H) return;
  windows.forEach((w) => {
    if (Math.hypot(p.x - w.x, p.y - w.y) < 50) w.el.classList.add("on");
  });
}

function resetMouse() {
  glow.style.opacity = "0";
  mouse.x = mouse.y = -9999;
  chars.forEach((c) => { c.style.transform = ""; c.style.color = ""; });
}

/* ---------- Extra · click: explosión de chispas ---------- */
function burst(x, y, amount = 22) {
  for (let i = 0; i < amount; i++) {
    const s = document.createElement("span");
    s.className = "spark";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = COLORS[i % COLORS.length];
    poster.appendChild(s);

    const angle = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 90;
    s.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * d}px, ${Math.sin(angle) * d + 40}px) scale(0)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.4,1)" }
    ).onfinish = () => s.remove();
  }
}

/* ---------- Nieve en canvas (se aparta del cursor) ---------- */
const flakes = Array.from({ length: 180 }, () => ({
  x: Math.random() * POSTER_W,
  y: Math.random() * POSTER_H,
  r: Math.random() * 2.2 + 0.5,
  vy: Math.random() * 0.7 + 0.25,
  drift: Math.random() * Math.PI * 2,
  ox: 0,
  oy: 0,
}));

function drawSnow() {
  ctx.clearRect(0, 0, POSTER_W, POSTER_H);
  for (const f of flakes) {
    f.y += f.vy;
    f.drift += 0.01;
    f.x += Math.sin(f.drift) * 0.3;
    if (f.y > POSTER_H + 5) { f.y = -5; f.x = Math.random() * POSTER_W; }

    const dx = f.x + f.ox - mouse.x;
    const dy = f.y + f.oy - mouse.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 110 && dist > 0) {
      const force = (110 - dist) / 110;
      f.ox += (dx / dist) * force * 6;
      f.oy += (dy / dist) * force * 6;
    }
    f.ox *= 0.92;
    f.oy *= 0.92;

    ctx.globalAlpha = 0.4 + f.r / 4;
    ctx.fillStyle = "#fff6e5";
    ctx.beginPath();
    ctx.arc(f.x + f.ox, f.y + f.oy, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(drawSnow);
}

/* ---------- Registro de eventos ---------- */
function init() {
  splitHeadline();
  buildGarland();
  buildCity();

  gifts.forEach((gift) => {
    gift.style.setProperty("--c", gift.dataset.color);
    gift.addEventListener("mouseenter", () => openGift(gift));
    gift.addEventListener("mouseleave", () => closeGift(gift));
  });

  cta.addEventListener("mouseenter", hoverCta);
  cta.addEventListener("mouseleave", leaveCta);
  cta.addEventListener("click", (e) => e.preventDefault());

  poster.addEventListener("mousemove", handleMouseMove);
  poster.addEventListener("mouseleave", resetMouse);
  poster.addEventListener("click", (e) => {
    const p = toPosterCoords(e);
    burst(p.x, p.y);
  });

  window.addEventListener("resize", fitPoster);
  fitPoster();
  drawSnow();
}

init();
