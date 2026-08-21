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
   1 · TEXTURES  (bundled NASA plates, procedural fallback second)
   --------------------------------------------------------------------------
   Every map is tried against a list of URLs in order. If all of them fail we
   synthesise an equivalent map on a <canvas> so the scene is never broken —
   the HUD flips a "procedural fallback" badge when that happens.
   ========================================================================== */
// 텍스처 출처 — 6장 전부 NASA 퍼블릭 도메인 영상이고 저장소에 동봉되어 있다.
//   public/textures/  (약 5.6 MB) · 출처와 크레딧은 같은 폴더의 CREDITS.md 참고
//
// 예전에는 raw.githubusercontent.com/turban/webgl-earth 와 unpkg/three-globe 에서
// 런타임에 받아 썼다. 그만둔 이유가 둘이다.
//   1) turban/webgl-earth 에는 LICENSE 파일이 없다 — 명시적 허락 없는 재사용이라
//      대회 규정("외부 리소스 출처·라이선스 표기 필수")을 통과할 수 없다.
//   2) 발표 현장에서 네트워크가 흔들리면 9 MB 를 못 받아 절차적 합성으로 떨어졌다.
// NASA 원본을 직접 받아 넣으면 출처가 1차 제공처로 확정되고 오프라인도 해결된다.
const LC = '/textures/';

const MAPS = {
  day:    { local: [LC + 'day.jpg'],    srgb: true  },
  bump:   { local: [LC + 'bump.jpg'],   srgb: false },
  spec:   { local: [LC + 'water.png'],  srgb: false },
  clouds: { local: [LC + 'clouds.png'], srgb: true  },
  night:  { local: [LC + 'night.jpg'],  srgb: true  },
  sky:    { local: [LC + 'sky.jpg'],    srgb: true  },
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
 *   textureMode  'local' | 'procedural'   (기본 'local')
 *                'local' 은 번들된 NASA 플레이트(public/textures/)를 쓴다. 외부
 *                요청이 없으므로 오프라인에서도 같은 화질이 나온다.
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
    textureMode = 'local',
    params: initialParams = {},
    motion: initialMotion = {},
    view: initialView = 'earth',
    intro = true,
    onProgress = () => {},
    onTelemetry = null,
    onViewChange = null,
    /** 지구 표면을 클릭했을 때 ({lat, lon}) — 끌어서 회전한 경우는 부르지 않는다 */
    onPick = null,
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
    const urls = textureMode === 'procedural' ? [] : def.local;
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
    uSeaDry:    { value: 0.0 },   // 0..1 바다가 물러나 해저가 드러난 정도
    uMelt:      { value: 0.0 },   // 0..1 지각이 녹아 스스로 빛나는 정도
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
        uniform float uSeaDry;
        uniform float uMelt;
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

        // 바다가 물러난 자리 — 해저 퇴적물 색. 자기권을 잃은 행성이 수분을 잃는
        // 과정(화성형)을 나타내는 레이어이며, 계절·궤도 변동으로 일어나는 일이 아니다.
        vec3 seabed = vec3( 0.35, 0.29, 0.22 );
        diffuseColor.rgb = mix( diffuseColor.rgb, seabed, clamp( uSeaDry, 0.0, 1.0 ) * water );

        // 용융: 지형도 해안선도 의미를 잃는다. 반사광은 죽고 스스로 빛나기 시작한다.
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.10, 0.075, 0.065 ), clamp( uMelt, 0.0, 1.0 ) );
      `)
      /* ---- 바다가 마르면 물의 반사광도 함께 사라진다 --------------------- */
      .replace('#include <specularmap_fragment>', `
        #include <specularmap_fragment>
        specularStrength *= ( 1.0 - clamp( uSeaDry, 0.0, 1.0 ) * 0.92 );
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
        totalEmissiveRadiance += lamps * ( 0.35 + 0.65 * lamps ) * uNightGain * night * ( 1.0 - clamp( uMelt, 0.0, 1.0 ) );

        /*
         * 용암 자체 발광. 온도가 오를수록 붉은빛 → 노란빛으로 옮겨간다 —
         * 흑체가 실제로 밟는 순서다(적열 → 백열). 낮/밤 구분 없이 빛나야 한다:
         * 스스로 내는 빛이지 반사광이 아니다.
         */
        /*
         * 세기는 실제 흑체가 보이는 밝기에 맞춘다. uMelt = 1 은 약 600℃ 인데,
         * 그 온도의 암석은 **어두운 적열**이지 백열이 아니다. 처음 이 값을 2.6 으로
         * 두었더니 지구가 통째로 흰 원반이 되어 아무것도 안 보였다.
         */
        float melt = clamp( uMelt, 0.0, 1.0 );
        vec3 lava = mix( vec3( 0.85, 0.13, 0.02 ), vec3( 1.00, 0.42, 0.08 ), smoothstep( 0.5, 1.0, melt ) );
        // 지각의 균열: 바다였던 저지대가 먼저 뚫린다
        float crack = 0.55 + texture2D( uSpecMap, vUvX ).r * 0.75;
        totalEmissiveRadiance += lava * pow( melt, 1.7 ) * 0.85 * crack;
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
  /** 구름의 기본 불투명도. 지표가 녹거나 바다가 마르면 여기서 깎아 내린다. */
  const CLOUD_OPACITY = 0.92;
  const cloudMat = new THREE.MeshPhongMaterial({
    map: tex.clouds, transparent: true, opacity: CLOUD_OPACITY,
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
    uNightGlow: { value: 0.02 },
    /*
     * 지자기 상실 정도 0…1 (→ setMagneticField).
     *
     * 자기장이 무너지면 태양풍이 대기를 그대로 때린다. 그 결과를 색으로 옮긴 것이
     * 이 값이다 — 레일리 산란이 만드는 파란 고리를 경고 레드로 치환하고, 동시에
     * 밤쪽 대기까지 함께 달아오르게 한다(사라진 것은 차폐이지 태양이 아니므로).
     * 0 이면 아래 셰이더에서 아무 일도 하지 않는다.
     */
    uFieldLoss: { value: 0 },
    uLossColor: { value: new THREE.Color(0xff2d2d) },
    /*
     * 대기가 우주로 벗겨진 정도 0…1 (→ setAtmosphereStripped).
     *
     * 자기 차폐를 잃은 행성은 상층 대기를 태양풍에 깎인다. 그 결말은 색이 바뀌는
     * 것이 아니라 **고리 자체가 얇아지다 사라지는** 것이다 — 화성의 하늘에는
     * 지구 같은 파란 테두리가 없다. uFieldLoss 가 색을 맡고 이 값이 양을 맡는다.
     */
    uStripped: { value: 0 }
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
      uniform float uFieldLoss;
      uniform vec3  uLossColor;
      uniform float uStripped;
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

        // 5 · 자기 차폐 상실 -------------------------------------------------
        // 대기 레이어의 색을 **단색** 경고 레드로 치환한다.
        //
        // 색만 붉히면 낮 쪽만 밝고 밤 쪽은 어두운 그라데이션이 그대로 남아
        // '단색'이 되지 않는다. 그래서 태양 방향(sunlit)과 시선 위상(phase)에
        // 걸린 변조를 함께 걷어내고, 광학 두께(depth)만 남긴다 — depth 를 빼면
        // 대기 껍데기가 아니라 지구를 덮는 붉은 원반이 되어 버린다.
        if ( uFieldLoss > 0.001 ) {
          col  = mix( col, uLossColor, uFieldLoss );
          glow = mix( glow, depth * uIntensity * 1.25, uFieldLoss );
        }

        // 6 · 대기 박탈 -------------------------------------------------------
        // 남은 공기가 적을수록 산란할 것도 적다. 완전히 벗겨지면 고리가 사라진다.
        glow *= ( 1.0 - uStripped );

        // additive blending: only rgb matters, keep alpha at 1
        gl_FragColor = vec4( col * glow, 1.0 );
      }`
  });
  // 2.4% of the radius ~= 150 km, about where the visible limb haze ends. The
  // shell's thickness sets the ring's on-screen width, so keep it tight: a
  // thicker shell reads as a painted outline rather than air.
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.024, 96, 64), atmoMat);
  tiltGroup.add(atmosphere);

  /* ── 임계 돌파 충격파 ────────────────────────────────────────────────
     값이 서서히 변하는 화면에서는 "선을 넘은 순간"이 보이지 않는다. 지표가
     조금씩 하얘질 뿐이라, 사용자는 자기가 방금 임계를 넘었다는 것을 숫자가
     빨개진 뒤에야 안다. 넘는 그 프레임에 한 번 크게 터뜨려 준다.

     구(球) 껍데기를 부풀리며 지우는 방식이다 — 어느 각도에서 보든 같은 모양이라
     시점에 상관없이 읽힌다(고리로 만들면 옆에서 볼 때 선 하나가 된다). */
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xff2d2d, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
  const pulseMesh = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 48, 32), pulseMat);
  pulseMesh.visible = false;
  earthPivot.add(pulseMesh);          // 지구를 따라가되 자전과는 무관하다
  let pulseT = 1;                     // 1 = 끝난 상태
  const PULSE_SEC = 0.9;

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

  /* 자기권(S7) 상태. ⚠️ 선언이 프레임 루프(frame())보다 뒤에 있으면 첫 프레임이
     TDZ 로 죽는다 — 실제로 그렇게 깨졌었다. 지오메트리는 아래 §18 에서 만들고,
     루프가 읽는 값만 여기서 미리 선언한다. */
  /**
   * 지표 상태 목표값. 슬라이더를 튕기듯 움직여도 지구가 툭툭 바뀌면 안 되므로
   * 목표만 여기에 두고 프레임마다 따라가게 한다 (아래 §7.5).
   */
  const surfaceTarget = { ice: 0, warm: 0, seaDry: 0, melt: 0 };
  const SURFACE_EASE_SEC = 0.7;
  /**
   * 지표를 엔진이 계산한 표면 온도에서 직접 끌어올지 여부.
   *
   * 켜면 화면이 지어낸 값이 아니라 §9 에너지 균형 모델(S = S₀(a/r)², 슈테판–볼츠만,
   * 얼음–반사율 되먹임)의 산출을 그린다. 근일점 거리가 줄면 일사량이 제곱으로
   * 늘고, 그 결과가 그대로 지각이 녹는 그림이 된다 — 연출이 아니라 계산이다.
   */
  let surfaceAuto = false;
  /**
   * 궤도 진행만 멈춘다 (자전·구름·태양풍은 계속 돈다).
   *
   * 이심률이 크면 지구는 근일점을 순식간에 지나간다 — 케플러 2법칙이라 그게 맞다.
   * 그런데 그 순간이 이 화면에서 보여줘야 할 바로 그 장면이다. 시간을 왜곡해
   * 근일점을 느리게 만드는 대신, 사용자가 거기에 **세워 두고** 볼 수 있게 한다.
   */
  let orbitFrozen = false;

  /** 카메라가 자전과 함께 도는가 (S0 지역 선택). 아래 루프가 읽는다. */
  let followSpin = false;
  /** 직전 프레임의 자전 각도 증가분 — 동행 시점이 같은 값만큼 카메라를 돌린다 */
  let lastSpinDelta = 0;

  let magnetoReady = false;
  let magneticPct = 100;
  let alertMix = 0;
  const baseAtmo  = new THREE.Color(0x5b9dff);
  const ATMO_ALERT = new THREE.Color(0xff4b3a);

  let viewMode = initialView;
  /** 'crescent' (원본 연출) | 'daylight' (지역을 골라야 하는 화면) */
  let earthFraming = 'crescent';
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
    // Earth view, two framings:
    //   crescent — off to one side and a touch BEHIND the terminator, so the
    //              crescent and the city lights are both in frame (원본 연출).
    //   daylight — in front of the terminator, on the lit side. 사용자가 자기
    //              지역을 골라야 하는 화면에서는 그 자리가 보여야 한다. 초승달
    //              연출이 아무리 예뻐도 찍을 곳이 어둠 속이면 화면이 실패한다.
    const toSun = earthPos.clone().negate().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(toSun, up).normalize();
    const alongSun = earthFraming === 'daylight' ? 2.2 : -1.7;
    const lateral = side.clone().multiplyScalar(earthFraming === 'daylight' ? 1.6 : 2.9)
      .add(up.clone().multiplyScalar(earthFraming === 'daylight' ? 0.9 : 1.15));
    let pos = earthPos.clone().add(lateral).add(toSun.clone().multiplyScalar(alongSun));

    /*
     * 태양 쪽 자리는 근일점이 아주 가까울 때 **태양 메시 안쪽**이 된다. 이 시뮬레이터의
     * 태양은 실제 비율(약 109:1)이 아니라 시각적으로 부풀려 놓은 것이라, 극단적인
     * 이심률에서는 카메라가 그 안에 들어가 화면이 통째로 하얗게 날아간다.
     * 그럴 때는 지구 뒤쪽으로 돌아간다 — 어차피 그 상태의 지구는 스스로 빛난다.
     */
    if (pos.length() < R_SUN * 1.7){
      pos = earthPos.clone().add(lateral)
        .add(toSun.clone().multiplyScalar(-Math.abs(alongSun) - 1.4));
    }
    return { pos, tgt: earthPos.clone() };
  }

  /**
   * 결말용 클로즈업 — 지구 바로 앞까지 밀고 들어간다.
   *
   * 일반 'earth' 뷰는 지구 반지름의 약 3배 거리에서 행성 전체를 담는다. 그건
   * "지구가 어디에 있는가"를 보여주는 자리지, "지구가 무엇이 되었는가"를 보여주는
   * 자리가 아니다. 결말에서는 지표가 화면을 가득 채워야 바다가 사라진 것도,
   * 대기가 벗겨진 것도 눈에 들어온다.
   *
   * 낮 쪽에서 접근한다 — 밤면으로 들어가면 기껏 바꿔 놓은 지표가 어둠에 묻힌다.
   */
  function closeupPose(earthPos){
    const toSun = earthPos.clone().negate().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(toSun, up).normalize();
    /*
     * 지구 중심에서 약 2.6 R 떨어진 자리. (지표는 1 R, 일반 'earth' 뷰는 약 3.4 R)
     *
     * 처음에는 1.85 R 까지 밀어 넣었는데 지표에 코를 박은 꼴이라, 행성인지 텍스처인지
     * 알 수 없었다. 결말에서 보여줘야 하는 것은 '가까운 지표'가 아니라 **달라진 행성
     * 전체**다 — 실루엣(대기가 남았는지)과 지표(바다가 남았는지)가 한 화면에 같이
     * 들어와야 무엇이 변했는지 읽힌다.
     */
    const pos = earthPos.clone()
      .add(toSun.clone().multiplyScalar(R_EARTH * 2.05))   // 낮 쪽으로
      .add(side.clone().multiplyScalar(R_EARTH * 1.45))
      .add(up.clone().multiplyScalar(R_EARTH * 0.6));
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
  /** 사용자가 정한 기준 노출. 태양이 가까울 때 여기서 깎아 쓴다. */
  let exposureBase = initialMotion.exposure ?? 1;
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
    M += (orbitFrozen ? 0 : dt) * (Math.PI * 2 / YEAR_SEC) * speedMul;
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
    lastSpinDelta = dt * 0.62 * spinMul;
    earth.rotation.y  += lastSpinDelta;           // visual rate, not to scale
    clouds.rotation.y += dt * 0.74 * spinMul;     // clouds lead the surface
    sky.rotation.y    += dt * 0.0015;

    /* ---- 4. re-aim the sun --------------------------------------------- */
    const sunDir = earthPivot.position.clone().negate().normalize();  // surface -> sun
    earthU.uSunDirW.value.copy(sunDir);
    atmoU.uSunDir.value.copy(sunDir);

    /* ---- 4.4 임계 돌파 충격파 -------------------------------------------- */
    if (pulseT < 1){
      pulseT = Math.min(1, pulseT + dtRaw / PULSE_SEC);
      const e = 1 - Math.pow(1 - pulseT, 3);        // 빠르게 퍼지고 천천히 멎는다
      const k = 1.02 + e * 0.95;
      pulseMesh.scale.setScalar(k);
      pulseMat.opacity = Math.pow(1 - pulseT, 2) * 0.55;
      if (pulseT >= 1) pulseMesh.visible = false;
    }

    /* ---- 4.5 자기권 · 태양풍 (S7) --------------------------------------- */
    if (magnetoReady){
      // 경고색은 급격한 컷이 아니라 0.5초 보간 (기획안 §4)
      const target = magneticPct <= 20 ? 1 : 0;
      alertMix += (target - alertMix) * Math.min(1, dtRaw / 0.5);
      earthU.uAtmoTint.value.copy(baseAtmo).lerp(ATMO_ALERT, alertMix);

      if (solarWind.visible){
        // 태양 방향을 축으로 하는 직교 기저
        const u = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize();
        const v = new THREE.Vector3().crossVectors(sunDir, u);
        const shieldR = 1.15 + 1.5 * (magneticPct / 100);
        for (let i = 0; i < WIND_COUNT; i++){
          let prog = windSeed[i * 3 + 2] + dtRaw * 0.22;
          if (prog > 1) prog -= 1;
          windSeed[i * 3 + 2] = prog;
          const along = 6 - 12 * prog;
          const ang = windSeed[i * 3 + 1];
          let r = 0.35 + Math.abs(windSeed[i * 3]) * 2.6;
          // 지구 근처에서만 자기권이 입자를 밀어낸다. 자기장이 무너지면 shieldR 이
          // 지표에 붙어 입자가 그대로 대기를 관통한다.
          const near = Math.max(0, 1 - Math.abs(along) / 2.4);
          r = Math.max(r, shieldR * near);
          const p = sunDir.clone().multiplyScalar(along)
            .addScaledVector(u, r * Math.cos(ang))
            .addScaledVector(v, r * Math.sin(ang));
          windPos[i * 3] = p.x; windPos[i * 3 + 1] = p.y; windPos[i * 3 + 2] = p.z;
        }
        windGeo.attributes.position.needsUpdate = true;
      }
    }
    sunLight.position.set(0, 0, 0);
    sunLight.target.position.copy(earthPivot.position);
    sunLight.target.updateMatrixWorld();
    // Tone-compressed inverse-square falloff. The true ratio at e = 0.6 is 16:1
    // between the apses, which would flatten perihelion into a white disc, so the
    // exponent is below 2 and the result is clamped: perihelion reads brighter
    // while the surface keeps its detail.
    sunLight.intensity = 2.6 * clamp((A_ORBIT / r) ** 0.9, 0.55, 1.45);

    /*
     * 극단적인 이심률에서 근일점을 보려면 태양의 '그려지는 크기'를 줄여야 한다.
     *
     * 이 시뮬레이터의 태양은 이미 실제 비율(약 109:1)이 아니라 시각적으로 부풀려
     * 놓은 것이다. 그 크기 그대로 두면 e = 0.9 의 근일점에서 지구가 태양 코로나
     * 스프라이트에 통째로 잠겨 화면이 하얗게 날아간다 — 실제로 그랬다.
     * 거리에 맞춰 줄여 지구가 보이게 하고, 노출도 함께 낮춘다.
     */
    const sunFit = clamp(r / (R_SUN * 3.2), 0.12, 1);
    sunGroup.scale.setScalar(sunFit);
    renderer.toneMappingExposure = exposureBase * clamp(sunFit * 1.25, 0.35, 1);
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

    // (uIce 는 여기서 쓰지 않는다 — 지표 상태는 아래 §6.5 한 곳에서만 정한다.
    //  두 곳에서 같은 유니폼을 쓰면 프레임마다 서로를 덮어쓴다.)
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

    /* ---- 6.5 지표 상태 --------------------------------------------------- */
    if (surfaceAuto){
      /*
       * 문턱은 물질의 실제 상태 변화에서 가져왔다.
       *   −10℃ 이하  눈이 여름을 버티기 시작 → 빙상
       *    30℃ 이상  광범위한 열 스트레스·건조화
       *   100℃ 이상  물이 끓는다 → 바다가 사라진다
       *   600℃ 이상  암석이 가시광으로 붉게 달아오른다(적열)
       */
      /*
       * 지연된 Tdisp 가 아니라 **순간 평형 온도** Teq 를 쓴다. 이심률이 크면 지구는
       * 근일점을 순식간에 지나가는데(케플러 2법칙), 열관성으로 눌린 값을 쓰면 그
       * 통과가 화면에서 사라진다. 근일점에서 달아올랐다가 원일점에서 식는 그
       * 왕복이 이 화면의 전부다.
       */
      const T = Teq;
      surfaceTarget.ice    = clamp((-10 - T) / 40, 0, 1);
      surfaceTarget.warm   = clamp((T - 30) / 50, 0, 1);
      surfaceTarget.seaDry = clamp((T - 100) / 120, 0, 1);
      surfaceTarget.melt   = clamp((T - 260) / 340, 0, 1);
    }
    {
      const k = Math.min(1, dtRaw / SURFACE_EASE_SEC);
      earthU.uIce.value    += (surfaceTarget.ice    - earthU.uIce.value)    * k;
      /*
       * 빙상은 두꺼워지는 게 아니라 **내려온다.** 경계를 |sin(lat)| 0.95(극점 부근)
       * 에서 0.62(북위 약 38°)까지 끌어내린다 — 마지막 빙기 최성기의 로렌타이드
       * 빙상이 실제로 닿았던 위도가 그쯤이다. 경계가 고정이면 아무리 추워도 극점에
       * 흰 점만 생기고, "빙하기로 들어간다"가 화면에 보이지 않는다.
       */
      earthU.uIceEdge.value = 0.95 - 0.33 * earthU.uIce.value;
      earthU.uWarm.value   += (surfaceTarget.warm   - earthU.uWarm.value)   * k;
      earthU.uSeaDry.value += (surfaceTarget.seaDry - earthU.uSeaDry.value) * k;
      earthU.uMelt.value   += (surfaceTarget.melt   - earthU.uMelt.value)   * k;
      // 녹는 행성에 구름이 남아 있으면 안 된다 — 바다가 없으니 구름도 없다
      cloudMat.opacity = CLOUD_OPACITY * (1 - earthU.uMelt.value) * (1 - earthU.uSeaDry.value * 0.7);
    }

    /* ---- 7. camera ----------------------------------------------------- */
    if (transition){
      transition.t += dtRaw;
      const k = easeInOut(clamp(transition.t / transition.dur, 0, 1));
      // recompute the destination each frame: the Earth keeps moving
      const dest = transition.closeup
        ? closeupPose(earthPivot.position)
        : poseFor(viewMode, earthPivot.position);
      camera.position.lerpVectors(transition.fromPos, dest.pos, k);
      controls.target.lerpVectors(transition.fromTgt, dest.tgt, k);
      if (transition.t >= transition.dur){ transition = null; controls.enabled = true; }
    } else if (viewMode === 'earth'){
      // follow: translate the camera by the Earth's own displacement so the
      // framing holds still while the planet travels
      camera.position.add(earthPivot.position.clone().sub(prevEarth));
      controls.target.copy(earthPivot.position);

      /*
       * 자전 동행 시점 (S0 지역 선택용).
       *
       * 지구가 돌고 있는데 카메라가 가만히 있으면 찍으려던 자리가 계속 도망간다.
       * 자전을 멈춰버리면 "살아 있는 지구"가 사라지고. 그래서 카메라를 자전축
       * 둘레로 지구와 **같은 각속도**로 돌린다 — 지표는 화면에 멈춰 있고, 태양과
       * 별은 흘러간다. 자전은 계속되지만 클릭할 수 있다.
       */
      if (followSpin && lastSpinDelta !== 0){
        camera.position.sub(earthPivot.position)
          .applyAxisAngle(NORTH_AXIS, lastSpinDelta)
          .add(earthPivot.position);
        // up 도 같이 돌려야 한다. 위치만 돌리면 시야가 축을 따라 감기면서(롤)
        // 화면 가장자리의 지표가 중심 둘레로 미끄러진다 — 가운데만 멈추고 나머지는
        // 여전히 도망가는, 고친 것처럼 보이지만 안 고쳐진 상태가 된다.
        camera.up.applyAxisAngle(NORTH_AXIS, lastSpinDelta).normalize();
      }
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
        // Teq 순간 평형 · Tperi 근일점에 놓였을 때의 평형 (거리만으로 정해진다)
        Teq, Tperi: surfaceTemp(rPeri, albedo).T,
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
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    for (const t of Object.values(tex)) t?.dispose?.();
    renderer.dispose();
    renderer.domElement.remove();
  }

  /* ==========================================================================
     17 · SURFACE PICKING  (S0 "당신이 사는 곳을 찍어라")
     --------------------------------------------------------------------------
     지구 표면을 클릭해 위경도를 얻는다. 좌표계 주의:

       · raycaster 가 주는 교점은 월드 좌표다. earth.worldToLocal() 로 지구 자신의
         회전 프레임(= 텍스처가 붙어 있는 프레임)까지 되돌려야 지리 좌표가 나온다.
         earth.rotation.y 는 매 프레임 증가하므로, 월드 좌표를 그대로 쓰면 같은 곳을
         찍어도 시각마다 다른 경도가 나온다.
       · 경도식은 three.js SphereGeometry 의 UV 규약(적도 기준 u=0 이 경도 -180°)에
         맞춘 것이다. 지오메트리의 phiStart 를 바꾸면 여기도 같이 바꿔야 한다.

     마커는 earth 의 자식으로 붙인다. 그래야 지구가 자전해도 찍은 자리에 붙어 있는다.
     ========================================================================== */
  const raycaster = new THREE.Raycaster();

  /**
   * 경도를 −180…180 으로 접는다.
   *
   * ⚠️ `x % 360 - 180` 으로 접으면 안 된다. 그건 0…360 으로 접은 뒤 180 을 빼는
   * 것이라 결과가 **정확히 180° 돌아간다** — 부산(129°E)이 대서양(−51°)으로 나오고,
   * 그럴듯한 좌표라 눈으로는 틀린 줄 모른다. 실제로 그렇게 틀렸었다.
   */
  const wrapLon = deg => ((deg + 180) % 360 + 360) % 360 - 180;

  /** 지구 로컬 좌표 → 위경도(도) */
  function localToLatLon(p){
    const v = p.clone().normalize();
    const lat = 90 - Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)) / DEG;
    // latLonToLocal 의 theta = lon − 270 을 그대로 되돌린다
    const lon = wrapLon(270 + Math.atan2(v.x, v.z) / DEG);
    return { lat, lon };
  }

  /** 위경도(도) → 지구 로컬 좌표 (반지름 r) */
  function latLonToLocal(lat, lon, r = R_EARTH){
    const phi = (90 - lat) * DEG;
    const theta = (lon - 270) * DEG;     // localToLatLon 의 역
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(theta),
    );
  }

  /* ==========================================================================
     18 · MAGNETOSPHERE  (S7 임계점 샌드박스)
     --------------------------------------------------------------------------
     쌍극자 자력선을 베지에로 그린다. 기존 TERRA 앱(src/components/EarthSystem.jsx)의
     형태를 그대로 옮겼다 — 두 겹의 고리가 극과 극을 잇고, 세기에 따라 투명도와
     색(녹색 ↔ 네온 시안)이 변한다.

     ⚠️ tiltGroup 에 붙인다. earth 에 붙이면 자전과 함께 돌아가는데, 자기장은
     자전축을 따라 서 있는 구조물이지 지표에 박힌 물건이 아니다.
     ========================================================================== */
  const magnetoGroup = new THREE.Group();
  tiltGroup.add(magnetoGroup);
  const magnetoLines = [];
  {
    /*
     * 고리 크기.
     *
     * 원래는 지구 반지름의 1.7·3.0 배까지 뻗었는데, S7 의 카메라는 지구에 바짝
     * 붙어 있어서 **바깥 고리가 통째로 화면 밖**에 있었다. 세기에 따라 투명도가
     * 변해도 보이지 않으면 없는 것과 같다. 실제 자기권은 이보다 훨씬 크지만,
     * 이 화면이 말하려는 것은 규모가 아니라 "극과 극을 잇는 보호막이 있고,
     * 그것이 옅어지다 사라진다"이므로 프레임 안으로 들인다.
     */
    const LOOPS = 10;
    for (let i = 0; i < LOOPS; i++){
      const a = (i / LOOPS) * Math.PI * 2;
      for (const [bulge, lift, seg] of [[1.28, 1.16, 48], [1.78, 1.34, 56]]){
        const curve = new THREE.CubicBezierCurve3(
          new THREE.Vector3(0,  R_EARTH, 0),
          new THREE.Vector3(bulge * Math.cos(a),  R_EARTH * lift, bulge * Math.sin(a)),
          new THREE.Vector3(bulge * Math.cos(a), -R_EARTH * lift, bulge * Math.sin(a)),
          new THREE.Vector3(0, -R_EARTH, 0),
        );
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(seg)),
          // WebGL 은 linewidth 를 무시한다 — 굵기 대신 가산 합성으로 네온을 만든다
          /*
           * depthTest:false — 지구에 가려지지 않고 위에 겹쳐 그린다.
           * 깊이 테스트를 켜두면 고리의 대부분이 지구 뒤에 숨어 실루엣 가장자리에
           * 얇은 호 두 줄만 남는다. 자기권 도해가 늘 반투명 선을 행성 위로 지나가게
           * 그리는 이유와 같다 — 보이지 않는 보호막은 보호막으로 읽히지 않는다.
           */
          new THREE.LineBasicMaterial({
            color: 0x00f2fe, transparent: true, opacity: 0.6,
            depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
          }),
        );
        line.renderOrder = 5;   // 지구·대기 다음에 그린다
        magnetoGroup.add(line);
        magnetoLines.push(line);
      }
    }
  }

  /* 태양풍 — 태양 쪽에서 날아오는 입자. 자기장이 세면 지구를 비껴 흐르고,
     무너지면 대기를 그대로 관통한다. */
  const WIND_COUNT = 420;
  const windPos = new Float32Array(WIND_COUNT * 3);
  const windSeed = new Float32Array(WIND_COUNT * 3); // [수직오프셋, 각도, 진행도]
  for (let i = 0; i < WIND_COUNT; i++){
    windSeed[i * 3]     = (Math.random() - 0.5) * 2;   // -1..1
    windSeed[i * 3 + 1] = Math.random() * Math.PI * 2;
    windSeed[i * 3 + 2] = Math.random();
  }
  const windGeo = new THREE.BufferGeometry();
  windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
  const windMat = new THREE.PointsMaterial({
    color: 0xffd08a, size: 0.035, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const solarWind = new THREE.Points(windGeo, windMat);
  solarWind.frustumCulled = false;
  earthPivot.add(solarWind);   // 지구를 따라다니되 자전·기울기와는 무관하다
  // 자기권은 S7 에서만 켠다 — 다른 단계에 떠 있으면 그 화면이 하지 않은 말을 한다
  magnetoGroup.visible = false;
  solarWind.visible = false;

  /*
   * 자력선은 **언제나 네온 시안**이다. 세기로 바꾸는 것은 색이 아니라 투명도다.
   *
   * 예전에는 약할 때 초록(0x10b981)으로 물들었는데, 그러면 "자기장이 약하다"가
   * 색으로도 투명도로도 동시에 표현되어 둘 중 무엇이 세기를 뜻하는지 흐려진다.
   * 한 가지 변수는 한 가지 채널로만 말한다 — 여기서는 투명도다.
   */
  const FIELD_NEON = new THREE.Color(0x00f2fe);

  magnetoReady = true;

  /** 자기장 세기 (%) */
  function setMagneticField(pct){
    magneticPct = Math.max(0, Math.min(100, pct));
    const ratio = magneticPct / 100;
    for (const l of magnetoLines){
      l.material.color.copy(FIELD_NEON);          // 색은 고정
      l.material.opacity = ratio * 0.85;          // 세기 → 투명도
      // 0% 에 닿으면 선을 소멸시킨다 (0 이 아니라 '보이지 않음'이어야 한다)
      l.visible = magneticPct > 0;
    }
    windMat.opacity = 0.25 + (1 - ratio) * 0.6;
    /*
     * 대기 색 치환. 임계(20%) 위에서는 손대지 않는다 — 자기장을 조금 낮췄다고
     * 하늘이 붉어지면 그 화면은 임계라는 개념을 스스로 부정하는 셈이 된다.
     * 20% 에서 0% 사이에서만 0 → 1 로 올라가고, 0% 에서 완전한 경고 레드가 된다.
     */
    atmoU.uFieldLoss.value = Math.max(0, Math.min(1, (20 - magneticPct) / 20));
  }

  // 두 변환은 서로의 역이어야 한다. 어긋나도 '그럴듯한' 좌표가 나와서 눈으로는
  // 잡히지 않으므로, 생성 시 한 번 왕복을 확인하고 어긋나면 콘솔에 남긴다.
  for (const [lat, lon] of [[35.1, 129.03], [40.71, -74.01], [-33.87, 151.21]]){
    const back = localToLatLon(latLonToLocal(lat, lon));
    if (Math.abs(back.lat - lat) > 0.01 || Math.abs(wrapLon(back.lon - lon)) > 0.01){
      console.error('terra-engine: 위경도 변환이 서로의 역이 아니다',
                    { lat, lon, back });
    }
  }

  /* ---- 마커 -------------------------------------------------------------- */
  const markerGroup = new THREE.Group();
  markerGroup.visible = false;
  earth.add(markerGroup);
  {
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(R_EARTH * 0.018, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(R_EARTH * 0.03, R_EARTH * 0.045, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.85,
                                    side: THREE.DoubleSide, depthWrite: false }),
    );
    markerGroup.add(pin, halo);
    markerGroup.userData.halo = halo;
  }

  /** 마커를 위경도에 세운다. null 이면 감춘다. */
  function setMarker(place){
    if (!place){ markerGroup.visible = false; return; }
    const p = latLonToLocal(place.lat, place.lon, R_EARTH * 1.01);
    markerGroup.position.copy(p);
    // 링이 지표면에 눕도록 +Z 를 바깥 법선에 맞춘다.
    // lookAt 은 월드 좌표를 받으므로 여기서는 쓸 수 없다 — 마커는 earth 의 자식이다.
    markerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
    markerGroup.visible = true;
  }

  /**
   * 찍은 지점이 카메라를 향하도록 지구를 돌린다.
   *
   * 자전축 기울기·세차가 위에 걸려 있으므로 earth.rotation.y 하나로 정확히 정면에
   * 세울 수는 없다. y축 회전이 바꿀 수 있는 것은 방위각뿐이라, 방위각만 맞춘다 —
   * 지구 뷰의 카메라는 거의 적도면에 있어 이것으로 충분하다.
   */
  function faceLatLon(lat, lon){
    const local = latLonToLocal(lat, lon).normalize();
    const parent = new THREE.Matrix4().extractRotation(earth.parent.matrixWorld);
    const toCam = camera.position.clone().sub(earthPivot.position).normalize();
    const wanted = toCam.applyMatrix4(new THREE.Matrix4().copy(parent).invert());
    // Ry 는 방위각을 그대로 더한다 (Ry(θ)·(0,0,1) = (sinθ, 0, cosθ))
    earth.rotation.y = Math.atan2(wanted.x, wanted.z) - Math.atan2(local.x, local.z);
    clouds.rotation.y = earth.rotation.y;
  }

  /* ---- 포인터 ------------------------------------------------------------ */
  // 끌어서 회전한 것과 콕 찍은 것을 구분한다. 이 문턱이 없으면 시점을 돌릴 때마다
  // 지역이 바뀐다.
  const CLICK_SLOP_PX = 5;
  let down = null;

  const onPointerDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const start = down;
    down = null;
    if (!onPick || !start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(earth, false)[0];
    if (!hit) return;
    onPick(localToLatLon(earth.worldToLocal(hit.point.clone())));
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

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
      if (m.exposure !== undefined) { exposureBase = m.exposure; renderer.toneMappingExposure = m.exposure; }
    },
    setToggle(name, v){ toggles[name]?.(v); },
    setView,
    /** S0 지역 선택 — 마커를 세우고, 그 지점이 카메라를 향하도록 지구를 돌린다 */
    setMarker,
    faceLatLon,
    /**
     * 기후 색조. v ∈ [−1, 1] — 차가움 ↔ 현재 ↔ 따뜻함.
     *
     * ⚠️ 이건 **공간 분포를 그린 히트맵이 아니다.** 지금 화면이 말하고 있는 값 하나를
     * 지구 전체 색으로 옮긴 상징 표현이다. 지역별 기온 지도를 그린 것처럼 읽히면
     * 안 되므로 화면에도 그렇게 적어둔다.
     */
    setClimateTint(v){
      const t = Math.max(-1, Math.min(1, v || 0));
      const warm = Math.max(0, t), cool = Math.max(0, -t);
      // 표면색은 곱해지는 값이라 1.0 이 '원래 색'이다. 크게 흔들면 대륙이 사라진다.
      earthMat.color.setRGB(1 + warm * 0.10 - cool * 0.12,
                            1 - warm * 0.06 - cool * 0.02,
                            1 - warm * 0.16 + cool * 0.06);
      // 대기 림은 더 크게 움직여도 된다 — 지구를 감싼 띠라 정보가 가려지지 않는다
      baseAtmo.setRGB(0.36 + warm * 0.64, 0.62 - warm * 0.24 - cool * 0.10, 1.0 - warm * 0.64);
      const halo = markerGroup.userData.halo;
      if (halo) halo.material.color.setRGB(1, 0.79 - warm * 0.28, 0.30 + cool * 0.45);
    },
    /**
     * 지표 상태 — 값은 전부 0…1.
     *   ice    극지에서 자라 내려오는 빙상 (냉각의 실제 기제: 얼음–반사율 되먹임)
     *   warm   육지의 갈변 (고온·건조화)
     *   seaDry 바다가 물러나 해저가 드러남 (자기권 상실에 따른 수분 이탈)
     *
     * ⚠️ 세 값 모두 **상징 레이어**다. 지구시스템 모델의 공간 산출이 아니라,
     * 지금 화면이 말하는 상태를 지표에 옮긴 것이다. 화면에도 그렇게 적을 것.
     */
    setSurface(next){
      if (next.ice    !== undefined) surfaceTarget.ice    = Math.max(0, Math.min(1, next.ice));
      if (next.warm   !== undefined) surfaceTarget.warm   = Math.max(0, Math.min(1, next.warm));
      if (next.seaDry !== undefined) surfaceTarget.seaDry = Math.max(0, Math.min(1, next.seaDry));
      if (next.melt   !== undefined) surfaceTarget.melt   = Math.max(0, Math.min(1, next.melt));
    },
    /**
     * 결말 클로즈업 — 지구 바로 앞까지 카메라를 밀어 넣는다.
     *
     * 결말에서 판이 화면을 덮고 지구는 뒤에 조그맣게 남아 있으면, 정작 "무엇이
     * 되었는지"를 못 본 채 설명만 읽게 된다. 글보다 행성을 먼저 보여준다.
     * 끝난 뒤에는 'earth' 추적 모드가 그 프레이밍을 그대로 붙들고 간다.
     */
    cinematicCloseup(dur = 2.6){
      viewMode = 'earth';
      onViewChange?.('earth');
      transition = {
        t: 0, dur, closeup: true,
        fromPos: camera.position.clone(), toPos: null,
        fromTgt: controls.target.clone(), toTgt: null,
      };
      controls.enabled = false;
    },
    /**
     * 대기가 우주로 벗겨진 정도 (0…1).
     * 되돌아올 수 없는 결말에서만 쓴다 — 평소에는 0 이어야 한다.
     */
    setAtmosphereStripped(v){
      atmoU.uStripped.value = Math.max(0, Math.min(1, v));
    },
    /**
     * 임계를 넘은 그 순간 한 번 터뜨린다.
     * 상태가 아니라 **사건**이라 값으로 두지 않고 호출로 받는다 — 같은 임계를
     * 다시 넘으면 다시 터져야 하기 때문이다.
     */
    pulseAlert(hex = 0xff2d2d){
      pulseMat.color.set(hex);
      pulseMesh.visible = true;
      pulseT = 0;
    },
    /** 지구를 근일점에 세운다 (궤도 진행만 멈춘다) */
    setOrbitPark(v){
      orbitFrozen = !!v;
      if (v) M = 0;   // M = 0 이 근일점
    },
    /** 지표를 엔진의 에너지 균형 온도에서 직접 끌어온다 (S5 실험 구간용) */
    setSurfaceAuto(v){
      surfaceAuto = !!v;
      if (!v) { surfaceTarget.ice = 0; surfaceTarget.warm = 0; surfaceTarget.seaDry = 0; surfaceTarget.melt = 0; }
    },
    /**
     * 카메라를 지구 자전에 동행시킨다 (지구 뷰에서만 의미가 있다).
     * 켜면 지표가 화면에 멈춰 보여 클릭할 수 있고, 자전 자체는 계속된다.
     */
    setCameraFollowSpin(v){
      followSpin = !!v;
      // 동행을 끄면 감겨 있던 롤을 원위치로. 여기서 되돌리지 않으면 이후 모든
      // 단계에서 수평선이 비스듬히 남는다.
      if (!followSpin) camera.up.set(0, 1, 0);
    },
    /** 지자기 세기 (%) — 자력선 색·투명도와 태양풍 투과가 함께 움직인다 */
    setMagneticField,
    /** 자기권 레이어 표시 (S7 전용) */
    setMagnetosphereVisible(v){
      magnetoGroup.visible = !!v;
      solarWind.visible = !!v;
      if (!v){ alertMix = 0; earthU.uAtmoTint.value.copy(baseAtmo); }
    },
    /** 지구 뷰의 구도. 지구 뷰를 보고 있는 중이면 카메라를 그 자리로 옮긴다. */
    setEarthFraming(mode, animate = true, dur = 1.2){
      if (mode === earthFraming) return;
      earthFraming = mode;
      if (viewMode === 'earth') setView('earth', animate, dur);
    },
    /** 지역을 고른 뒤에는 자전을 멈춰 그 자리가 화면에 남아 있게 한다 */
    setSpin(v){ spinMul = v; },
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
