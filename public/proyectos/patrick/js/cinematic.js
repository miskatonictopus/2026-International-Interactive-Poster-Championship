import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// El postprocesado solo recibe la escena 3D, nunca el neón ni el footer HTML.
export function createCinematicPipeline(renderer, scene, camera, depthExclusions) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(2, renderer.capabilities.maxSamples),
  });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bokeh = new BokehPass(scene, camera, {
    // Cámara Z=20; las caras visibles del árbol y de la pila rondan Z=1.
    focus: camera.position.z - 1,
    aperture: 0.006,
    maxblur: 0.005,
  });
  bokeh.materialBokeh.defines.PERSPECTIVE_CAMERA = camera.isPerspectiveCamera ? 1 : 0;
  bokeh.uniforms.focusBand = { value: 0.65 };
  // Mantener una pequeña banda nítida y conservar el alfa promediado del bokeh.
  let shader = bokeh.materialBokeh.fragmentShader
    .replace('uniform float focus;', 'uniform float focus; uniform float focusBand;')
    .replace('vec2 dofblur =', 'factor = sign(factor) * max(abs(factor) - focusBand, 0.0);\n vec2 dofblur =')
    .replace('gl_FragColor.a = 1.0;', '');
  // 21 muestras distribuidas por los anillos originales, en vez de 41 lecturas.
  let sampleIndex = 0;
  let sampleCount = 0;
  shader = shader.replace(/col \+= texture2D\( tColor,[^\n]+/g, (line) => {
    const keep = sampleIndex++ % 2 === 0;
    if (keep) sampleCount++;
    return keep ? line : '';
  }).replace('col / 41.0', `col / ${sampleCount.toFixed(1)}`);
  bokeh.materialBokeh.fragmentShader = shader;
  bokeh.materialBokeh.needsUpdate = true;

  const renderBokeh = bokeh.render.bind(bokeh);
  bokeh.render = (...args) => {
    const visible = depthExclusions.map((object) => object.visible);
    const autoShadow = renderer.shadowMap.autoUpdate;
    // Los receptores transparentes y partículas no definen el plano de enfoque.
    depthExclusions.forEach((object) => { object.visible = false; });
    // El RenderPass ya actualizó las sombras; no duplicar ese trabajo en profundidad.
    renderer.shadowMap.autoUpdate = false;
    try {
      renderBokeh(...args);
    } finally {
      depthExclusions.forEach((object, i) => { object.visible = visible[i]; });
      renderer.shadowMap.autoUpdate = autoShadow;
    }
  };

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.28, 1.6);
  // El bloom oficial suma alfa opaco: sumar únicamente RGB conserva el fondo HTML.
  Object.assign(bloom.blendMaterial, {
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });

  const output = new OutputPass();
  const powerfulDevice = (navigator.hardwareConcurrency ?? 4) >= 8
    && (navigator.deviceMemory ?? 4) >= 8;
  let grain = powerfulDevice ? 0.002 : 0;
  output.uniforms.grainAmount = { value: grain };
  output.uniforms.vignetteStrength = { value: 0.055 };
  output.material.fragmentShader = output.material.fragmentShader
    .replace('uniform sampler2D tDiffuse;', `uniform sampler2D tDiffuse;
      uniform float grainAmount;
      uniform float vignetteStrength;`)
    .replace('// tone mapping', `
      // Composición premultiplicada: cobertura original más un halo muy leve.
      float glowCoverage = min(0.2, max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b) * 0.12);
      gl_FragColor.a = max(gl_FragColor.a, glowCoverage);
      if (gl_FragColor.a > 0.00001) gl_FragColor.rgb /= gl_FragColor.a;
      else gl_FragColor.rgb = vec3(0.0);
      vec2 centered = vUv * 2.0 - 1.0;
      float vignette = smoothstep(0.25, 1.7, dot(centered, centered));
      gl_FragColor.rgb *= 1.0 - vignetteStrength * vignette;
      // tone mapping`)
    .replace('// color space', `
      float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      gl_FragColor.rgb = max(vec3(0.0), gl_FragColor.rgb + noise * grainAmount);
      // color space`)
    .replace('#endif\n\n\t\t}', '#endif\n gl_FragColor.rgb *= gl_FragColor.a;\n\t\t}');
  output.material.needsUpdate = true;

  composer.addPass(renderPass);
  composer.addPass(bokeh);
  composer.addPass(bloom);
  composer.addPass(output);

  let width = 1;
  let height = 1;
  let ratio = 1;
  let quality = 1;
  let slowFrames = 0;
  function resize(nextWidth, nextHeight) {
    width = nextWidth;
    height = nextHeight;
    // Presupuesto de píxeles acotado, incluso en pantallas Retina.
    ratio = Math.min(window.devicePixelRatio, 1.5, Math.sqrt(900000 / (width * height))) * quality;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    output.uniforms.grainAmount.value = width >= 520 ? grain : 0;
  }

  return {
    render(frameSeconds = 0) {
      // Redimensionar antes de dibujar evita dejar el canvas vacío al entrar en reposo.
      if (slowFrames >= 12 && quality > 0.72) {
        quality = Math.max(0.72, quality * 0.85);
        grain = 0;
        slowFrames = 0;
        resize(width, height);
      }
      const start = performance.now();
      composer.render(0); // No Clock, temporizador ni RAF adicional.
      const cost = performance.now() - start;
      // El envío WebGL puede ser asíncrono: comprobar también el intervalo RAF real.
      const slow = cost > 28 || (frameSeconds > 0.04 && frameSeconds < 1);
      slowFrames = slow ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    },
    resize,
    get diagnostics() {
      return {
        passes: composer.passes.map((pass) => pass.constructor.name),
        focus: bokeh.uniforms.focus.value,
        focusBand: bokeh.uniforms.focusBand.value,
        aperture: bokeh.uniforms.aperture.value,
        maxblur: bokeh.uniforms.maxblur.value,
        perspectiveDepth: bokeh.materialBokeh.defines.PERSPECTIVE_CAMERA,
        samples: sampleCount,
        pixelRatio: ratio,
        resolution: [composer.readBuffer.width, composer.readBuffer.height],
        bloom: bloom.strength,
        grain: output.uniforms.grainAmount.value,
        exposure: renderer.toneMappingExposure,
      };
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    },
  };
}
