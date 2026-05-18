// Cursor-driven fluid effect using three-fluid-fx (GLSL pipeline).
// Renders to a transparent canvas overlaid above the A33 chrome image but
// below the interactive UI, so links stay clickable.

const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("fluid");

if (!canvas || reduceMotion) {
  // Bail silently — landing page still works without the effect.
  if (canvas && reduceMotion) canvas.remove();
} else {
  bootFluid(canvas).catch((err) => {
    console.warn("Fluid effect failed to start:", err);
    canvas.remove();
  });
}

async function bootFluid(canvasEl) {
  // ESM imports from jsdelivr (esm.sh resolves three peer dep automatically).
  const THREE_VERSION = "0.183.0";
  const FX_VERSION = "0.1.0";
  const THREE_URL = `https://esm.sh/three@${THREE_VERSION}`;
  const FX_URL = `https://esm.sh/three-fluid-fx@${FX_VERSION}?deps=three@${THREE_VERSION}`;

  const [THREE, postRender, postComposer, fx] = await Promise.all([
    import(THREE_URL),
    import(`${THREE_URL}/examples/jsm/postprocessing/RenderPass.js`),
    import(`${THREE_URL}/examples/jsm/postprocessing/EffectComposer.js`),
    import(FX_URL),
  ]);

  const { WebGLRenderer, Scene, OrthographicCamera, Timer, Color } = THREE;
  const { RenderPass } = postRender;
  const { EffectComposer } = postComposer;
  const { FluidSimulation, attachPointerSplats, RainbowInkOverlayPass } = fx;

  // 1. Renderer — transparent, mounted to the existing overlay canvas.
  const renderer = new WebGLRenderer({
    canvas: canvasEl,
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new Color(0x000000), 0);

  // 2. Empty scene — RenderPass needs *something* to render. We just clear.
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // 3. Fluid solver. `balanced` is the default; bump down to `performance`
  //    on lower-end devices via a quick heuristic.
  const profile =
    (navigator.hardwareConcurrency || 4) < 4 || /Mobi|Android/i.test(navigator.userAgent)
      ? "performance"
      : "balanced";

  const fluid = new FluidSimulation(renderer, {
    profile,
    splatRadius: 0.0012,
    splatForce: 5,
    // Dissipation is per-frame pow(D, dtScale) where dtScale ≈ dt/baseDelta.
    // Closer to 1 = trails linger longer; ~0.96 gives a ~1s tail.
    densityDissipation: 0.96,
    velocityDissipation: 0.98,
    dyeDissipation: 0.95,
    curlStrength: 30,
    enableVorticity: true,
    reflectWalls: false,
  });
  // RainbowInkOverlayPass reads from dyeTexture — enable the dye field.
  // (This is a runtime flag on the instance, not a constructor option.)
  fluid.enableDye = true;

  // 4. Compose: render empty scene → fluid overlay tints it.
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  renderPass.clear = true;
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  const fluidPass = new RainbowInkOverlayPass(fluid);
  fluidPass.intensity = 1.0;
  fluidPass.vibrance = 1.15;
  fluidPass.renderToScreen = true;
  composer.addPass(fluidPass);

  // 5. Pointer input — attach to document.body so events flow over the
  //    pointer-events:none canvas. body's bounding box matches the viewport.
  const detach = attachPointerSplats(document.body, fluid, {
    coloredStrokes: true,
    colorUpdateSpeed: 8,
  });

  // 6. Resize
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    fluid.resize(w, h);
  };
  resize();
  window.addEventListener("resize", resize);

  // 7. Render loop
  const clock = new Timer();
  renderer.setAnimationLoop(() => {
    clock.update();
    const dt = Math.min(Math.max(clock.getDelta(), 1e-6), 1 / 60);
    fluid.step(dt);
    composer.render(dt);
  });

  // Expose a teardown if anyone needs it (HMR, etc.)
  window.__a33Fluid = { renderer, fluid, detach };
}
