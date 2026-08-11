/**
 * 장기(수만 년) 자연 기온 곡선과 인류의 탄소 곡선 — S5·S6 이 함께 쓰는 모델.
 *
 * ⚠️ 자연 곡선은 **교육용 단순화 모델**이다 (기획안 §6 확정). 실제 밀란코비치
 * 수치 적분이 아니라, 북위 65° 하지 일사량의 편차를 전지구 평균기온으로 옮기는
 * 한 줄짜리 환산이다. 도착 시점(수만 년)과 크기의 정확도는 보장하지 않는다.
 *
 * 기획안 §3 S5 는 "어느 쪽으로 돌려도 완만한 냉각"을 요구하지만, 그렇게 만들지
 * 않았다. 자전축을 세우면 고위도 여름 일사량이 실제로 늘고(478 → 507 W/m²),
 * 그건 빙하가 물러나는 방향이다. 출력을 0 이하로 잘라내면 화면이 사실과 어긋나고,
 * 같은 화면 하단의 대시보드 기온과도 어긋난다 — 실제로 어긋나 있었다.
 *
 * 대신 이 콘텐츠의 논지는 **방향이 아니라 속도**로 선다: 자연이 만드는 폭은
 * 어느 쪽이든 만 년 단위로 도착하고, 인류는 같은 크기를 270년에 만들었다.
 * 그 대조는 S6 에서 두 곡선을 같은 축에 놓는 것만으로 증명된다.
 *
 * 반대로 탄소 곡선 쪽은 지어내지 않는다. CO₂ 농도는 공표된 관측·복원값이고,
 * 기온은 [lib/earthState] 의 복사강제력 식을 그대로 쓴다.
 */
import { co2Warming, orbitDelta, PREINDUSTRIAL_CO2, PRESENT_CO2 } from './earthState'
import { SUMMER_BOUNDS, summerInsolation, type OrbitParams } from './milankovitch'

/** 자연 곡선이 내다보는 시간 (년) */
export const NATURAL_HORIZON_YEARS = 50_000

export type CurvePoint = { year: number; delta: number }

/**
 * S5 의 두 슬라이더(자전축·이심률)만으로 실제 도달 가능한 하지 일사량 범위.
 *
 * ⚠️ 전체 범위(SUMMER_BOUNDS)로 정규화하면 안 된다. 그쪽은 세차까지 360° 돌려본
 * 범위(421–577 W/m²)인데, S5 에는 세차 슬라이더가 없다. 세차를 현재값으로 고정한
 * 채 전체 범위로 나누면 두 슬라이더를 끝에서 끝까지 밀어도 지표가 0.4–0.5 언저리를
 * 벗어나지 못해 **슬라이더가 죽은 것처럼 느껴진다.** 실제로 그랬다.
 */
const reachableCache = new Map<number, { min: number; max: number }>()
function reachableBounds(precession: number): { min: number; max: number } {
  const hit = reachableCache.get(precession)
  if (hit) return hit
  let min = Infinity
  let max = -Infinity
  for (const e of [0.005, 0.06]) {
    for (const o of [22.1, 24.5]) {
      const q = summerInsolation({ eccentricity: e, obliquity: o, precession })
      if (q < min) min = q
      if (q > max) max = q
    }
  }
  const bounds = { min, max }
  reachableCache.set(precession, bounds)
  return bounds
}

/**
 * 궤도 상태가 얼마나 '따뜻한' 배치인가 (0 = 가장 서늘, 1 = 가장 따뜻).
 * 지표는 빙하기 논의의 관례대로 북위 65° 하지 일사량이다.
 */
export function orbitalWarmth(p: OrbitParams): number {
  const q = summerInsolation(p)
  const b = reachableBounds(p.precession)
  const span = b.max - b.min
  if (span < 1e-6) return 0.5
  return Math.min(1, Math.max(0, (q - b.min) / span))
}

/** 전체(세차 포함) 범위 — 다른 화면이 쓰는 절대 기준 */
export const FULL_SUMMER_BOUNDS = SUMMER_BOUNDS

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/**
 * 향후 5만 년의 자연 기온 곡선 (현재 지구 = 0℃ 기준).
 *
 * 끝점은 [lib/earthState] 의 orbitDelta 와 **같은 함수**다. 대시보드의 기온과
 * 이 곡선이 서로 다른 모델을 쓰면 한 화면 안에서 다른 숫자를 말하게 된다.
 */
export function naturalAt(p: OrbitParams, year: number): number {
  const end = orbitDelta(p)
  const t = Math.max(0, Math.min(1, year / NATURAL_HORIZON_YEARS))
  // 4.1만 년 자전축 주기가 남기는 잔물결. 뒤로 갈수록 커지게 두어, 곡선이
  // 자로 그은 직선이 아니라 '주기가 실린 추세'로 읽히게 한다.
  const wobble = 0.28 * Math.sin((2 * Math.PI * year) / 41_000) * t
  return end * smoothstep(t) + wobble
}

export function naturalCurve(p: OrbitParams, steps = 60): CurvePoint[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const year = (i / steps) * NATURAL_HORIZON_YEARS
    return { year, delta: naturalAt(p, year) }
  })
}

/**
 * 로그 시간축용 표본 — 1년부터 5만 년까지 자릿수마다 고르게.
 * 선형 표본을 로그 축에 얹으면 왼쪽 절반이 텅 비고 곡선이 화면 중간에서 갑자기
 * 시작한 것처럼 보인다.
 */
export function naturalCurveLog(p: OrbitParams, steps = 90): CurvePoint[] {
  const lo = 0 // log10(1)
  const hi = Math.log10(NATURAL_HORIZON_YEARS)
  return Array.from({ length: steps + 1 }, (_, i) => {
    const year = 10 ** (lo + ((hi - lo) * i) / steps)
    return { year, delta: naturalAt(p, year) }
  })
}

/**
 * 이 궤도 배치가 도달하는 자연 기온 편차 (°C) — 문장에 그대로 쓰는 값.
 * 곡선 끝점의 잔물결을 뺀 추세값이라, 대시보드의 궤도 기여분과 정확히 같다.
 */
export const naturalEndDelta = (p: OrbitParams): number => orbitDelta(p)

/* ────────────────────────────────────────────────── 인류의 탄소 곡선 (S6) */

/**
 * 전지구 평균 CO₂ 농도 (ppm).
 *
 * 1750–1950 은 남극 빙하 코어(Law Dome) 복원값, 1960 이후는 마우나로아 관측을
 * 따르는 공표 연평균이다. 곡선 모양을 만들기 위한 임의값이 아니라, 이 앵커들
 * 사이를 선형 보간해서 쓴다.
 */
export const CO2_ANCHORS: { year: number; ppm: number }[] = [
  { year: 1750, ppm: 277 },
  { year: 1850, ppm: 285 },
  { year: 1900, ppm: 296 },
  { year: 1950, ppm: 311 },
  { year: 1970, ppm: 325 },
  { year: 1990, ppm: 354 },
  { year: 2000, ppm: 369 },
  { year: 2010, ppm: 389 },
  { year: 2020, ppm: 414 },
  { year: 2024, ppm: PRESENT_CO2 },
]

export function co2At(year: number): number {
  const a = CO2_ANCHORS
  if (year <= a[0].year) return a[0].ppm
  if (year >= a[a.length - 1].year) return a[a.length - 1].ppm
  for (let i = 1; i < a.length; i++) {
    if (year <= a[i].year) {
      const t = (year - a[i - 1].year) / (a[i].year - a[i - 1].year)
      return a[i - 1].ppm + t * (a[i].ppm - a[i - 1].ppm)
    }
  }
  return a[a.length - 1].ppm
}

export const CARBON_START_YEAR = CO2_ANCHORS[0].year
export const CARBON_END_YEAR = CO2_ANCHORS[CO2_ANCHORS.length - 1].year

/**
 * 산업화 이후 기온 곡선 (산업화 이전 = 0℃ 기준).
 * CO₂ 농도를 [lib/earthState] 의 복사강제력 식에 그대로 넣는다.
 */
export function carbonCurve(steps = 80): CurvePoint[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const year = CARBON_START_YEAR + (i / steps) * (CARBON_END_YEAR - CARBON_START_YEAR)
    return { year: year - CARBON_END_YEAR, delta: co2Warming(co2At(year)) }
  })
}

/** 산업화 이전 → 현재의 상승분 (°C) */
export const carbonWarmingNow = (): number => co2Warming(PRESENT_CO2) - co2Warming(PREINDUSTRIAL_CO2)
