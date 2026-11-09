import * as THREE from 'three';

// Shared PS1 vertex-snap grid (in NDC units), updated on resize to match the low-res target.
export const snap = { value: new THREE.Vector2(160, 120) };

export function ps1(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snap;
    shader.vertexShader = 'uniform vec2 uSnap;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 snapped = gl_Position;
      snapped.xyz /= snapped.w;
      snapped.xy = floor(snapped.xy * uSnap + 0.5) / uSnap;
      snapped.xyz *= snapped.w;
      gl_Position = snapped;`,
    );
  };
  return material;
}

export const lam = (opts) => ps1(new THREE.MeshLambertMaterial(opts));
export const basic = (opts) => ps1(new THREE.MeshBasicMaterial(opts));
// Wet-look variant for ground planes: same vertex snap, gentle specular from the lamp pool.
export const phong = (opts) => ps1(new THREE.MeshPhongMaterial(opts));

export const RENDER_HEIGHT = 360;

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime, uFade, uFlash, uMonitor, uPhoto;
varying vec2 vUv;

float rand(vec2 c) {
  vec3 p3 = fract(vec3(c.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bayer(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return m[i] / 16.0;
}

// Glow in two tap rings: a tight core for lamp hotspots, a wide halo for windows and signs.
vec3 bloom(vec2 uv) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5707963;
    vec2 o = vec2(cos(a), sin(a)) * (3.5 / uRes.y);
    g += max(texture2D(tDiffuse, uv + o).rgb - 0.68, 0.0);
  }
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5707963 + 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * (11.0 / uRes.y);
    g += max(texture2D(tDiffuse, uv + o).rgb - 0.78, 0.0) * 0.7;
  }
  return g * 0.125;
}

void main() {
  vec2 cc = vUv - 0.5;
  float d = dot(cc, cc);
  vec2 uv = 0.5 + cc * (1.0 + 0.06 * d + uMonitor * 0.12 * d);
  float wobble = (rand(vec2(floor(uv.y * uRes.y), floor(uTime * 24.0))) - 0.5) * (0.0008 + uMonitor * 0.004);
  uv.x += wobble;
  float ca = (0.0006 + uMonitor * 0.0026) * (1.0 - uPhoto * 0.6);
  vec3 col = vec3(
    texture2D(tDiffuse, uv + vec2(ca, 0.0)).r,
    texture2D(tDiffuse, uv).g,
    texture2D(tDiffuse, uv - vec2(ca, 0.0)).b
  );
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  vec2 px = floor(uv * uRes);
  col += (rand(px + fract(uTime) * 91.0) - 0.5) * (0.035 + uMonitor * 0.155) * (1.0 - uPhoto * 0.65);
  if (uMonitor > 0.5) {
    float g = dot(col, vec3(0.3, 0.59, 0.11));
    col = vec3(g * 0.55, g * 1.05, g * 0.65);
    col *= 0.85 + 0.15 * step(0.5, fract(uv.y * 40.0 - uTime * 2.0));
  }
  // One grade for every profile: violet night — cool blue shadows, warm highlights, glow.
  col += bloom(uv) * 0.9;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col * vec3(0.76, 0.80, 1.10), col * vec3(1.16, 1.00, 0.86), smoothstep(0.05, 0.62, l));
  col = mix(vec3(l), col, 1.22);
  col = pow(max(col, 0.0), vec3(0.92));
  col = floor(col * 32.0 + bayer(px) * 0.5) / 32.0;
  col *= 1.0 - d * 1.15;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col = mix(col, vec3(1.0), uFlash);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Pipeline {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.height = RENDER_HEIGHT;
    this.rt = new THREE.WebGLRenderTarget(320, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.u = {
      tDiffuse: { value: this.rt.texture },
      uRes: { value: new THREE.Vector2(320, this.height) },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uFlash: { value: 0 },
      uMonitor: { value: 0 },
      uPhoto: { value: 0 },
    };
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.u,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    ));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    addEventListener('resize', () => this.resize());
  }

  // Levels can ask for the cleaner "photo" look (higher res, no scanlines) via `world.render`.
  setProfile({ height = RENDER_HEIGHT, photo = false } = {}) {
    this.height = height;
    this.u.uPhoto.value = photo ? 1 : 0;
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    const rw = Math.round((this.height * w) / h);
    this.rt.setSize(rw, this.height);
    this.u.uRes.value.set(rw, this.height);
    snap.value.set(rw / 1.5, this.height / 1.5);
    this.onResize?.(w / h);
  }

  render(scene, camera, time) {
    this.u.uTime.value = time;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
