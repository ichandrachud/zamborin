/* Tailwind's finishing pass: Hummingham's own (~/Projects/hummingham rush/cityfinish.js, f6bbe24), copied unchanged
   below so Tailwind wears the town's daytime look (owner, 2026-10-30: "repurpose the look from Hummingham"). Only the
   night parts go unused here. If the town's pass changes, copy it again rather than editing this one. */
/* ============================================================
   Robot City · the finishing pass
   ============================================================

   The owner (2026-10-11) compared our town's finish with finished games:
   a correct picture of good models still looks raw without a last light
   pass. So the town is drawn into a picture first and then finished:
   - ambient occlusion: the soft dark where things meet (a wall and the
     pavement, under a bench, in a doorway), which grounds them;
   - a glow round what is bright at night (lamps, signs);
   - a colour grade for the time of day (2026-10-12): a clean, fresh morning,
     a neutral midday, a golden late afternoon, a blue night; always the
     shadows a touch cool and the highlights a touch warm, the corners a
     little darker (no added contrast: in this light-linear picture it sank
     the dark shop windows by a sixth);
   - then the tone mapping and the screen's colour space, in the same last
     pass as the grade (three's own chunks, as OutputPass does it).
   Edges stay smooth: the picture is drawn with 2x multisampling (4x cost a
   fifth of the frame rate on the MacBook Air for little to see).
   The ambient occlusion reads the depth of the picture just drawn and works
   out the surfaces' directions from it, so the town is drawn once, not twice
   (drawing it again for the occlusion cost a third of the frame rate). It is
   worked out at half the size and laid on in the colour grade, not by its own
   copy of the picture.
   A phone leaves the occlusion out; ?finish=0 draws the town as before,
   ?ao=0 / ?ao=1 overrides. */
import * as T from './assets/three-r186.min.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, tAO: { value: null }, tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 1000 }, ao: { value: 0 }, sat: { value: 1.15 }, contrast: { value: 1 }, vig: { value: 0.22 },
    shade: { value: new T.Vector3(0.975, 0.995, 1.035) }, lit: { value: new T.Vector3(1.02, 1.0, 0.975) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tAO, tDepth; uniform float ao, sat, contrast, vig, cNear, cFar; uniform vec3 shade, lit; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      // (the soft dark where things meet fades out from 90 to 220 m away: further off the depth it reads is too coarse,
      // and it drew grey stripes through the haze over all distant land; the islands' audit, 2026-10-22)
      if (ao > 0.0) {
        float dist = -(cNear * cFar) / ((cFar - cNear) * texture2D(tDepth, vUv).r - cFar);
        col *= mix(1.0, texture2D(tAO, vUv).r, ao * (1.0 - smoothstep(90.0, 220.0, dist)));
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      float t = smoothstep(0.02, 0.9, l);
      col *= mix(shade, lit, t);
      col = max(vec3(0.0), (col - 0.18) * contrast + 0.18);
      vec2 d = vUv - 0.5; col *= 1.0 - vig * dot(d, d) * 1.6;
      gl_FragColor = vec4(col, c.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// The grade for each time of day: [shadow tint, highlight tint, colour richness]. Richer by day (owner, 2026-10-16: "why
// are the colours looking so washed out?"); the shading itself comes from the light (rush/citysky.js).
const V = (r, g, b) => new T.Vector3(r, g, b);
const GRADES = {
  noon:   [V(0.975, 0.995, 1.035), V(1.02, 1.0, 0.975), 1.15],
  morning:[V(0.965, 0.99, 1.05), V(1.035, 1.005, 0.975), 1.15],    // fresh: cool shade, a peach first light
  golden: [V(0.985, 0.965, 1.035), V(1.07, 1.0, 0.89), 1.2],      // late afternoon: honey light, lilac shade
  night:  [V(0.92, 0.97, 1.1), V(1.04, 0.99, 0.93), 0.96],         // blue shade, the lamps' warmth
};

export function makeFinish({ renderer, scene, cam, phone, q }) {
  if (q.get('finish') === '0') return { render: (s, c) => renderer.render(s, c), setSize() {}, night() {}, time() {}, ao: null };
  const size = renderer.getDrawingBufferSize(new T.Vector2());
  const target = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType, samples: q.has('msaa') ? +q.get('msaa') : 2, depthTexture: new T.DepthTexture(size.x, size.y) });
  const composer = new T.EffectComposer(renderer, target);      // its second picture gets its own depth
  const base = new T.RenderPass(scene, cam); composer.addPass(base);
  let ao = null;
  if (q.get('ao') === '1' || (!phone && q.get('ao') !== '0')) {
    ao = new T.GTAOPass(scene, cam, size.x, size.y);
    ao.setGBuffer(target.depthTexture);              // after it is made: given at the start, three r186 trips over it
    // Things count as half a metre thick: at 3 m a robot near the camera left a dark, grainy halo on the ground far
    // behind it; a wider reach or more thickness stained the robots themselves.
    ao.updateGtaoMaterial({ radius: 2, distanceExponent: 1, thickness: 0.5, scale: 2, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    const set = ao.setSize.bind(ao); ao.setSize = (w, h) => set(Math.ceil(w / 2), Math.ceil(h / 2));
    ao.setSize(size.x, size.y);
    ao.output = -1; ao.needsSwap = false;            // GTAOPass.OUTPUT.Off: the grade lays it on
    composer.addPass(ao);
  }
  const bloom = new T.UnrealBloomPass(new T.Vector2(size.x / 2, size.y / 2), 0.5, 0.2, 2.2);   // a tight glow
  composer.addPass(bloom);
  const grade = new T.ShaderPass(GRADE); composer.addPass(grade);
  if (ao) { grade.uniforms.tAO.value = ao.pdRenderTarget.texture; grade.uniforms.ao.value = 0.85; }
  return {
    ao, bloom, grade,
    get buffer() { return composer.readBuffer; },   // (where the town is drawn: shaders made ahead must be made for it)
    render(s, c) {                                   // the town, or a room inside
      base.scene = s; base.camera = c;
      if (ao) {                                      // the two pictures take turns: read the depth of this frame's
        const d = composer.readBuffer.depthTexture;  // (if the composer swaps an odd number of times a frame)
        ao.scene = s; ao.camera = c; ao.depthTexture = d; ao.gtaoMaterial.uniforms.tDepth.value = d; ao.pdMaterial.uniforms.tDepth.value = d;
        const g = grade.uniforms; g.tDepth.value = d; g.cNear.value = c.near; g.cFar.value = c.far;
      }
      composer.render();
    },
    setSize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); },
    // Only at night: lamps and signs glow. By day and at dusk the sun's shine on a glossy robot flared like a lens
    // fault; a lower threshold at night fogged a street of lit shop windows. Off, it costs nothing.
    // (2026-10-12: the lamps dimmed to about half; the threshold eased with them so they keep a soft halo.)
    night(n) { bloom.enabled = n > 0.5; bloom.strength = 0.42 * n; bloom.threshold = 1.7; },
    // The grade follows the sky (rush/citysky.js): midday, toward the morning's or the evening's, then night's.
    time({ warm, night, am }) {
      const u = grade.uniforms, a = GRADES.noon, b = am ? GRADES.morning : GRADES.golden, n = GRADES.night;
      u.shade.value.copy(a[0]).lerp(b[0], warm).lerp(n[0], night);
      u.lit.value.copy(a[1]).lerp(b[1], warm).lerp(n[1], night);
      u.sat.value = (a[2] + (b[2] - a[2]) * warm) * (1 - night) + n[2] * night;
    },
  };
}
