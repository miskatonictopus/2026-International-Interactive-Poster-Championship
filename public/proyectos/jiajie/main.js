"use strict";

const poster = document.querySelector("#poster");
const gifts = [...document.querySelectorAll(".gift")];
const layers = [...document.querySelectorAll(".layer")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let idleTimer;
let frame = 0;
let lastTrailAt = 0;

function makeAmbientParticles() {
  const field = document.querySelector("#ambient-field");
  const count = 72;
  const lightColors = [
    ["#fff9ef", "#fff9ef88"],
    ["#ffd76a", "#ffd76a88"],
    ["#8de0c2", "#8de0c288"]
  ];
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${(i * 37 + 11) % 97}%`;
    particle.style.top = `${(i * 61 + 7) % 96}%`;
    particle.style.setProperty("--duration", `${6 + (i % 7)}s`);
    particle.style.setProperty("--delay", `${-(i % 9)}s`);
    particle.style.setProperty("--particle-size", `${1.5 + (i % 3) * 0.75}px`);
    particle.style.setProperty("--particle-color", lightColors[i % lightColors.length][0]);
    particle.style.setProperty("--particle-glow", lightColors[i % lightColors.length][1]);
    field.append(particle);
  }
}

function makeSnowfall() {
  const field = document.querySelector("#snowfall");
  if (!field) return;
  for (let i = 0; i < 18; i += 1) {
    const flake = document.createElement("span");
    const duration = 10 + Math.random() * 9;
    flake.className = "falling-snowflake";
    flake.textContent = "❄";
    flake.style.left = `${Math.random() * 100}%`;
    flake.style.setProperty("--snow-top", `${Math.random() * 100}%`);
    flake.style.setProperty("--snow-size", `${1.2 + Math.random() * 1.7}cqw`);
    flake.style.setProperty("--snow-duration", `${duration}s`);
    flake.style.setProperty("--snow-delay", `${-Math.random() * duration}s`);
    flake.style.setProperty("--snow-sway", `${Math.random() * 8 - 4}cqw`);
    field.append(flake);
  }
}

function settlePoster() {
  poster.classList.remove("is-active");
  poster.style.setProperty("--px", "0");
  poster.style.setProperty("--py", "0");
  poster.style.setProperty("--tilt-x", "0deg");
  poster.style.setProperty("--tilt-y", "0deg");
  layers.forEach((layer) => {
    layer.style.setProperty("--dx", "0px");
    layer.style.setProperty("--dy", "0px");
  });
}

function burstAt(x, y, color = "#ffd76a") {
  if (reducedMotion.matches) return;
  const bounds = poster.getBoundingClientRect();
  const originX = x - bounds.left;
  const originY = y - bounds.top;
  for (let i = 0; i < 12; i += 1) {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 12;
    const distance = 18 + Math.random() * 34;
    spark.className = "burst-spark";
    spark.style.left = `${originX}px`;
    spark.style.top = `${originY}px`;
    spark.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
    spark.style.setProperty("--burst-color", color);
    poster.append(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function addCursorTrail(event) {
  const now = performance.now();
  if (now - lastTrailAt < 42 || reducedMotion.matches) return;
  lastTrailAt = now;
  const bounds = poster.getBoundingClientRect();
  const trail = document.createElement("span");
  trail.className = "cursor-trail";
  trail.textContent = Math.random() > 0.5 ? "✦" : "·";
  trail.style.left = `${event.clientX - bounds.left}px`;
  trail.style.top = `${event.clientY - bounds.top}px`;
  poster.append(trail);
  trail.addEventListener("animationend", () => trail.remove(), { once: true });
}

function updateParallax(event) {
  if (reducedMotion.matches || event.pointerType === "touch") return;
  const bounds = poster.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  poster.classList.add("is-active");
  poster.style.setProperty("--px", `${x * bounds.width}`);
  poster.style.setProperty("--py", `${y * bounds.height}`);
  poster.style.setProperty("--tilt-x", `${-y * 3.5}deg`);
  poster.style.setProperty("--tilt-y", `${x * 3.5}deg`);
  addCursorTrail(event);
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    layers.forEach((layer) => {
      const depth = Number(layer.dataset.depth || 0.5);
      const scale = Math.min(bounds.width / 848, bounds.height / 1200);
      layer.style.setProperty("--dx", `${x * depth * 62 * scale}px`);
      layer.style.setProperty("--dy", `${y * depth * 62 * scale}px`);
    });
    frame = 0;
  });
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(settlePoster, 850);
}

function addGiftInteraction(gift) {
  const giftColor = getComputedStyle(gift).getPropertyValue("--gift").trim() || "#ffd76a";
  const popoutToys = ["🧸", "🪆", "⚽"];
  function openGift(x, y) {
    burstAt(x, y, giftColor);
    gift.querySelector(".gift-surprise")?.remove();
    const item = document.createElement("span");
    item.className = "gift-surprise";
    item.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i += 1) {
      const toy = document.createElement("span");
      toy.className = "popout-toy";
      toy.textContent = popoutToys[(i + gifts.indexOf(gift)) % popoutToys.length];
      toy.style.setProperty("--pop-x", `${(i - 1) * 2.5}cqw`);
      toy.style.setProperty("--pop-y", `${-(9 + (i % 2) * 2.5)}cqw`);
      toy.style.setProperty("--pop-rotation", `${(i - 1) * 22}deg`);
      toy.style.setProperty("--pop-delay", `${i * 70}ms`);
      item.append(toy);
    }
    gift.append(item);
    gift.classList.remove("is-open");
    requestAnimationFrame(() => gift.classList.add("is-open"));
    window.setTimeout(() => gift.classList.remove("is-open"), 650);
    window.setTimeout(() => item.remove(), 2450);
  }
  gift.addEventListener("mouseenter", () => {
    gift.classList.add("is-hovered");
    gift.style.transform = "translate3d(var(--dx),var(--dy),0) rotate(9deg) scale(1.16)";
    gift.style.filter = "drop-shadow(0 0 1.4cqw #ffd76a) brightness(1.22)";
  });
  gift.addEventListener("mouseleave", () => {
    gift.classList.remove("is-hovered");
    gift.style.removeProperty("transform");
    gift.style.removeProperty("filter");
  });
  gift.addEventListener("focus", () => gift.dispatchEvent(new Event("mouseenter")));
  gift.addEventListener("blur", () => gift.dispatchEvent(new Event("mouseleave")));
  gift.addEventListener("click", (event) => {
    const bounds = gift.getBoundingClientRect();
    openGift(event.clientX || bounds.left + bounds.width / 2,
      event.clientY || bounds.top + bounds.height / 2);
  });
  gift.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const bounds = gift.getBoundingClientRect();
      openGift(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    }
  });
}

const teddyBear = document.querySelector(".teddy-bear");
function danceTeddy() {
  if (!teddyBear) return;
  teddyBear.classList.remove("is-dancing");
  void teddyBear.getBoundingClientRect();
  teddyBear.classList.add("is-dancing");
  teddyBear.setAttribute("aria-pressed", "true");
  const bounds = teddyBear.getBoundingClientRect();
  burstAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 3, "#ff648c");
  window.setTimeout(() => {
    teddyBear.classList.remove("is-dancing");
    teddyBear.setAttribute("aria-pressed", "false");
  }, 2200);
}
teddyBear?.addEventListener("click", danceTeddy);
teddyBear?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    danceTeddy();
  }
});
const christmasTree = document.querySelector("#christmas-tree");
christmasTree?.addEventListener("click", () => {
  const isLit = christmasTree.classList.toggle("is-lit");
  christmasTree.setAttribute("aria-pressed", String(isLit));
  christmasTree.setAttribute("aria-label", isLit
    ? "Apagar las luces del Ã¡rbol de Navidad"
    : "Encender las luces del Ã¡rbol de Navidad");
  const bounds = christmasTree.getBoundingClientRect();
  burstAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 3, "#ffd76a");
});

makeAmbientParticles();
makeSnowfall();
gifts.forEach(addGiftInteraction);
poster.addEventListener("mousemove", updateParallax);
poster.addEventListener("mouseleave", () => {
  window.clearTimeout(idleTimer);
  settlePoster();
});
poster.addEventListener("touchstart", () => {
  window.clearTimeout(idleTimer);
  settlePoster();
}, { passive: true });
poster.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (!touch || reducedMotion.matches) return;
  const bounds = poster.getBoundingClientRect();
  const x = (touch.clientX - bounds.left) / bounds.width - 0.5;
  const y = (touch.clientY - bounds.top) / bounds.height - 0.5;
  poster.classList.add("is-active");
  window.clearTimeout(idleTimer);
  poster.style.setProperty("--px", `${x * bounds.width}`);
  poster.style.setProperty("--py", `${y * bounds.height}`);
  layers.forEach((layer) => {
    const depth = Number(layer.dataset.depth || 0.5);
    const scale = Math.min(bounds.width / 848, bounds.height / 1200);
    layer.style.setProperty("--dx", `${x * depth * 44 * scale}px`);
    layer.style.setProperty("--dy", `${y * depth * 44 * scale}px`);
  });
  idleTimer = window.setTimeout(settlePoster, 850);
}, { passive: true });
poster.addEventListener("touchend", () => {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(settlePoster, 450);
}, { passive: true });

reducedMotion.addEventListener?.("change", () => {
  if (reducedMotion.matches) settlePoster();
});






