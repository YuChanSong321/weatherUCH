/**
 * 지구본 텍스처 6장을 NASA 원본에서 다시 만든다.
 *
 *   node --version   # 20 이상
 *   npm i sharp
 *   node scripts/build_textures.mjs
 *
 * 결과는 public/textures/ 에 떨어진다 (약 5.6 MB). 저장소에 이미 커밋되어 있으므로
 * 평소에는 돌릴 일이 없다 — 원본을 갱신하거나 해상도를 바꿀 때만 쓴다.
 *
 * 출처·라이선스·가공 내역은 public/textures/CREDITS.md 에 정리되어 있다.
 * 이 스크립트를 고치면 그 문서도 함께 고칠 것.
 */
import sharp from 'sharp'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'scripts', 'raw', 'textures')   // .gitignore 대상
const OUT = join(ROOT, 'public', 'textures')
mkdirSync(SRC, { recursive: true })
mkdirSync(OUT, { recursive: true })

const EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords'
const SOURCES = {
  day:    `${EO}/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg`,
  elev:   `${EO}/73000/73934/gebco_08_rev_elev_21600x10800.png`,
  clouds: `${EO}/57000/57747/cloud_combined_2048.jpg`,
  night:  `${EO}/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg`,
  sky:    'https://svs.gsfc.nasa.gov/vis/a000000/a003500/a003572/TychoSkymapII.t5_04096x02048.jpg',
}

sharp.cache(false)
const LP = { limitInputPixels: false }

async function download(name, url) {
  const ext = url.endsWith('.png') ? 'png' : 'jpg'
  const path = join(SRC, `${name}.${ext}`)
  if (existsSync(path)) { console.log(`  캐시 사용  ${name}.${ext}`); return path }
  process.stdout.write(`  내려받는 중 ${name} … `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(path, buf)
  console.log(`${(buf.length / 1048576).toFixed(1)} MB`)
  return path
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

console.log('1) NASA 원본 확보')
const src = {}
for (const [k, url] of Object.entries(SOURCES)) src[k] = await download(k, url)

console.log('\n2) 가공')

// day — Blue Marble Next Generation
await sharp(src.day, LP).resize(4096, 2048, { kernel: 'lanczos3' })
  .jpeg({ quality: 84, mozjpeg: true }).toFile(join(OUT, 'day.jpg'))
console.log('  day.jpg     4096×2048')

// bump — GEBCO 고도 램프 (해수면 = 0)
await sharp(src.elev, LP).resize(4096, 2048, { kernel: 'lanczos3' })
  .greyscale().jpeg({ quality: 88, mozjpeg: true }).toFile(join(OUT, 'bump.jpg'))
console.log('  bump.jpg    4096×2048  (그레이스케일)')

// water — 위 고도맵에서 파생한 해수면 마스크 (흰색 = 물 = 반사)
{
  const W = 2048, H = 1024
  const { data } = await sharp(src.elev, LP).resize(W, H, { kernel: 'lanczos3' })
    .greyscale().raw().toBuffer({ resolveWithObject: true })
  const mask = Buffer.alloc(W * H)
  for (let i = 0; i < data.length; i++) mask[i] = data[i] === 0 ? 255 : 0
  // 해안선을 살짝 흐려 스펙큘러 경계의 계단 현상을 없앤다
  await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(0.7).png({ compressionLevel: 9, palette: true }).toFile(join(OUT, 'water.png'))
  console.log('  water.png   2048×1024  (고도 0 = 물)')
}

// clouds — 휘도를 알파로. 극관 얼음 오분류를 위도로 눌러 준다
{
  const W = 2048, H = 1024
  const { data } = await sharp(src.clouds, LP).resize(W, H, { kernel: 'lanczos3' })
    .greyscale().raw().toBuffer({ resolveWithObject: true })
  const rgba = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) / H * 180
    /*
     * NASA cloud_combined 는 극관의 얼음·눈을 구름으로 잡는다(남극 평균 알파 211).
     * 그대로 두면 지구본 극지에 불투명한 흰 고리가 씌워져 그 아래 빙상이 가려진다.
     */
    const polar = 1 - 0.78 * smoothstep(70, 86, Math.abs(lat))
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 255
      // 옅은 안개를 걷어내는 완만한 커브 — 바다가 뿌옇게 덮이지 않게 한다
      rgba[o + 3] = Math.min(255, Math.round(255 * Math.pow(data[i] / 255, 1.35) * polar))
    }
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 }).toFile(join(OUT, 'clouds.png'))
  console.log('  clouds.png  2048×1024  (휘도 → 알파, 극지 감쇠)')
}

// night — Black Marble 2012
await sharp(src.night, LP).resize(3600, 1800, { kernel: 'lanczos3' })
  .jpeg({ quality: 82, mozjpeg: true }).toFile(join(OUT, 'night.jpg'))
console.log('  night.jpg   3600×1800')

// sky — Tycho Catalog Skymap 2.0, 성운기를 눌러 별점만 남긴다
{
  /*
   * 원본은 240만 개 항성에 은하수 확산광까지 그대로 들어 있어, 배경으로 깔면
   * 화면 전체가 회색으로 뿌옇게 덮인다("난잡하다"). 배경은 배경이어야 하므로
   * 중간톤을 눌러 성운기를 걷어내고 밝은 별점만 남긴다.
   *
   *   out = in^K · GAIN     K 가 클수록 중간톤이 검게 내려앉는다
   *
   * 별을 통째로 줄이지 않는 이유: 엔진에는 시차 별밭 레이어가 따로 있어서
   * (terra-engine.js 의 3 · SPACE), 이 텍스처는 어두워도 하늘이 비지 않는다.
   */
  const K = 3.6
  const GAIN = 1.6
  const { data, info } = await sharp(src.sky, LP)
    .resize(4096, 2048, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true })
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) lut[i] = Math.min(255, Math.round(255 * Math.pow(i / 255, K) * GAIN))
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) out[i] = lut[data[i]]
  await sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .jpeg({ quality: 80, mozjpeg: true }).toFile(join(OUT, 'sky.jpg'))
  console.log('  sky.jpg     4096×2048  (성운기 억제 K=' + K + ')')
}

console.log('\n완료 — public/textures/ 확인')
