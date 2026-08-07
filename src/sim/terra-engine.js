/**
 * TERRA 궤도 엔진.
 *
 * terra-orbital-sim.html 안에 있던 렌더링·궤도·기후 코드를 **그대로** 옮겨온 모듈이다.
 * 옮기면서 바꾼 것은 딱 세 가지뿐이다.
 *
 *   1. DOM 의존 제거 — `innerWidth/innerHeight` → 컨테이너 크기, HUD 갱신 → 콜백.
 *   2. 파라미터 확장 — 원래 이심률 하나뿐이던 것에 자전축 기울기(obliquity)와
 *      세차(precession)를 더했다. 기존 노드 계층을 갈아엎지 않고 한 겹 더 끼우는
 *      방식이다 (아래 5번 섹션 참고).
 *   3. 텍스처 출처 선택 — 원격/로컬/절차적. 발표 현장 네트워크와 무관해야 하는
 *      "예측의 스케일" 쪽은 절차적 폴백만 쓴다.
 *
 * 물리(케플러 해, 0차원 에너지 수지), 셰이더 주입, 절차적 텍스처, 카메라 연출은
 * 원본 그대로다. 손대지 않았다.
 *
 * 쓰는 곳
 *   · /terra-orbital-sim.html      standalone (원격 텍스처 + 전체 HUD)
 *   · S6 밀란코비치 미션            절차적 텍스처 + 미션 UI
 */
import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { Line2 }            from 'three/addons/lines/Line2.js';
import { LineGeometry }     from 'three/addons/lines/LineGeometry.js';
import { LineMaterial }     from 'three/addons/lines/LineMaterial.js';

/* ==========================================================================
   0 · CONSTANTS
   ========================================================================== */
const R_EARTH   = 1;        // scene units — everything else is relative to this
const A_ORBIT   = 26;       // semi-major axis, scene units == 1 AU
const R_SUN     = 3.2;      // visually compressed (the real ratio is ~109:1)
const YEAR_SEC  = 108;      // seconds of wall clock per orbit at speed 1x
const DAYS_YEAR = 365.25;

const S0        = 1361;     // solar constant at 1 AU, W/m^2
const SIGMA     = 5.670374419e-8;
const GREENHOUSE= 33;       // K of warming from the real atmosphere
const T_BASE    = 14.6;     // °C produced by this model at r = 1 AU, albedo .30

const COLD = new THREE.Color('#3987e5');
const HOT  = new THREE.Color('#e66767');

const DEG = Math.PI / 180;

/** 현재 지구의 궤도 3요소. 세차는 기후학 관례(근일점 경도 ω)를 따른다. */
export const TERRA_PRESENT = { eccentricity: 0.0167, obliquity: 23.44, precession: 102.9 };

/** 지질시대 동안 실제로 오간 범위. standalone 은 이심률만 훨씬 넓게 연다. */
export const TERRA_RANGES = {
  eccentricity: { min: 0, max: 0.058, step: 0.001 },
  obliquity:    { min: 22.1, max: 24.5, step: 0.05 },
  precession:   { min: 0, max: 360, step: 1 },
};

export const TERRA_BASELINE_TEMP = T_BASE;

/* small helpers ---------------------------------------------------------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** smoothstep that also accepts a descending edge pair (e0 > e1). */
function smoothstep(e0, e1, x){
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/* --------------------------------------------------------------------------
   세차각 → 씬 각도.

   이 씬에서 근일점은 항상 +x (진근점이각 ν = 0) 에 있다. 세차를 "궤도를 돌리는
   것"이 아니라 "자전축이 기우는 방향을 돌리는 것"으로 구현하면 궤도 재생성 코드를
   건드리지 않아도 된다.

   자전축을 z축으로 ε 만큼 눕힌 뒤 y축으로 ψ 만큼 돌리면 북극축의 수평 성분은
   (−sinε·cosψ, sinε·sinψ) 가 되고, 지구가 ν 에 있을 때
        적위 ∝ sinε · cos(ν + ψ)
   이므로 북반구 하지는 ν = −ψ 에서 온다.
   기후학 관례에서는 근일점의 태양황경이 ω+180 이므로 하지(λ=90)의 진근점이각은
   ν = 90 − (ω + 180) = −90 − ω. 두 식을 맞추면

        ψ = ω + 90°

   확인: 현재 지구 ω = 102.9° → ψ = 192.9°. 근일점(ν=0)에서 적위 ∝ cos(192.9°) < 0,
   즉 근일점은 북반구 한겨울 근처 — 실제로 1월 초가 맞다.
   -------------------------------------------------------------------------- */
const psiOf = (precessionDeg) => (precessionDeg + 90) * DEG;

/* ==========================================================================
   1 · TEXTURES  (remote first, procedural fallback second)
   --------------------------------------------------------------------------
   Every map is tried against a list of URLs in order. If all of them fail we
   synthesise an equivalent map on a <canvas> so the scene is never broken —
   the HUD flips a "procedural fallback" badge when that happens.
   ========================================================================== */
// About the URLs, because it matters:
//   The cloud.githubusercontent.com placeholders now answer HTTP 403 — GitHub
//   retired that asset host — and they never sent an Access-Control-Allow-Origin
//   header, which WebGL *requires* for a cross-origin texture. So they cannot
//   work, from any origin.
//   TB below is the original home of those exact images (turban/webgl-earth):
//   same 4k Blue Marble / elevation / water-mask / cloud plates, served by
//   raw.githubusercontent.com with `ACAO: *`. UG (unpkg → three-globe) is the
//   lighter-weight second choice, and also supplies the NASA Black Marble
//   city-lights plate, which the original set does not include.
const TB = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/';
const UG = 'https://unpkg.com/three-globe/example/';
// textureMode:'local' 용. public/textures/ 에 같은 이름으로 떨궈두면 네트워크 없이
// 사진 플레이트를 쓸 수 있다 (README 참고). 없으면 절차적 폴백으로 내려간다.
const LC = '/textures/';

const MAPS = {
  day:    { remote: [TB + '2_no_clouds_4k.jpg',   UG + 'img/earth-blue-marble.jpg'], local: [LC + 'day.jpg'],    srgb: true  },
  bump:   { remote: [TB + 'elev_bump_4k.jpg',     UG + 'img/earth-topology.png'   ], local: [LC + 'bump.jpg'],   srgb: false },
  spec:   { remote: [TB + 'water_4k.png',         UG + 'img/earth-water.png'      ], local: [LC + 'water.png'],  srgb: false },
  clouds: { remote: [TB + 'fair_clouds_4k.png',   UG + 'clouds/clouds.png'        ], local: [LC + 'clouds.png'], srgb: true  },
  night:  { remote: [UG + 'img/earth-night.jpg'                                   ], local: [LC + 'night.jpg'],  srgb: true  },
  sky:    { remote: [TB + 'galaxy_starfield.png', UG + 'img/night-sky.png'        ], local: [LC + 'sky.png'],    srgb: true  },
};

/* --- procedural fallback maps ------------------------------------------- */
function hash3(x, y, z){
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y, z){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(c(0,0,0), c(1,0,0), u), l(c(0,1,0), c(1,1,0), u), v),
           l(l(c(0,0,1), c(1,0,1), u), l(c(0,1,1), c(1,1,1), u), v), w);
}
function fbm(x, y, z, oct = 5){
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++){ s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

/**
 * fBm 로 지구 알베도/고도/수면/야간/구름 플레이트를 합성한다. 사진은 아니지만
 * 대륙-해양 대비와 극관이 있어 장면이 절대 깨지지 않는다.
 */
function proceduralEarthMaps(){
  const W = 1024, H = 512;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cDay = mk(), cBump = mk(), cSpec = mk(), cNight = mk(), cCloud = mk();
  const gD = cDay.getContext('2d'),  gB = cBump.getContext('2d'), gS = cSpec.getContext('2d');
  const gN = cNight.getContext('2d'), gC = cCloud.getContext('2d');
  const iD = gD.createImageData(W, H), iB = gB.createImageData(W, H), iS = gS.createImageData(W, H);
  const iN = gN.createImageData(W, H), iC = gC.createImageData(W, H);

  for (let y = 0; y < H; y++){
    const lat = (0.5 - y / H) * Math.PI;              // +pi/2 .. -pi/2
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++){
      const lon = (x / W) * Math.PI * 2;
      // sample on the sphere so the map wraps seamlessly at the date line
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const h = fbm(px * 2.6 + 11, py * 2.6, pz * 2.6, 6);
      const land = h > 0.52;
      const alt = clamp((h - 0.52) / 0.34, 0, 1);
      const i = (y * W + x) * 4;

      // day
      let r, g, b;
      if (land){
        const dry = fbm(px * 5 + 40, py * 5, pz * 5, 3);
        const ice = clamp((Math.abs(sl) - 0.78) / 0.16, 0, 1);
        r = 62 + dry * 78 + alt * 46; g = 84 + dry * 62 + alt * 40; b = 48 + dry * 34 + alt * 44;
        r = r + (238 - r) * ice; g = g + (243 - g) * ice; b = b + (250 - b) * ice;
      } else {
        const deep = clamp((0.52 - h) / 0.3, 0, 1);
        r = 12 + (1 - deep) * 20; g = 34 + (1 - deep) * 44; b = 76 + (1 - deep) * 58;
      }
      iD.data[i] = r; iD.data[i+1] = g; iD.data[i+2] = b; iD.data[i+3] = 255;

      // bump — elevation only on land
      const bv = land ? 96 + alt * 150 : 40;
      iB.data[i] = iB.data[i+1] = iB.data[i+2] = bv; iB.data[i+3] = 255;

      // water mask — white == ocean (the shaders read .r)
      const wv = land ? 8 : 240;
      iS.data[i] = iS.data[i+1] = iS.data[i+2] = wv; iS.data[i+3] = 255;

      // night lights — sparse, coastal, mid-latitude
      let lv = 0;
      if (land){
        const coast = 1 - clamp(Math.abs(h - 0.545) / 0.05, 0, 1);
        const belt = Math.exp(-((Math.abs(sl) - 0.42) ** 2) / 0.03);
        const spark = Math.pow(fbm(px * 26 + 7, py * 26, pz * 26, 2), 7);
        lv = clamp(spark * 3.4 * (0.35 + coast) * (0.3 + belt), 0, 1);
      }
      const li = Math.round(lv * 255);
      iN.data[i] = li; iN.data[i+1] = Math.round(li * 0.92); iN.data[i+2] = Math.round(li * 0.7); iN.data[i+3] = 255;

      // clouds — banded, because the real ones are
      const band = 0.5 + 0.5 * Math.cos(lat * 6.2);
      const cv = clamp((fbm(px * 3.4 + 90, py * 3.4, pz * 3.4, 5) - 0.44) / 0.3, 0, 1) * (0.45 + 0.55 * band);
      iC.data[i] = iC.data[i+1] = iC.data[i+2] = 255;
      iC.data[i+3] = Math.round(clamp(cv, 0, 1) * 235);
    }
  }
  gD.putImageData(iD, 0, 0);     gB.putImageData(iB, 0, 0);
  gS.putImageData(iS, 0, 0);     gN.putImageData(iN, 0, 0);
  gC.putImageData(iC, 0, 0);
  const t = c => new THREE.CanvasTexture(c);
  return { day: t(cDay), bump: t(cBump), spec: t(cSpec), night: t(cNight), clouds: t(cCloud) };
}

/** Faint nebula haze for the sky sphere when night-sky.png is unavailable. */
function proceduralSky(){
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#02040a'; g.fillRect(0, 0, W, H);
  // a milky band with a little tilt, built from soft additive blobs
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++){
    const t = i / 260;
    const x = t * W;
    const y = H * 0.5 + Math.sin(t * Math.PI * 2 + 0.6) * H * 0.16 + (hash3(i, 1, 2) - 0.5) * H * 0.1;
    const rad = 40 + hash3(i, 7, 3) * 130;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.05 + hash3(i, 9, 4) * 0.07;
    grd.addColorStop(0, `rgba(120,140,205,${a})`);
    grd.addColorStop(1, 'rgba(30,20,60,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/* ==========================================================================
   ENGINE
   ========================================================================== */
/**
 * @param {HTMLElement} container  캔버스를 붙일 요소. 크기는 이 요소를 따라간다.
 * @param {object} opts
 *   textureMode  'remote' | 'local' | 'procedural'   (기본 'remote')
 *   params       {eccentricity, obliquity, precession}
 *   motion       {speed, spin, exposure}
 *   view         'earth' | 'system'
 *   intro        시네마틱 진입 연출 (기본 true)
 *   onProgress   (name, loaded, total) => void
 *   onTelemetry  (t) => void   0.1초마다. 계기판은 전부 여기서 그린다.
 *   onViewChange (mode) => void
 * @returns 핸들 (setParams / setMotion / setToggle / setView / resize / dispose …)
 */
export async function createTerraSim(container, opts = {}){
  const {
    textureMode = 'remote',
    params: initialParams = {},
    motion: initialMotion = {},
    view: initialView = 'earth',
    intro = true,
    onProgress = () => {},
    onTelemetry = null,
    onViewChange = null,
  } = opts;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const W = () => Math.max(1, container.clientWidth  || 1);
  const H = () => Math.max(1, container.clientHeight || 1);

  /* --- 1 · load textures ------------------------------------------------ */
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const totalMaps = Object.keys(MAPS).length;
  let loadedCount = 0;
  let usedFallback = false;

  /** Try each URL in turn; resolve with the first that loads, else null. */
  function loadFirst(urls){
    return new Promise(resolve => {
      let i = 0;
      const attempt = () => {
        if (i >= urls.length) return resolve(null);
        loader.load(urls[i++], tx => resolve(tx), undefined, attempt);
      };
      attempt();
    });
  }

  const tex = {};
  await Promise.all(Object.entries(MAPS).map(async ([key, def]) => {
    const urls = textureMode === 'procedural' ? []
               : textureMode === 'local'      ? def.local
               : def.remote;
    tex[key] = urls.length ? await loadFirst(urls) : null;
    loadedCount++;
    onProgress(key, loadedCount, totalMaps);
  }));

  // fill any gaps procedurally
  if (!tex.day || !tex.bump || !tex.spec || !tex.night || !tex.clouds){
    const p = proceduralEarthMaps();
    for (const k of ['day','bump','spec','night','clouds']) if (!tex[k]) { tex[k] = p[k]; usedFallback = true; }
  }
  if (!tex.sky){ tex.sky = proceduralSky(); usedFallback = true; }

  /* ==========================================================================
     2 · RENDERER / SCENE / CAMERA
     ========================================================================== */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic highlight rolloff
  renderer.toneMappingExposure = initialMotion.exposure ?? 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.05, 4000);
  camera.position.set(-3.1, 1.4, 3.6);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function prep(t, srgb){
    if (!t) return t;
    t.anisotropy = maxAniso;
    t.wrapS = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  prep(tex.day, true); prep(tex.night, true); prep(tex.clouds, true); prep(tex.sky, true);
  prep(tex.bump, false); prep(tex.spec, false);

  /* ==========================================================================
     3 · SPACE:  sky sphere + parallax starfield
     ========================================================================== */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 48, 32),
    new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, depthWrite: false, color: 0x9aa6c8 })
  );
  sky.rotation.z = 0.5;
  scene.add(sky);

  /** soft round sprite for point stars — square points look cheap */
  function starSprite(){
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0,   'rgba(255,255,255,1)');
    grd.addColorStop(0.25,'rgba(255,255,255,.55)');
    grd.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const stars = (() => {
    const N = 7000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++){
      // 40% of stars clustered into a galactic band, the rest uniform
      const band = i % 5 < 2;
      const u = Math.random() * 2 - 1;
      const lat = band ? Math.asin(u * 0.16) : Math.asin(u);
      const lon = Math.random() * Math.PI * 2;
      const r = 700 + Math.random() * 700;
      pos[i*3]   = r * Math.cos(lat) * Math.cos(lon);
      pos[i*3+1] = r * Math.sin(lat);
      pos[i*3+2] = r * Math.cos(lat) * Math.sin(lon);
      // colour by rough stellar temperature
      const t = Math.random();
      c.setHSL(t < 0.12 ? 0.06 : t < 0.5 ? 0.11 : t < 0.85 ? 0.58 : 0.62,
               t < 0.12 ? 0.6  : 0.35,
               0.62 + Math.random() * 0.35);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
      // a few rare bright stars carry the composition; the rest stay faint
      siz[i] = (band ? 1.5 : 2.1) + Math.pow(Math.random(), 6) * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize',    new THREE.BufferAttribute(siz, 1));
    const m = new THREE.PointsMaterial({
      map: starSprite(), size: 1.0,
      // stars are effectively at infinity: constant screen size, no attenuation
      sizeAttenuation: false, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    // Per-star size. NOTE the attribute is `aSize`, not `size` — points_vert
    // already declares `uniform float size`, and redeclaring the name as an
    // attribute is a GLSL redefinition error.
    m.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSize;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    const p = new THREE.Points(g, m);
    scene.add(p);
    return p;
  })();

  /* ==========================================================================
     4 · THE SUN:  light source + glowing body + flare sprites
     ========================================================================== */
  const sunGroup = new THREE.Group();
  scene.add(sunGroup);

  // The requested directional light. Its position is re-aimed every frame so
  // the rays always run sun -> Earth, and its intensity follows a
  // tone-compressed inverse-square law so perihelion visibly brightens.
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 3.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -1.6; sunLight.shadow.camera.right = 1.6;
  sunLight.shadow.camera.top  =  1.6; sunLight.shadow.camera.bottom = -1.6;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight, sunLight.target);

  // "not completely pitch black" fill, cool so it reads as skylight. Keep this
  // genuinely low: raise it and the night hemisphere washes out, taking the city
  // lights and the atmospheric limb with it.
  scene.add(new THREE.AmbientLight(0x2b3c58, 0.12));

  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Color(0xfff6e2) }, uEdge: { value: new THREE.Color(0xff9b2e) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main(){
        vN = normalize( mat3( modelMatrix ) * normal );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uCore; uniform vec3 uEdge;
      varying vec3 vN; varying vec3 vP;
      void main(){
        vec3 V = normalize( cameraPosition - vP );
        // limb brightening: the disc edge is hotter-looking than the centre
        float f = pow( 1.0 - abs( dot( normalize( vN ), V ) ), 2.2 );
        vec3 c = mix( uCore, uEdge, f );
        // push well above 1.0 so the bloom pass has something to catch
        gl_FragColor = vec4( c * ( 2.4 + f * 4.0 ), 1.0 );
      }`
  });
  sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R_SUN, 48, 32), sunMat));

  /** additive radial sprite used for the corona and the anamorphic streak */
  function glowSprite(inner, outer){
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, inner); grd.addColorStop(0.35, outer); grd.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  const flareTex = glowSprite('rgba(255,244,222,.95)', 'rgba(255,152,58,.30)');
  // depthTest stays ON so the halo never paints over the Earth when the planet
  // passes in front of the sun; depthWrite stays off so the two sprites and the
  // disc composite additively.
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  corona.scale.setScalar(R_SUN * 4.5);
  const streak = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareTex, blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, opacity: 0.26
  }));
  streak.scale.set(R_SUN * 12, R_SUN * 1.1, 1);
  sunGroup.add(corona, streak);

  /* ==========================================================================
     5 · THE EARTH
     --------------------------------------------------------------------------
     Node hierarchy, and why it matters:
         earthPivot     position only  — walks the orbit, never rotates
           precessGroup rotation.y = ψ — 자전축이 '어느 방향으로' 기우는가 (세차)
             tiltGroup  rotation.z = ε — 자전축이 '얼마나' 기우는가 (기울기)
               earth    rotation.y += ...   — the daily spin
     Because the tilt lives above the orbital motion and is never re-aimed, the
     north pole keeps pointing at the same patch of sky all year: that alone
     produces the seasons.

     원본에는 tiltGroup 하나뿐이었고 ε 은 23.5° 상수였다. 세차를 넣기 위해 그 위에
     precessGroup 한 겹만 끼웠다 — 궤도·케플러·기후 코드는 손대지 않는다.
     ========================================================================== */
  const earthPivot   = new THREE.Group();
  const precessGroup = new THREE.Group();
  const tiltGroup    = new THREE.Group();
  precessGroup.add(tiltGroup);
  earthPivot.add(precessGroup);
  scene.add(earthPivot);

  /** 북극축의 월드 방향. 계절 판정에 쓴다. 파라미터가 바뀌면 다시 계산한다. */
  const NORTH_AXIS = new THREE.Vector3(0, 1, 0);
  function refreshAxis(){
    NORTH_AXIS.set(0, 1, 0)
      .applyEuler(new THREE.Euler(0, 0, tiltGroup.rotation.z))
      .applyEuler(new THREE.Euler(0, precessGroup.rotation.y, 0))
      .normalize();
  }

  const earthGeo = new THREE.SphereGeometry(R_EARTH, 128, 96);

  // Uniforms shared with the injected shader code below.
  const earthU = {
    uSunDirW:   { value: new THREE.Vector3(1, 0, 0) },  // world-space, surface -> sun
    uNightMap:  { value: tex.night },
    uSpecMap:   { value: tex.spec },
    uNightGain: { value: 3.4 },
    uIce:       { value: 0.0 },   // 0..1 how far the caps have grown
    uIceEdge:   { value: 0.86 },  // |sin(lat)| where ice begins
    uWarm:      { value: 0.0 },   // 0..1 heat-stress browning of land
    uRim:       { value: 0.34 },
    uTermSoft:  { value: 0.18 },  // terminator wrap, in cosine units (~10°)
    uAtmoTint:  { value: new THREE.Color(0x5b9dff) }
  };

  // MeshPhongMaterial gives us bump + specular + shadow receiving for free;
  // onBeforeCompile adds the three things it can't do: night-side city lights,
  // the climate tint, and a limb rim light.
  const earthMat = new THREE.MeshPhongMaterial({
    map: tex.day,
    bumpMap: tex.bump,
    bumpScale: 0.035,
    specularMap: tex.spec,
    specular: new THREE.Color(0x2f4a6b),
    shininess: 22
  });
  /* --------------------------------------------------------------------------
     Terminator softening.
     Plain Lambert (max(N·L, 0)) plus a bright sun puts the day/night boundary in
     a knife-edge: the cosine only dims within the last ~15° before the edge, and
     a strong light saturates everything before that. Real limb photographs show
     a soft band, because the atmosphere scatters sunlight past the geometric
     terminator. Wrapped diffuse — (N·L + w)/(1 + w) — reproduces that for one
     extra add and divide.
     The substitution has to happen on the RESOLVED chunk: onBeforeCompile runs
     before three expands #include directives, so a plain string replace against
     shader.fragmentShader would never find text that lives inside a chunk.
     -------------------------------------------------------------------------- */
  const PHONG_WRAPPED = THREE.ShaderChunk.lights_phong_pars_fragment.replace(
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
    `float rawNL = dot( geometryNormal, directLight.direction );
     float dotNL = saturate( ( rawNL + uTermSoft ) / ( 1.0 + uTermSoft ) );`
  );
  // fail loudly rather than silently losing the effect on a future three.js
  if (PHONG_WRAPPED === THREE.ShaderChunk.lights_phong_pars_fragment){
    console.warn('TERRA: terminator softening not applied — the three.js lighting chunk changed.');
  }

  earthMat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, earthU);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_phong_pars_fragment>', PHONG_WRAPPED);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWNrm; varying vec3 vWPos; varying vec3 vOPos; varying vec2 vUvX;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vWNrm = normalize( mat3( modelMatrix ) * normal );
        vWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        vOPos = position;          // object space: y is the spin axis, so |y| == |sin(lat)|
        vUvX  = uv;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3  uSunDirW;
        uniform sampler2D uNightMap;
        uniform sampler2D uSpecMap;
        uniform float uNightGain;
        uniform float uIce;
        uniform float uIceEdge;
        uniform float uWarm;
        uniform float uRim;
        uniform float uTermSoft;
        uniform vec3  uAtmoTint;
        varying vec3 vWNrm; varying vec3 vWPos; varying vec3 vOPos; varying vec2 vUvX;
      `)
      /* ---- climate tint: recolour the albedo before it is lit ----------- */
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        float water = texture2D( uSpecMap, vUvX ).r;      // white == ocean
        float land  = 1.0 - water;
        float absLat = abs( normalize( vOPos ).y );        // 0 equator .. 1 pole

        // cooling: ice sheets creep down from both poles
        float ice = smoothstep( uIceEdge, uIceEdge + 0.20, absLat ) * uIce;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.93, 0.99 ), ice * 0.9 );

        // warming: land dries out toward a scorched tan, oceans stay put
        vec3 scorched = mix( diffuseColor.rgb, vec3( 0.46, 0.31, 0.17 ), 0.6 );
        diffuseColor.rgb = mix( diffuseColor.rgb, scorched, clamp( uWarm, 0.0, 1.0 ) * land );
      `)
      /* ---- city lights, only where the sun has set ---------------------- */
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        vec3  Nw   = normalize( vWNrm );
        float ndl  = dot( Nw, uSunDirW );
        // ascending edges only: smoothstep with e0 > e1 is undefined in GLSL
        float night = 1.0 - smoothstep( -0.20, 0.06, ndl );
        vec3  lamps = texture2D( uNightMap, vUvX ).rgb;
        // part linear, part squared: keeps the bright metros punchy without
        // crushing the dim ones out of existence the way a pure square does
        totalEmissiveRadiance += lamps * ( 0.35 + 0.65 * lamps ) * uNightGain * night;
      `)
      /* ---- atmospheric rim on the lit limb ------------------------------ */
      .replace('#include <opaque_fragment>', `
        #include <opaque_fragment>
        vec3 Vw = normalize( vWPos - cameraPosition );
        float fres = pow( 1.0 - clamp( dot( Nw, -Vw ), 0.0, 1.0 ), 4.0 );
        gl_FragColor.rgb += uAtmoTint * fres * max( ndl + 0.12, 0.0 ) * uRim;
      `);
  };

  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.receiveShadow = true;
  tiltGroup.add(earth);

  /* ---- clouds ------------------------------------------------------------ */
  const cloudMat = new THREE.MeshPhongMaterial({
    map: tex.clouds, transparent: true, opacity: 0.92,
    depthWrite: false, specular: 0x111111, shininess: 4
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.006, 96, 64), cloudMat);
  clouds.castShadow = true;
  // The visible material keeps soft edges (no alphaTest); the shadow pass gets
  // its own depth material that DOES alpha-test, so cloud shadows are shaped
  // like clouds instead of a solid shell.
  clouds.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: tex.clouds, alphaTest: 0.35
  });
  tiltGroup.add(clouds);

  /* ==========================================================================
     6 · ATMOSPHERE SHELL  (the custom scattering shader)
     --------------------------------------------------------------------------
     A slightly larger sphere drawn from the INSIDE (side: BackSide) with
     additive blending. Three physical ideas, each cheap:
       · optical depth  — a ray grazing the limb crosses far more air, so the
                          glow must concentrate at the silhouette edge;
       · illumination   — only air that the sun still reaches scatters, and the
                          transition across the terminator is gradual;
       · Rayleigh phase — forward scattering brightens the limb between you and
                          the sun, which is what makes a backlit planet ring.
     Blue is Rayleigh's short-wavelength bias; the warm band at the terminator
     is what is left after the blue has scattered away.
     ========================================================================== */
  const atmoU = {
    uSunDir:    { value: new THREE.Vector3(1, 0, 0) },
    uDayColor:  { value: new THREE.Color(0x3d7ffb) },
    uTwilight:  { value: new THREE.Color(0xff7a3c) },
    uIntensity: { value: 1.15 },
    uPower:     { value: 4.2 },   // higher => the glow hugs the silhouette tighter
    uNightGlow: { value: 0.02 }
  };
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: atmoU,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWPos; varying vec3 vWNrm;
      void main(){
        vWNrm = normalize( mat3( modelMatrix ) * normal );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3  uSunDir;     // world space, unit, surface -> sun
      uniform vec3  uDayColor;
      uniform vec3  uTwilight;
      uniform float uIntensity;
      uniform float uPower;
      uniform float uNightGlow;
      varying vec3 vWPos; varying vec3 vWNrm;

      void main(){
        // We are looking at the shell's far wall, so flip the normal to get the
        // outward-facing one.
        vec3 N = -normalize( vWNrm );
        vec3 V = normalize( cameraPosition - vWPos );

        // 1 · OPTICAL DEPTH -------------------------------------------------
        // 1 - |N·V| is 0 head-on and 1 at the limb; raising it to a power is a
        // cheap stand-in for how much air the ray actually traverses.
        float grazing = 1.0 - abs( dot( N, V ) );
        float depth   = pow( clamp( grazing, 0.0, 1.0 ), uPower );

        // 2 · HOW MUCH SUN REACHES THIS AIR ---------------------------------
        // mu > 0 day, mu ~ 0 terminator, mu < 0 night. The smoothstep across
        // zero is what keeps the day/night edge soft instead of a hard line.
        // A narrow window: past ~7 degrees beyond the terminator there is no lit
        // air left to scatter, so the ring must die off quickly instead of
        // wrapping all the way around the night limb.
        float mu     = dot( N, uSunDir );
        float sunlit = smoothstep( -0.12, 0.28, mu );

        // 3 · RAYLEIGH PHASE FUNCTION ---------------------------------------
        // proportional to 1 + cos^2(theta): brightest when we look through the
        // atmosphere toward the sun.
        float cosT  = dot( -V, uSunDir );
        float phase = 0.75 * ( 1.0 + cosT * cosT );

        // 4 · COLOUR --------------------------------------------------------
        // Grazing light has lost its blue to scattering, so tint the narrow
        // band around the terminator warm. Both smoothsteps ascend (GLSL
        // leaves e0 > e1 undefined), and multiplying them isolates the band.
        float sunset = ( 1.0 - smoothstep( -0.02, 0.26, mu ) ) * smoothstep( -0.20, -0.02, mu );
        vec3  col    = mix( uDayColor, uTwilight, sunset * 0.85 );

        float glow = depth * sunlit * phase * uIntensity;
        glow += depth * uNightGlow;      // faint airglow so the night limb lives
        // additive blending: only rgb matters, keep alpha at 1
        gl_FragColor = vec4( col * glow, 1.0 );
      }`
  });
  // 2.4% of the radius ~= 150 km, about where the visible limb haze ends. The
  // shell's thickness sets the ring's on-screen width, so keep it tight: a
  // thicker shell reads as a painted outline rather than air.
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.024, 96, 64), atmoMat);
  tiltGroup.add(atmosphere);

  /* ==========================================================================
     7 · ORBIT GEOMETRY
     --------------------------------------------------------------------------
     Kepler's 1st law: the orbit is an ellipse with the sun at ONE FOCUS — not
     at the centre. Put the focus at the origin and the polar form is
          r(nu) = a(1 - e^2) / (1 + e cos nu)
     so raising e both stretches the curve and slides the sun off-centre. That
     is exactly what the slider is showing.
     ========================================================================== */
  const ORBIT_SAMPLES = 720;

  const orbitGeo = new LineGeometry();
  const orbitMat = new LineMaterial({
    color: 0x86b6ef, linewidth: 2.0, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const orbitHaloMat = new LineMaterial({
    color: 0x3d7ffb, linewidth: 7.0, transparent: true, opacity: 0.14,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  orbitMat.resolution.set(W(), H());
  orbitHaloMat.resolution.set(W(), H());

  const orbitLine = new Line2(orbitGeo, orbitMat);
  const orbitHalo = new Line2(orbitGeo, orbitHaloMat);
  // (no computeLineDistances(): these lines are solid, and calling it before
  // setPositions() has populated instanceStart throws.)
  const orbitGroup = new THREE.Group();
  orbitGroup.add(orbitHalo, orbitLine);
  scene.add(orbitGroup);

  /** r for a given true anomaly — the polar form of the ellipse. */
  const radiusAt = (nu, e) => A_ORBIT * (1 - e * e) / (1 + e * Math.cos(nu));

  /** Rewrite the orbit polyline for the current eccentricity. */
  const orbitPts = new Float32Array((ORBIT_SAMPLES + 1) * 3);
  function rebuildOrbit(e){
    for (let i = 0; i <= ORBIT_SAMPLES; i++){
      const nu = (i / ORBIT_SAMPLES) * Math.PI * 2;
      const r = radiusAt(nu, e);
      orbitPts[i*3]     = r * Math.cos(nu);
      orbitPts[i*3 + 1] = 0;
      orbitPts[i*3 + 2] = r * Math.sin(nu);
    }
    orbitGeo.setPositions(orbitPts);
  }

  /* perihelion (hottest) / aphelion (coldest) markers — the diverging pair */
  function markerMesh(hex){
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.52, 32),
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9,
                                    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  const periMark = markerMesh(HOT.getHex());
  const apoMark  = markerMesh(COLD.getHex());
  orbitGroup.add(periMark, apoMark);

  /* sun -> earth radius vector */
  const radiusVec = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0x86b6ef, transparent: true, opacity: 0.22,
                                  blending: THREE.AdditiveBlending, depthWrite: false })
  );
  orbitGroup.add(radiusVec);

  /* ecliptic reference grid */
  const eclipticGrid = new THREE.PolarGridHelper(A_ORBIT * 1.7, 8, 6, 96, 0x3d7ffb, 0x1d2a44);
  eclipticGrid.material.transparent = true;
  eclipticGrid.material.opacity = 0.10;
  eclipticGrid.material.depthWrite = false;
  scene.add(eclipticGrid);

  /* ==========================================================================
     7b · SEASON MARKERS + AXIS INDICATOR   (세차·기울기를 위한 확장)
     --------------------------------------------------------------------------
     이심률만 있을 때는 근일점/원일점 두 마커로 충분했다. 세차가 들어오면
     "어느 계절에 태양과 가까운가"가 핵심이 되므로, 궤도 위에 사계절의 위치를
     찍고 하지를 강조한다. 세차를 돌리면 이 네 점이 궤도 위를 미끄러진다 —
     그것이 세차가 하는 일의 전부다.

     하지의 진근점이각은 ν = −ψ (위 psiOf 주석의 유도 참고), 나머지 계절은 90°씩.

     자전축 지시선은 system 뷰에서 지구가 1픽셀짜리 점이 되어 기울기가 안 보이는
     문제를 푼다. 궤도 규모로 과장된 길이라 decor 페이드에 함께 묶는다.
     ========================================================================== */
  const SEASON_MARKS = [
    { name: 'summer', offset: 0,   color: 0xffb454 },  // 북반구 하지 — 미션 지표
    { name: 'autumn', offset: 90,  color: 0x7d8aa5 },
    { name: 'winter', offset: 180, color: 0x6aa9ff },
    { name: 'spring', offset: 270, color: 0x7d8aa5 },
  ];
  const seasonGroup = new THREE.Group();
  const seasonMarks = SEASON_MARKS.map(s => {
    const big = s.name === 'summer';
    const m = new THREE.Mesh(
      new THREE.RingGeometry(big ? 0.6 : 0.34, big ? 0.95 : 0.5, 32),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: big ? 0.95 : 0.45,
                                    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    seasonGroup.add(m);
    return { name: s.name, offset: s.offset, mesh: m };
  });
  scene.add(seasonGroup);

  const axisIndicator = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -3.2, 0), new THREE.Vector3(0, 3.2, 0)]),
    new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.75,
                                  blending: THREE.AdditiveBlending, depthWrite: false })
  );
  tiltGroup.add(axisIndicator);

  /* --------------------------------------------------------------------------
     The orbit diagram is meaningful from far away and distracting up close (a
     line that crosses in front of the planet reads as a laser, not a path), so
     its whole set of materials fades down in the Earth view. The Render toggles
     stay the master switch.
     -------------------------------------------------------------------------- */
  const decor = [
    { m: orbitMat,               base: 0.85 },
    { m: orbitHaloMat,           base: 0.14 },
    { m: periMark.material,      base: 0.90 },
    { m: apoMark.material,       base: 0.90 },
    { m: radiusVec.material,     base: 0.22 },
    { m: eclipticGrid.material,  base: 0.10 },
    { m: axisIndicator.material, base: 0.75 },
    ...seasonMarks.map(s => ({ m: s.mesh.material, base: s.mesh.material.opacity })),
  ];
  let decorMix = 1;

  /* ==========================================================================
     8 · KEPLER SOLVER
     --------------------------------------------------------------------------
     Kepler's 2nd law (equal areas in equal times) means the planet is fast at
     perihelion and slow at aphelion. The clean way to get that is to advance
     the MEAN anomaly M at a constant rate — the orbital period depends only on
     a, so the year stays the same length however extreme e becomes — then
     solve Kepler's equation
          M = E - e sin E
     for the eccentric anomaly E with Newton-Raphson, and convert to the true
     anomaly. Five iterations is plenty below e = 0.9.
     ========================================================================== */
  function solveKepler(M, e){
    M = Math.atan2(Math.sin(M), Math.cos(M));                  // wrap to [-pi, pi]
    let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));       // decent first guess
    for (let i = 0; i < 5; i++){
      const f  = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      E -= f / fp;
    }
    const cosE = Math.cos(E), sinE = Math.sin(E);
    return {
      r:  A_ORBIT * (1 - e * cosE),
      nu: Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e)
    };
  }

  /* ==========================================================================
     9 · CLIMATE MODEL  (zero-dimensional energy balance)
     --------------------------------------------------------------------------
     S      = S0 (a/r)^2                     inverse-square law
     albedo = 0.30 + ice feedback            brighter planet when it freezes
     T_eff  = ( S(1-A) / 4sigma )^(1/4)      Stefan-Boltzmann equilibrium
     T_surf = T_eff + 33 K                   lumped greenhouse effect
     The displayed value then relaxes toward T_surf with a time constant, which
     is what oceans and ice do to a real forcing signal. Illustrative — this is
     a teaching toy, not a GCM.
     ========================================================================== */
  function surfaceTemp(r, albedo){
    const S = S0 * (A_ORBIT / r) ** 2;
    const Teff = (S * (1 - albedo) / (4 * SIGMA)) ** 0.25;
    return { S, T: Teff + GREENHOUSE - 273.15 };
  }

  /* ==========================================================================
     10 · POST-PROCESSING
     ========================================================================== */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.62, 0.55, 0.28);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ==========================================================================
     11 · CAMERA CONTROLS + VIEW MODES
     ========================================================================== */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.5;
  controls.minDistance = 1.35;
  controls.maxDistance = 220;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.14;

  let viewMode = initialView;
  let transition = null;                     // {t, dur, fromPos, toPos, fromTgt, toTgt}
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /** How far back the system view has to sit for the whole ellipse to fit. The
   *  far apse is at a(1+e), so the framing distance has to grow with e. */
  const SYSTEM_DIR = new THREE.Vector3(0.24, 1.02, 0.72).normalize();
  // the side panels eat roughly a third of the width, so frame a little wider
  // than the ellipse strictly needs
  const fitDistance = e => A_ORBIT * (1 + e) * 1.5 + 10;

  /** Desired camera pose for a view mode, given the Earth's current position. */
  function poseFor(mode, earthPos){
    if (mode === 'system'){
      return { pos: SYSTEM_DIR.clone().multiplyScalar(fitDistance(eNow)), tgt: new THREE.Vector3(0, 0, 0) };
    }
    // Earth view: off to one side and slightly above, a touch behind the
    // terminator, so the crescent and the city lights are both in frame.
    const toSun = earthPos.clone().negate().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(toSun, up).normalize();
    const pos = earthPos.clone()
      .add(side.multiplyScalar(2.9))
      .add(up.clone().multiplyScalar(1.15))
      .add(toSun.clone().multiplyScalar(-1.7));
    return { pos, tgt: earthPos.clone() };
  }

  function setView(mode, animate = true, dur = 1.5){
    viewMode = mode;
    onViewChange?.(mode);
    const p = poseFor(mode, earthPivot.position);
    if (!animate || reduceMotion){
      camera.position.copy(p.pos); controls.target.copy(p.tgt); controls.update();
      return;
    }
    transition = {
      t: 0, dur,
      fromPos: camera.position.clone(), toPos: p.pos,
      fromTgt: controls.target.clone(), toTgt: p.tgt
    };
    controls.enabled = false;
  }

  /* ==========================================================================
     12 · PARAMETER STATE  (원래 HUD 슬라이더가 들고 있던 값들)
     ========================================================================== */
  let eTarget = initialParams.eccentricity ?? TERRA_PRESENT.eccentricity;  // where the slider is
  let eNow    = eTarget;                                                   // eased value the scene actually uses
  let obliquity  = initialParams.obliquity  ?? TERRA_PRESENT.obliquity;
  let precession = initialParams.precession ?? TERRA_PRESENT.precession;

  let speedMul = initialMotion.speed ?? 1;
  let spinMul  = initialMotion.spin  ?? 1;
  let paused   = false;

  function applyOrientation(){
    tiltGroup.rotation.z    = obliquity * DEG;
    precessGroup.rotation.y = psiOf(precession);
    refreshAxis();
  }
  applyOrientation();

  /* ==========================================================================
     13 · TELEMETRY BUFFER
     --------------------------------------------------------------------------
     The window is one ORBIT wide, not one wall-clock interval: samples are taken
     every 1/HISTORY of a revolution, so the x-axis really does read "365 days"
     at any orbit speed.
     ========================================================================== */
  const HISTORY = 180;
  const M_PER_SAMPLE = (Math.PI * 2) / HISTORY;
  const hist = [];                       // {t: 0..1 phase, v: °C}
  let lastOrbitStats = null;
  let lastSampleM = 0;

  /* ==========================================================================
     14 · ANIMATION LOOP
     ========================================================================== */
  const clock = new THREE.Clock();
  let M = 0;                            // mean anomaly
  let Tdisp = T_BASE;                   // displayed (lagged) temperature
  let prevEarth = new THREE.Vector3(A_ORBIT, 0, 0);
  let orbitCount = 0, lastPhase = 0;
  let fpsAcc = 0, fpsFrames = 0, fps = 0, hudAcc = 0;
  let orbitMin = Infinity, orbitMax = -Infinity, orbitSum = 0, orbitN = 0;
  let raf = 0, disposed = false;

  // initial placement so the first frame is already correct
  rebuildOrbit(eNow);
  {
    const k = solveKepler(0, eNow);
    earthPivot.position.set(k.r * Math.cos(k.nu), 0, k.r * Math.sin(k.nu));
    prevEarth.copy(earthPivot.position);
    setView(initialView, false);
  }

  // cinematic entry: start wide and ease in
  if (intro && !reduceMotion){
    camera.position.copy(earthPivot.position).add(new THREE.Vector3(-14, 7, 17));
    setView(initialView, true);
    transition.dur = 3.0;
  }

  function frame(){
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dtRaw = Math.min(clock.getDelta(), 0.1);
    const dt = paused ? 0 : dtRaw;

    /* ---- 1. eccentricity easing: the ellipse morphs, it never snaps ----- */
    const morphing = Math.abs(eNow - eTarget) > 1e-5;
    if (morphing){
      eNow += (eTarget - eNow) * Math.min(1, dtRaw * 4.5);
      rebuildOrbit(eNow);
    }

    /* ---- 2. advance the orbit (Kepler) --------------------------------- */
    M += dt * (Math.PI * 2 / YEAR_SEC) * speedMul;
    const { r, nu } = solveKepler(M, eNow);
    earthPivot.position.set(r * Math.cos(nu), 0, r * Math.sin(nu));

    const phase = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    if (phase < lastPhase){                       // crossed perihelion: new year
      orbitCount++;
      lastOrbitStats = { min: orbitMin, max: orbitMax, mean: orbitSum / Math.max(orbitN, 1) };
      orbitMin = Infinity; orbitMax = -Infinity; orbitSum = 0; orbitN = 0;
    }
    lastPhase = phase;

    /* ---- 3. spin + cloud drift ----------------------------------------- */
    earth.rotation.y  += dt * 0.62 * spinMul;     // visual rate, not to scale
    clouds.rotation.y += dt * 0.74 * spinMul;     // clouds lead the surface
    sky.rotation.y    += dt * 0.0015;

    /* ---- 4. re-aim the sun --------------------------------------------- */
    const sunDir = earthPivot.position.clone().negate().normalize();  // surface -> sun
    earthU.uSunDirW.value.copy(sunDir);
    atmoU.uSunDir.value.copy(sunDir);
    sunLight.position.set(0, 0, 0);
    sunLight.target.position.copy(earthPivot.position);
    sunLight.target.updateMatrixWorld();
    // Tone-compressed inverse-square falloff. The true ratio at e = 0.6 is 16:1
    // between the apses, which would flatten perihelion into a white disc, so the
    // exponent is below 2 and the result is clamped: perihelion reads brighter
    // while the surface keeps its detail.
    sunLight.intensity = 2.6 * clamp((A_ORBIT / r) ** 0.9, 0.55, 1.45);
    // keep the shadow frustum tight around the Earth wherever it is
    sunLight.shadow.camera.near = Math.max(0.1, r - R_EARTH * 3);
    sunLight.shadow.camera.far  = r + R_EARTH * 3;
    sunLight.shadow.camera.updateProjectionMatrix();

    /* ---- 5. climate ---------------------------------------------------- */
    // ice-albedo feedback: a colder planet is whiter, which cools it further
    const iceFrac = smoothstep(15, -6, Tdisp);
    const albedo = clamp(0.30 + 0.12 * iceFrac, 0.28, 0.46);
    const { S, T: Teq } = surfaceTemp(r, albedo);
    // thermal inertia (oceans + ice): relax toward equilibrium, never jump
    const tau = 0.13 * YEAR_SEC / Math.max(speedMul, 0.05);
    Tdisp += (Teq - Tdisp) * (1 - Math.exp(-dt / tau));

    earthU.uIce.value     = clamp(smoothstep(14, -3, Tdisp), 0, 1);
    // |sin(lat)| where the ice line sits: 0.86 ~ 59 deg (today), 0.62 ~ 38 deg
    earthU.uIceEdge.value = THREE.MathUtils.lerp(0.86, 0.62, earthU.uIce.value);
    earthU.uWarm.value    = clamp(smoothstep(18, 34, Tdisp), 0, 1);
    // a warmer planet evaporates more water: nudge cloud cover (subtle)
    cloudMat.opacity = 0.92 * (0.85 + 0.2 * earthU.uWarm.value);

    if (dt > 0){
      orbitMin = Math.min(orbitMin, Tdisp); orbitMax = Math.max(orbitMax, Tdisp);
      orbitSum += Tdisp; orbitN++;
    }

    /* ---- 6. orbit decorations ------------------------------------------ */
    const rPeri = A_ORBIT * (1 - eNow), rApo = A_ORBIT * (1 + eNow);
    periMark.position.set(rPeri, 0, 0);
    apoMark.position.set(-rApo, 0, 0);
    // 계절 마커: 하지는 ν = −ψ, 나머지는 90°씩 뒤 (섹션 7b)
    const summerNu = -psiOf(precession);
    for (const s of seasonMarks){
      const snu = summerNu + s.offset * DEG;
      const sr = radiusAt(snu, eNow);
      s.mesh.position.set(sr * Math.cos(snu), 0, sr * Math.sin(snu));
    }
    const rv = radiusVec.geometry.attributes.position;
    rv.setXYZ(0, 0, 0, 0);
    rv.setXYZ(1, earthPivot.position.x, 0, earthPivot.position.z);
    rv.needsUpdate = true;
    radiusVec.geometry.computeBoundingSphere();
    streak.material.rotation += dtRaw * 0.008;   // barely-there flare drift

    /* ---- 7. camera ----------------------------------------------------- */
    if (transition){
      transition.t += dtRaw;
      const k = easeInOut(clamp(transition.t / transition.dur, 0, 1));
      // recompute the destination each frame: the Earth keeps moving
      const dest = poseFor(viewMode, earthPivot.position);
      camera.position.lerpVectors(transition.fromPos, dest.pos, k);
      controls.target.lerpVectors(transition.fromTgt, dest.tgt, k);
      if (transition.t >= transition.dur){ transition = null; controls.enabled = true; }
    } else if (viewMode === 'earth'){
      // follow: translate the camera by the Earth's own displacement so the
      // framing holds still while the planet travels
      camera.position.add(earthPivot.position.clone().sub(prevEarth));
      controls.target.copy(earthPivot.position);
    } else if (viewMode === 'system' && morphing){
      // dolly out (or in) while the ellipse is actually changing shape, so the
      // money shot stays framed. Idle zoom is left to the user.
      const want = fitDistance(eNow), cur = camera.position.length() || 1;
      camera.position.multiplyScalar(1 + (want / cur - 1) * Math.min(1, dtRaw * 2.0));
    }
    prevEarth.copy(earthPivot.position);
    controls.update();

    // fade the orbit diagram down in the close-up view
    const wantMix = viewMode === 'earth' ? 0.16 : 1.0;
    decorMix += (wantMix - decorMix) * Math.min(1, dtRaw * 3);
    for (const d of decor) d.m.opacity = d.base * decorMix;

    /* ---- 8. telemetry (throttled) -------------------------------------- */
    fpsAcc += dtRaw; fpsFrames++; hudAcc += dtRaw;
    if (fpsAcc > 0.6){ fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

    // sample on orbital phase, redraw on wall clock
    while (M - lastSampleM >= M_PER_SAMPLE){
      lastSampleM += M_PER_SAMPLE;
      hist.push({ t: phase, v: Tdisp });
      if (hist.length > HISTORY * 2) break;   // guard against a huge dt spike
    }
    while (hist.length > HISTORY) hist.shift();

    if (onTelemetry && hudAcc > 0.1){
      hudAcc = 0;
      // time-averaged insolation over one orbit is S0/sqrt(1-e^2) — the reason
      // a more eccentric orbit is not climate-neutral even at fixed a
      const meanS = S0 / Math.sqrt(1 - eNow * eNow);
      // season from the angle between the (fixed) north axis and the sun
      const decl = NORTH_AXIS.dot(sunDir);
      onTelemetry({
        T: Tdisp, Tbase: T_BASE, albedo,
        S, meanS,
        au: r / A_ORBIT, auPeri: rPeri / A_ORBIT, auApo: rApo / A_ORBIT,
        doy: Math.floor(phase * DAYS_YEAR) + 1, phase,
        decl,
        season: decl >  0.34 ? 'Summer' : decl >  0.08 ? 'Late spring' :
                decl > -0.08 ? 'Equinox' : decl > -0.34 ? 'Late autumn' : 'Winter',
        eccentricity: eNow, obliquity, precession,
        orbitCount, lastOrbitStats, history: hist, fps, paused,
      });
    }

    composer.render();
  }

  frame();

  /* ==========================================================================
     15 · HANDLE
     ========================================================================== */
  const toggles = {
    atmo:    v => atmosphere.visible = v,
    clouds:  v => clouds.visible = v,
    night:   v => earthU.uNightGain.value = v ? 2.6 : 0,
    bloom:   v => bloom.enabled = v,
    orbit:   v => { orbitGroup.visible = v; },
    grid:    v => eclipticGrid.visible = v,
    shadow:  v => { renderer.shadowMap.enabled = v; earthMat.needsUpdate = true; cloudMat.needsUpdate = true; },
    drift:   v => controls.autoRotate = v && !reduceMotion,
    stars:   v => stars.visible = v,
    seasons: v => { seasonGroup.visible = v; axisIndicator.visible = v; },
  };

  function resize(){
    const w = W(), h = H();
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    orbitMat.resolution.set(w, h);
    orbitHaloMat.resolution.set(w, h);
  }

  function dispose(){
    disposed = true;
    cancelAnimationFrame(raf);
    controls.dispose();
    composer.dispose?.();
    scene.traverse(o => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats){
        for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
        m.dispose();
      }
    });
    for (const t of Object.values(tex)) t?.dispose?.();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    /** 궤도 3요소. 이심률만 이징되고(원본 연출), 나머지는 즉시 반영된다. */
    setParams(p){
      if (p.eccentricity !== undefined) eTarget = p.eccentricity;
      if (p.obliquity    !== undefined) obliquity = p.obliquity;
      if (p.precession   !== undefined) precession = p.precession;
      applyOrientation();
    },
    setMotion(m){
      if (m.speed    !== undefined) speedMul = m.speed;
      if (m.spin     !== undefined) spinMul = m.spin;
      if (m.exposure !== undefined) renderer.toneMappingExposure = m.exposure;
    },
    setToggle(name, v){ toggles[name]?.(v); },
    setView,
    setPaused(v){ paused = v; },
    togglePaused(){ paused = !paused; return paused; },
    get paused(){ return paused; },
    get view(){ return viewMode; },
    get usedFallback(){ return usedFallback; },
    get eccentricity(){ return eTarget; },
    resize,
    dispose,
    domElement: renderer.domElement,
  };
}
