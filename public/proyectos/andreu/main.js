const dibujosFecha = {
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"]
};

const fechaGatos = document.querySelector(".fecha-gatos");
const cartel = document.querySelector(".cartel");
const escenaFecha = document.querySelector(".escena-fecha");
const auroraNieve = document.querySelector(".aurora-nieve");
const efectosCielo = document.querySelector(".efectos-cielo");
const nieve = document.querySelector(".nieve");
const regaloNieve = document.querySelector(".regalo-nieve");
const titulo = document.querySelector(".titulo");
const reducirZoom = document.querySelector(".reducir-zoom");
const aumentarZoom = document.querySelector(".aumentar-zoom");
const nivelZoom = document.querySelector(".nivel-zoom");
const movimientoReducido = matchMedia("(prefers-reduced-motion: reduce)");
const espacioSVG = "http://www.w3.org/2000/svg";
const densidadInicial = window.devicePixelRatio;
let punteroRaton = false;
let tituloActivo = false;
let desplazamientoTitulo = { x: 0, y: 0 };
let posicionCursor = null;
let numeroGato = 0;
let porcentajeZoom = 100;

function escalaCartel() {
    return cartel.getBoundingClientRect().width / cartel.offsetWidth;
}

function restablecerAurora() {
    [auroraNieve, efectosCielo].forEach((capa) => {
        capa.style.removeProperty("--aurora-x");
        capa.style.removeProperty("--aurora-y");
    });
}

function actualizarPuntero(evento) {
    const esRaton = evento.pointerType === "mouse";
    if (punteroRaton === esRaton) return;

    punteroRaton = esRaton;
    document.body.classList.toggle("puntero-raton", punteroRaton);
    if (!punteroRaton) {
        restablecerAurora();
        restablecerTitulo();
        actualizarLazadas();
    }
}

document.addEventListener("pointermove", actualizarPuntero, true);
document.addEventListener("pointerdown", actualizarPuntero, true);

cartel.addEventListener("mousemove", (evento) => {
    if (movimientoReducido.matches || !punteroRaton) return;

    const rectangulo = cartel.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (evento.clientX - rectangulo.left) / rectangulo.width * 100));
    const y = Math.max(0, Math.min(65, (evento.clientY - rectangulo.top) / rectangulo.height * 65));
    [auroraNieve, efectosCielo].forEach((capa) => {
        capa.style.setProperty("--aurora-x", `${x}%`);
        capa.style.setProperty("--aurora-y", `${y}%`);
    });
});

cartel.addEventListener("mouseleave", restablecerAurora);
movimientoReducido.addEventListener("change", restablecerAurora);

function rectanguloTexto() {
    const rango = document.createRange();
    rango.selectNodeContents(titulo);
    return rango.getBoundingClientRect();
}

function restablecerTitulo() {
    tituloActivo = false;
    posicionCursor = null;
    desplazamientoTitulo = { x: 0, y: 0 };
    titulo.classList.remove("siguiendo-cursor");
    titulo.style.transform = "";
}

escenaFecha.addEventListener("mousemove", (evento) => {
    if (movimientoReducido.matches || !punteroRaton) return;

    if (!tituloActivo) {
        const rectangulo = titulo.getBoundingClientRect();
        if (evento.clientX < rectangulo.left || evento.clientX > rectangulo.right
            || evento.clientY < rectangulo.top || evento.clientY > rectangulo.bottom) return;
        tituloActivo = true;
        posicionCursor = { x: evento.clientX, y: evento.clientY };
        return;
    }

    const escena = escenaFecha.getBoundingClientRect();
    const rectangulo = rectanguloTexto();
    const dx = Math.max(escena.left - rectangulo.left, Math.min(
        evento.clientX - posicionCursor.x, escena.right - rectangulo.right
    ));
    const dy = Math.max(escena.top - rectangulo.top, Math.min(
        evento.clientY - posicionCursor.y, escena.bottom - rectangulo.bottom
    ));

    const escala = escalaCartel();
    desplazamientoTitulo.x += dx / escala;
    desplazamientoTitulo.y += dy / escala;
    if (dx !== 0 || dy !== 0) {
        titulo.classList.add("siguiendo-cursor");
    }
    titulo.style.transform = `translate(${desplazamientoTitulo.x}px, ${desplazamientoTitulo.y}px)`;
    posicionCursor = { x: evento.clientX, y: evento.clientY };

    const nuevaPosicion = titulo.getBoundingClientRect();
    if (evento.clientX < nuevaPosicion.left || evento.clientX > nuevaPosicion.right
        || evento.clientY < nuevaPosicion.top || evento.clientY > nuevaPosicion.bottom) {
        titulo.classList.remove("siguiendo-cursor");
        tituloActivo = false;
        posicionCursor = null;
    }
});

escenaFecha.addEventListener("mouseleave", restablecerTitulo);
movimientoReducido.addEventListener("change", restablecerTitulo);

const regalosAdicionales = [
    {
        transform: "translate(-232.69 80.07) scale(1.21875 .82759)",
        simbolo: "objeto-copo",
        claseObjeto: "objeto-navidad-copo",
        nombre: "izquierda-pequeno",
        zona: "M 69 432 L 130 432 L 130 475 L 69 475 Z",
        cajaLazo: [70, 403, 49, 31],
        nudo: [96, 430],
        extremos: [[80, 429], [111, 428]]
    },
    {
        transform: "translate(71.5 16.9) scale(.53125 .95)",
        simbolo: "objeto-estrella",
        claseObjeto: "estrella-navidad",
        nombre: "izquierda-trasero",
        zona: "M 222 413 L 238 413 L 238 472 L 222 472 Z",
        cajaLazo: [182, 392, 29, 27],
        nudo: [200, 416],
        extremos: [[186, 413], [195, 407], [209, 413]]
    },
    {
        transform: "translate(-274.16 -161.34) scale(1.640625 1.36207)",
        simbolo: "objeto-muneco",
        claseObjeto: "objeto-navidad-muneco",
        nombre: "izquierda-grande",
        zona: "M 134 426 L 198 420 L 222 431 L 222 491 L 134 491 Z",
        cajaLazo: [149, 399, 39, 30],
        nudo: [175, 425],
        extremos: [[154, 422], [162, 411], [180, 411]]
    },
    {
        transform: "translate(264.81 -77.07) scale(1.46875 1.17241)",
        simbolo: "objeto-calcetin",
        claseObjeto: "objeto-navidad-calcetin",
        nombre: "derecha-grande",
        zona: "M 640 422 L 717 422 L 717 479 L 640 479 Z",
        cajaLazo: [652, 400, 46, 24],
        nudo: [679, 421],
        extremos: [[657, 419], [694, 419]]
    },
    {
        transform: "translate(405.31 26.83) scale(1.21875 .93103)",
        simbolo: "objeto-pan",
        claseObjeto: "objeto-navidad-pan",
        nombre: "derecha-pequeno",
        zona: "M 717 419 L 776 419 L 776 472 L 717 472 Z",
        cajaLazo: [723, 401, 36, 20],
        nudo: [741, 418],
        extremos: [[726, 416], [735, 407], [757, 415]]
    }
];

regalosAdicionales.forEach(({ transform, simbolo, claseObjeto, nombre, zona, cajaLazo, nudo, extremos }) => {
    const regalo = document.createElementNS(espacioSVG, "g");
    const zonaRegalo = document.createElementNS(espacioSVG, "path");
    const fondoLazadas = document.createElementNS(espacioSVG, "image");
    const caja = regaloNieve.cloneNode(true);
    const objetosRegalo = caja.querySelector(".objetos-regalo");
    const objeto = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const uso = document.createElementNS("http://www.w3.org/2000/svg", "use");
    const [x, y, width, height] = cajaLazo;
    const momentoAbrir = extremos.length * 2 + 3;

    regalo.classList.add("regalo-nieve", "regalo-nieve-adicional");
    regalo.setAttribute("aria-hidden", "true");
    regalo.style.setProperty("--momento-abrir", `${momentoAbrir}s`);
    zonaRegalo.classList.add("zona-regalo-nieve");
    zonaRegalo.setAttribute("d", zona);
    zonaRegalo.setAttribute("fill", "transparent");
    regalo.appendChild(zonaRegalo);

    fondoLazadas.classList.add("fondo-lazadas");
    fondoLazadas.setAttribute("href", `images/lazadas-${nombre}-fondo.png`);
    fondoLazadas.setAttribute("x", x);
    fondoLazadas.setAttribute("y", y);
    fondoLazadas.setAttribute("width", width);
    fondoLazadas.setAttribute("height", height);
    regalo.appendChild(fondoLazadas);

    extremos.forEach(([extremoX, extremoY], indice) => {
        const lazada = document.createElementNS(espacioSVG, "image");
        const hilo = document.createElementNS(espacioSVG, "path");
        const inicioHilo = Math.min(indice + 1, extremos.length - 1) * 2;

        lazada.classList.add("lazada-individual");
        lazada.setAttribute("href", `images/lazadas-${nombre}-${indice + 1}.png`);
        lazada.setAttribute("x", x);
        lazada.setAttribute("y", y);
        lazada.setAttribute("width", width);
        lazada.setAttribute("height", height);
        lazada.style.setProperty("--inicio-lazada", `${indice * 2}s`);
        lazada.style.setProperty("--origen-lazada", `${nudo[0]}px ${nudo[1]}px`);
        lazada.style.setProperty("--giro-lazada", extremoX < nudo[0] ? "5deg" : "-5deg");
        regalo.appendChild(lazada);

        hilo.classList.add("hilo-lazada-individual");
        if (indice === extremos.length - 1) {
            hilo.classList.add("ultimo-hilo");
        }
        hilo.setAttribute("d", `M ${nudo[0]} ${nudo[1]} Q ${(nudo[0] + extremoX) / 2} ${nudo[1] + 2} ${extremoX} ${extremoY}`);
        hilo.setAttribute("pathLength", "1");
        hilo.style.setProperty("--inicio-hilo", `${inicioHilo}s`);
        hilo.style.setProperty("--fin-hilo", `${extremos.length * 2}s`);
        regalo.appendChild(hilo);
    });

    caja.setAttribute("transform", transform);
    caja.removeAttribute("class");
    caja.removeAttribute("tabindex");
    caja.removeAttribute("role");
    caja.removeAttribute("aria-label");
    caja.querySelectorAll(".zona-regalo-nieve, .foto-regalo-ampliado, .tapa-limpia, .fondo-lazo-nieve, .lazo-nieve, .cinta-suelta-nieve, .fondo-cinta-nieve, .cinta-regalo-nieve, .objeto-navidad")
        .forEach((elemento) => elemento.remove());

    objeto.classList.add("objeto-navidad", claseObjeto);
    objeto.style.setProperty("--inicio-vuelo", `${momentoAbrir + 0.2}s`);
    uso.setAttribute("href", `#${simbolo}`);
    objeto.appendChild(uso);
    objetosRegalo.appendChild(objeto);
    regalo.appendChild(caja);
    regaloNieve.parentElement.appendChild(regalo);
});

function actualizarLazadas() {
    const ratonEncima = punteroRaton && regaloNieve.matches(":hover");
    regaloNieve.classList.toggle("desatando", ratonEncima || regaloNieve.matches(":focus"));
}

let posicionSalidaRegaloNieve = null;

function ampliarRegaloNieve(evento) {
    if (posicionSalidaRegaloNieve
        && evento.clientX === posicionSalidaRegaloNieve.x
        && evento.clientY === posicionSalidaRegaloNieve.y) return;

    posicionSalidaRegaloNieve = null;
    regaloNieve.classList.add("ampliado");
    escenaFecha.classList.add("regalo-ampliado");
    actualizarLazadas();
}

regaloNieve.addEventListener("mouseenter", ampliarRegaloNieve);
regaloNieve.addEventListener("mousemove", (evento) => {
    if (!regaloNieve.classList.contains("ampliado")) ampliarRegaloNieve(evento);
});

regaloNieve.addEventListener("mouseleave", (evento) => {
    posicionSalidaRegaloNieve = { x: evento.clientX, y: evento.clientY };
    regaloNieve.classList.remove("ampliado");
    escenaFecha.classList.remove("regalo-ampliado");
    actualizarLazadas();
});

regaloNieve.addEventListener("focus", actualizarLazadas);
regaloNieve.addEventListener("blur", actualizarLazadas);

["21 DE", "DICIEMBRE"].forEach((texto, indiceLinea) => {
    const linea = document.createElement("div");
    linea.className = "linea-fecha";

    [...texto].forEach((caracter) => {
        const letra = document.createElement("div");
        letra.className = "letra-gatos";

        if (caracter !== " ") {
            dibujosFecha[caracter].join("").split("").forEach((pixel, indicePixel) => {
                const celda = document.createElement("span");
                if (pixel === "1") {
                    celda.className = "gato-fecha";
                    const filasHastaSuelo = 6 - Math.floor(indicePixel / 5) + (indiceLinea === 0 ? 7 : 0);
                    const separacion = indiceLinea === 0 ? "var(--separacion-lineas)" : "0px";
                    celda.style.setProperty("--caida", `calc(${filasHastaSuelo * 100}% + ${separacion} + var(--distancia-suelo))`);
                    celda.style.setProperty("--retraso", `${(numeroGato * 13) % 180}ms`);
                    numeroGato++;
                }
                letra.appendChild(celda);
            });
        }

        linea.appendChild(letra);
    });

    fechaGatos.appendChild(linea);
});

const gatos = [...fechaGatos.querySelectorAll(".gato-fecha")].map((elemento) => ({
    elemento,
    horizontal: Math.random(),
    profundidad: Math.random()
}));

function ajustarSuelo() {
    const bordeEscena = escenaFecha.getBoundingClientRect();
    const pieFecha = fechaGatos.lastElementChild.getBoundingClientRect().bottom;
    const escala = escalaCartel();
    const posiciones = gatos.map(({ elemento }) => ({
        izquierda: elemento.offsetLeft,
        ancho: elemento.offsetWidth,
        alto: elemento.offsetHeight
    }));

    const escalaX = bordeEscena.width / escala / 463;
    const escalaY = bordeEscena.height / escala / 260;
    const izquierdaNieve = 160 * escalaX;
    const derechaNieve = 315 * escalaX;
    const arribaNieve = 225 * escalaY;
    const abajoNieve = 250 * escalaY;

    gatos.forEach(({ elemento, horizontal, profundidad }, indice) => {
        const posicion = posiciones[indice];
        const destinoX = izquierdaNieve + horizontal * (derechaNieve - izquierdaNieve - posicion.ancho);
        const suelo = (bordeEscena.top - pieFecha) / escala + arribaNieve + posicion.alto
            + profundidad * (abajoNieve - arribaNieve - posicion.alto);

        elemento.style.setProperty("--desvio", `${destinoX - posicion.izquierda}px`);
        elemento.style.setProperty("--distancia-suelo", `${suelo}px`);
    });
}

const observadorTamano = new ResizeObserver(ajustarSuelo);
observadorTamano.observe(escenaFecha);
observadorTamano.observe(fechaGatos);
const observadorTitulo = new ResizeObserver(restablecerTitulo);
observadorTitulo.observe(escenaFecha);
window.addEventListener("resize", () => {
    // El zoom del navegador cambia tanto la densidad como el tamaño del viewport.
    cartel.style.setProperty("--zoom-navegador", window.devicePixelRatio / densidadInicial);
    ajustarSuelo();
    restablecerTitulo();
});
ajustarSuelo();

function cambiarZoom(cambio) {
    porcentajeZoom = Math.max(50, Math.min(300, porcentajeZoom + cambio));
    cartel.style.setProperty("--zoom-manual", porcentajeZoom / 100);
    nivelZoom.textContent = `${porcentajeZoom}%`;
    reducirZoom.disabled = porcentajeZoom === 50;
    aumentarZoom.disabled = porcentajeZoom === 300;
    ajustarSuelo();
    restablecerTitulo();
}

reducirZoom.addEventListener("click", () => cambiarZoom(-10));
aumentarZoom.addEventListener("click", () => cambiarZoom(10));

for (let i = 0; i < 160; i++) {
    const copo = document.createElement("span");
    const duracion = 4 + Math.random() * 5;
    copo.className = "copo";
    copo.style.setProperty("--posicion", `${Math.random() * 100}%`);
    copo.style.setProperty("--tamano", `${1 + Math.random() * 3}px`);
    copo.style.setProperty("--duracion", `${duracion}s`);
    copo.style.setProperty("--inicio", `${-Math.random() * duracion}s`);
    copo.style.setProperty("--deriva", `${(Math.random() * 2 - 1) * 24}px`);
    nieve.appendChild(copo);
}

const regaloRojo = document.querySelector(".regalo");
const superficieRegaloRojo = document.querySelector(".superficie-regalo-rojo");
let cursorSobreRegaloRojo = false;

function actualizarRegaloRojo() {
    regaloRojo.classList.toggle("abierto",
        cursorSobreRegaloRojo || document.activeElement === superficieRegaloRojo);
}

superficieRegaloRojo.addEventListener("mouseenter", () => {
    cursorSobreRegaloRojo = true;
    actualizarRegaloRojo();
});

superficieRegaloRojo.addEventListener("mouseleave", () => {
    cursorSobreRegaloRojo = false;
    actualizarRegaloRojo();
});

superficieRegaloRojo.addEventListener("focus", actualizarRegaloRojo);
superficieRegaloRojo.addEventListener("blur", actualizarRegaloRojo);
