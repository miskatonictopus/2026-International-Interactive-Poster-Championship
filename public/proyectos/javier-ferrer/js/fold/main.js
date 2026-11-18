import * as THREE from 'three/webgpu';
import { mrt, output, normalView, positionView, smoothstep, vec4, float, uniform, sample, packNormalToRGB, unpackRGBToNormal, depth, screenUV, renderOutput, mix, pass } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { CandyTube, TUBE_DIAMETER } from './rope.js';
import { createPlastic, addRefraction } from './plastic.js';
import { colorGrade } from './grading.js';
import { viewportWallPlanes, clothLengthForViewport } from './viewport-walls.js';
import { addClothDragging } from './cloth-drag.js';
import { createToys, TEDDY } from './toys.js';

const status = document.querySelector('#status');
try {
  const renderer = new THREE.WebGPURenderer({ canvas: document.querySelector('canvas'), antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  await renderer.init();

  const settings = {
    speed: 2, stiffness: 0.5, thickness: TUBE_DIAMETER,
    transmission: 0, ior: 1.46, tint: 1, roughness: 0,
    exposure: 0, contrast: 1.2, saturation: 2, temperature: 0,
    occlusion: true, aoStrength: 1.4, aoRadius: 0.8, aoResolution: 1, quality: 1, pause: false
  };
  const uniforms = {
    refraction: uniform(settings.transmission),
    thickness: uniform(settings.thickness), ior: uniform(settings.ior), tint: uniform(settings.tint), roughness: uniform(settings.roughness),
    aoStrength: uniform(settings.aoStrength), contrast: uniform(settings.contrast), saturation: uniform(settings.saturation), temperature: uniform(settings.temperature)
  };
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(7, 1, 0);
  camera.lookAt(0, 3, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  // Pastel studio walls and colored softboxes give the clearcoat warm/cool
  // reflections while retaining the room's useful highlight shapes.
  room.traverse(object => {
    if (object.isLight) object.color.set('#fff1df');
    if (!object.isMesh) return;
    const material = object.material;
    if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
      const { x, z } = object.position;
      const color = x < -10 ? (z > 0 ? '#ffc29b' : '#d5baff')
        : x > 10 ? '#a8e9ff'
        : z > 10 ? '#ffbedb'
        : z < -10 ? '#b8caff' : '#fff5e6';
      material.emissive.set(color);
      // Preserve softbox luminance so the change is mainly in hue.
      const { r, g, b } = material.emissive;
      material.emissive.multiplyScalar(1 / (0.2126 * r + 0.7152 * g + 0.0722 * b));
    } else {
      material.color.set(object.isInstancedMesh ? '#c2b8db' : '#d6e3f1');
    }
  });
  const environment = pmrem.fromScene(room, 0.03);
  room.dispose();
  pmrem.dispose();
  const floorGeometry = new THREE.PlaneGeometry(200, 200);
  // backdrop: false → solo luces, sin fondo ni suelo (capa transparente del osito).
  function makeScene({ backdrop = true } = {}) {
    const scene = new THREE.Scene();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.9;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9e9b90, 0.6));
    const key = new THREE.DirectionalLight(0xfff7ea, 1.8);
    key.position.set(-3, 7, 5);
    const fill = new THREE.DirectionalLight(0xc9eaff, 0.8);
    fill.position.set(5, 4, -3);
    scene.add(key, fill);
    if (!backdrop) return scene;
    scene.background = new THREE.Color('#e9e6df');
    scene.fog = new THREE.Fog('#e9e6df', 18, 45);
    const floorMaterial = new THREE.MeshStandardNodeMaterial({ color: '#e4e0d7', roughness: 0.38, fog: false });
    // A broad, eased floor-only fade softens the studio horizon without
    // washing out the nearby cloth's color or highlights.
    floorMaterial.outputNode = vec4(mix(output.rgb, uniform(scene.background), smoothstep(4, 30, positionView.z.negate())), 1);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    return scene;
  }
  const scene = makeScene();
  const geometryScene = makeScene();
  const peelScene = makeScene();
  const plastic = createPlastic(uniforms);
  const sheet = new CandyTube(plastic.material);
  const drag = addClothDragging(renderer.domElement, camera, sheet);
  const viewProjection = new THREE.Matrix4();
  const wallPlanes = new Float64Array(12);
  function updateViewportWalls() {
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const sim = sheet.simulation;
    sim.setViewportWalls(viewportWallPlanes(viewProjection.elements, wallPlanes));
    sim.setRetainedLength(clothLengthForViewport(wallPlanes, {
      height: sim.height, spacing: sim.spacing, thickness: settings.thickness,
      maxLength: (sim.maxRows - 1) * sim.spacing
    }));
  }
  scene.add(sheet.mesh);
  const geometryPlastic = createPlastic(uniforms);
  const geometryMesh = sheet.createMesh(geometryPlastic.material);
  geometryScene.add(geometryMesh);
  const peelPlastic = createPlastic(uniforms);
  const peelMesh = sheet.createMesh(peelPlastic.material);
  peelScene.add(peelMesh);

  // Osito: cae 1 s después de que terminen de caer todos los textos.
  // Se pinta en su propia escena (teddyScene) sobre un canvas transparente que
  // está por encima de los textos HTML. También se añade a geometryScene para
  // que deje sombra de contacto (GTAO) en el suelo del canvas de abajo.
  const teddyScene = makeScene({ backdrop: false });
  let teddy = null, teddyPending = false, teddyTimer = 0;
  createToys([teddyScene, geometryScene], { camera, canvas: renderer.domElement, anisotropy: renderer.getMaxAnisotropy() })
    .then(t => { teddy = t; if (teddyPending) teddy.drop(); })
    .catch(error => console.error('No se pudieron cargar los muñecos 3D', error));
  addEventListener('textos:done', () => {
    clearTimeout(teddyTimer);
    teddyTimer = setTimeout(() => {
      if (teddy) teddy.drop();
      else teddyPending = true; // aún cargando: cae en cuanto esté listo
    }, TEDDY.delay);
  });
  addEventListener('caramelo:reset', () => {
    clearTimeout(teddyTimer);
    teddyPending = false;
    teddy?.reset();
  });

  // Independent depth/normal buffers let refraction sample the nearest shell
  // without creating a dependency on its own beauty pass.
  const geometryPass = pass(geometryScene, camera);
  geometryPass.setMRT(mrt({ output, normal: packNormalToRGB(normalView) }));
  const frontDepth = geometryPass.getTextureNode('depth');
  const packedNormal = geometryPass.getTextureNode('normal');
  const normals = sample(coord => unpackRGBToNormal(packedNormal.sample(coord)));
  geometryPass.getTexture('normal').type = THREE.UnsignedByteType;

  // A second visible depth layer supplies refracted colors from other folds.
  peelPlastic.material.maskNode = peelPlastic.material.maskNode.and(depth.greaterThan(frontDepth.sample(screenUV).r.add(0.000003)));
  const peelPass = pass(peelScene, camera);
  const refractedColor = peelPass.getTexture('output');
  refractedColor.generateMipmaps = true;
  refractedColor.minFilter = THREE.LinearMipmapLinearFilter;
  addRefraction(plastic.material, plastic.pigment, uniforms, frontDepth, peelPass.getTextureNode('output'), peelPass.getTextureNode('depth'));

  const scenePass = pass(scene, camera);
  const gtao = ao(frontDepth, normals, camera);
  gtao.radius.value = settings.aoRadius; // radio mayor = sombra de contacto más amplia
  gtao.thickness.value = 0.6;
  gtao.samples.value = 16;
  gtao.resolutionScale = 1;
  const smoothAO = denoise(gtao.getTextureNode(), frontDepth, normals, camera);
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  function rebuildPipeline() {
    let combined = scenePass.getTextureNode('output').rgb;
    if (settings.occlusion) combined = combined.mul(smoothAO.r.pow(uniforms.aoStrength)); // >1 oscurece más la sombra
    pipeline.outputNode = fxaa(colorGrade(renderOutput(vec4(combined, 1)), uniforms));
    pipeline.needsUpdate = true;
  }
  rebuildPipeline();

  // Capa del osito: el mismo renderer dibuja en un segundo canvas (fondo
  // transparente) con el mismo etalonaje de color que la escena principal.
  renderer.setClearColor(0x000000, 0); // las escenas principales tienen fondo propio
  const teddyCanvas = new THREE.CanvasTarget(document.querySelector('#teddy-canvas'));
  const mainCanvas = renderer.getCanvasTarget();
  const teddyPass = pass(teddyScene, camera, { samples: 4 }); // MSAA: bordes suaves
  // Etalonaje propio del osito (panel "Osito"), para igualarlo a ojo con el tubo.
  // Empieza con los mismos valores que el tubo.
  const teddySettings = {
    exposure: 0, contrast: settings.contrast, saturation: settings.saturation,
    temperature: settings.temperature, reflections: 0.9
  };
  const teddyUniforms = {
    exposure: uniform(1), contrast: uniform(teddySettings.contrast),
    saturation: uniform(teddySettings.saturation), temperature: uniform(teddySettings.temperature)
  };
  const teddyPipeline = new THREE.RenderPipeline(renderer);
  teddyPipeline.outputColorTransform = false;
  teddyPipeline.outputNode = colorGrade(renderOutput(vec4(teddyPass.rgb.mul(teddyUniforms.exposure), teddyPass.a)), teddyUniforms);
  function renderTeddy() {
    renderer.setCanvasTarget(teddyCanvas);
    teddyPipeline.render();
    renderer.setCanvasTarget(mainCanvas);
  }

  const updateSheet = () => {
    uniforms.thickness.value = settings.thickness;
    updateViewportWalls();
    sheet.update(0, settings);
  };
  // Avisa al resto de la página del progreso de llenado (0..1).
  let lastProgress = -1;
  function reportProgress() {
    const progress = sheet.fillProgress;
    if (progress === lastProgress) return;
    lastProgress = progress;
    window.dispatchEvent(new CustomEvent('caramelo:progress', { detail: { progress } }));
  }
  function reset() {
    window.dispatchEvent(new CustomEvent('caramelo:reset'));
    lastProgress = -1;
    drag.cancel();
    updateViewportWalls();
    const sim = sheet.simulation;
    sim.reset({
      tipHeight: settings.thickness / 2,
      speed: settings.speed
    });
    updateSheet();
  }
  const gui = new GUI({ title: 'Settings', width: 240 });
  gui.close();
  gui.add(settings, 'speed', 0, 2, 0.01).name('Feed speed');
  gui.add(settings, 'stiffness', 0, 1, 0.01).name('Bending stiffness');
  gui.add({ reset }, 'reset').name('Reset simulation');
  const materialFolder = gui.addFolder('Plastic');
  materialFolder.add(settings, 'thickness', 0.1, 0.5, 0.005).name('Grosor del tubo').onChange(updateSheet);
  materialFolder.add(settings, 'transmission', 0, 1, 0.01).name('Refraction').onChange(v => uniforms.refraction.value = v);
  materialFolder.add(settings, 'ior', 1, 1.8, 0.01).name('IOR').onChange(v => uniforms.ior.value = v);
  materialFolder.add(settings, 'tint', 0, 1, 0.01).name('Color density').onChange(v => uniforms.tint.value = v);
  materialFolder.add(settings, 'roughness', 0, 0.6, 0.01).name('Roughness').onChange(v => uniforms.roughness.value = v);
  const color = gui.addFolder('Color grading');
  color.add(settings, 'exposure', -2, 2, 0.01).name('Exposure (EV)').onChange(v => renderer.toneMappingExposure = 0.9 * 2 ** v);
  for (const [key, label, min, max] of [['contrast', 'Contrast', 0.5, 1.5], ['saturation', 'Saturation', 0, 2], ['temperature', 'Temperature', -1, 1]]) {
    color.add(settings, key, min, max, 0.01).name(label).onChange(v => uniforms[key].value = v);
  }
  color.add({ reset() { for (const controller of color.controllers) if (controller.property !== 'reset') controller.reset(); } }, 'reset').name('Reset grading');
  const effects = gui.addFolder('Rendering');
  effects.add(settings, 'occlusion').name('GTAO').onChange(rebuildPipeline);
  effects.add(settings, 'aoStrength', 0.5, 4, 0.05).name('Intensidad sombra').onChange(v => uniforms.aoStrength.value = v);
  effects.add(settings, 'aoRadius', 0.2, 2, 0.05).name('Radio sombra').onChange(v => gtao.radius.value = v);
  effects.add(settings, 'aoResolution', 0.5, 1, 0.05).name('GTAO resolution').onChange(v => gtao.resolutionScale = v);
  effects.add(settings, 'quality', { Low: 0.65, Medium: 1, High: 1.5 }).name('Resolution').onChange(resize);
  const teddyFolder = gui.addFolder('Osito');
  teddyFolder.add(teddySettings, 'exposure', -2, 2, 0.01).name('Exposición (EV)').onChange(v => teddyUniforms.exposure.value = 2 ** v);
  teddyFolder.add(teddySettings, 'contrast', 0.5, 1.5, 0.01).name('Contraste').onChange(v => teddyUniforms.contrast.value = v);
  teddyFolder.add(teddySettings, 'saturation', 0, 2, 0.01).name('Saturación').onChange(v => teddyUniforms.saturation.value = v);
  teddyFolder.add(teddySettings, 'temperature', -1, 1, 0.01).name('Temperatura').onChange(v => teddyUniforms.temperature.value = v);
  teddyFolder.add(teddySettings, 'reflections', 0, 2, 0.01).name('Reflejos entorno').onChange(v => teddyScene.environmentIntensity = v);
  teddyFolder.close();
  materialFolder.open();
  color.close();
  effects.close();
  const viewport = renderer.domElement.parentElement;
  function resize() {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    camera.aspect = width / height;
    // Keep vertical framing on wide windows and enough horizontal room for
    // the folds on narrow ones, without jumping between two fixed FOVs.
    const vertical = Math.tan(THREE.MathUtils.degToRad(55 * 0.5));
    const horizontal = Math.tan(THREE.MathUtils.degToRad(38 * 0.5));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(vertical, horizontal / camera.aspect)));
    camera.updateProjectionMatrix();
    updateViewportWalls();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1) * settings.quality);
    renderer.setSize(width, height, false);
    // La capa del osito se pinta a la resolución real de pantalla: incluye la
    // escala CSS del cartel (fitCartel) y la densidad Retina, con tope 2.5 por rendimiento.
    const cartelScale = viewport.getBoundingClientRect().width / width;
    teddyCanvas.setPixelRatio(Math.min(2.5, devicePixelRatio * cartelScale) * settings.quality);
    teddyCanvas.setSize(width, height, false);
  }
  let resizeRequest = 0;
  function scheduleResize() {
    cancelAnimationFrame(resizeRequest);
    resizeRequest = requestAnimationFrame(resize);
  }
  const viewportObserver = new ResizeObserver(scheduleResize);
  viewportObserver.observe(viewport);
  addEventListener('resize', scheduleResize);
  resize();
  reset();
  function togglePause() {
    settings.pause = !settings.pause;
  }
  addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && !event.target.isContentEditable && !/INPUT|BUTTON|SELECT|TEXTAREA/.test(event.target.tagName)) {
      event.preventDefault();
      togglePause();
    }
  });
  let last = performance.now();
  let failed = false;
  function animate(now) {
    if (failed) return;
    try {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      updateViewportWalls();
      if (!settings.pause) {
        sheet.update(delta, settings);
        teddy?.update(delta);
      }
      reportProgress();
      pipeline.render();
      renderTeddy();
      status.hidden = true;
    } catch (error) {
      failed = true;
      status.hidden = false;
      status.textContent = `Rendering failed: ${error.message}`;
      console.error(error);
    }
  }
  function start() {
    last = performance.now();
    renderer.setAnimationLoop(animate);
  }
  function stop() {
    renderer.setAnimationLoop(null);
    drag.cancel();
  }
  // The optional capture module uses this small lifecycle API to take over the
  // render loop, then return control to the interactive experiment.
  window.fold = {
    renderer, scene, camera, drag, settings, sheet, pipeline,
    scenePass, geometryPass, peelPass, gtao, uniforms,
    start, stop, reset, resize, updateViewportWalls,
    get time() { return sheet.simulation.time; }
  };
  start();
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
  console.error(error);
}
