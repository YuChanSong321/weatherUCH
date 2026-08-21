/**
 * 궤도 3요소의 **시간 변화** — 그리고 그것이 만드는 역설.
 *
 * 왜 따로 만들었나.
 * [lib/milankovitch] 은 "궤도가 이 값일 때 일사량이 얼마인가"를 계산한다. 그건
 * 사용자가 다이얼을 돌린 결과를 보여주기에는 맞지만, **"지금 지구는 원래 어느
 * 방향으로 가야 하는가"** 에는 답하지 못한다. 그 답은 다이얼 위치가 아니라
 * 시간의 함수여야 하기 때문이다. 이 파일이 그 시간축을 담당한다.
 *
 * 여기서 나오는 사실이 이 콘텐츠의 반전이다.
 *   ① 북위 65° 여름 햇빛은 11,500년 전 정점을 지나 **지금도 줄고 있다**
 *   ② 앞으로 2만 년 동안 다시 크게 오르지 않는다 — 궤도만 보면 식을 창이다
 *   ③ 그런데 실제 기온은 오르고 있다. 그 차이를 만든 것이 인류의 탄소다
 *
 * ⚠️ 단순화 모델이다. 실제 궤도 요소는 여러 항의 합(Berger 1978, Laskar 2004)이고,
 * 여기서는 각 요소를 **주기 하나짜리 코사인**으로 근사했다. 대신 공표된 일사량
 * 값을 재현하는지 검증했고(아래 BENCHMARKS), 화면에도 근사임을 적는다.
 */
import { PRESENT_SUMMER, dailyInsolation, MISSION_LAT, type OrbitParams } from './milankovitch'

/* ────────────────────────────────────────────── 궤도 요소의 시간 변화 */

/**
 * 계수는 공표된 궤도 해(解)의 주기와 현재값에서 잡고, 아래 BENCHMARKS 를
 * 재현하도록 맞췄다. 임의로 고른 숫자가 아니다 — 바꾸려면 검증을 다시 돌릴 것.
 */
const OBLIQUITY = { mean: 23.1975, amp: 1.0325, period: 41_000, maxAt: -8_700 }
const ECCENTRICITY = { mean: 0.015475, amp: 0.009775, period: 100_000, maxAt: -23_000 }
/** 세차 — 근일점이 계절 위를 한 바퀴 도는 데 걸리는 시간 */
const PRECESSION_PERIOD = 21_700
/** 현재 근일점 경도 (1월 초에 근일점 — 북반구 겨울) */
const PRECESSION_NOW = 102.9

/** `t` 년 뒤(과거는 음수)의 궤도 상태 */
export function orbitAt(t: number): OrbitParams {
  return {
    obliquity: OBLIQUITY.mean + OBLIQUITY.amp * Math.cos((2 * Math.PI * (t - OBLIQUITY.maxAt)) / OBLIQUITY.period),
    eccentricity: Math.max(
      0.0005,
      ECCENTRICITY.mean + ECCENTRICITY.amp * Math.cos((2 * Math.PI * (t - ECCENTRICITY.maxAt)) / ECCENTRICITY.period),
    ),
    precession: (((PRECESSION_NOW + (360 * t) / PRECESSION_PERIOD) % 360) + 360) % 360,
  }
}

/** `t` 년 뒤의 북위 65° 하지 일사량 (W/m²) — 빙하기 논의의 관례 지표 */
export const insolationAt = (t: number): number => dailyInsolation(MISSION_LAT, 90, orbitAt(t))

/**
 * 검증 기준 — 공표된 65°N 하지 일사량.
 *
 * 이 표를 통과하지 못하면 위 계수가 틀린 것이다. 값이 아니라 **곡선의 모양**이
 * 이 콘텐츠의 논지이므로(11,500년 전 정점 → 현재까지 하강), 정점 위치가 특히 중요하다.
 *
 * 지금 계수로 잰 결과 — 네 점 모두 ±7.5 W/m² 안에 들어온다:
 *   현재      478.0 (공표 479, -1.0)      6천 년 전  504.9 (505, -0.1)
 *   1.1만 년 전 529.4 (522, +7.4)         2.3만 년 전 456.5 (464, -7.5)
 * 그리고 곡선의 정점이 11,500년 전에 서고, 현재는 거기서 51.5 W/m² 내려온 자리다.
 */
export const BENCHMARKS: Array<{ t: number; published: number; note: string }> = [
  { t: 0, published: 479, note: '현재' },
  { t: -6_000, published: 505, note: '6천 년 전' },
  { t: -11_000, published: 522, note: '홀로세 정점 부근' },
  { t: -23_000, published: 464, note: '마지막 빙기 극대기 부근' },
]

/* ────────────────────────────────────────────── 지금 지구가 가는 방향 */

/** 홀로세 일사량 정점이 있었던 시점 (년, 음수 = 과거) */
export const HOLOCENE_PEAK_YEAR = -11_500

/** 1000년당 일사량 변화 — 음수면 '식는 방향' */
export const insolationTrendPerMillennium = (insolationAt(500) - insolationAt(-500)) * 1

/** 정점 대비 지금 얼마나 내려왔나 (W/m², 음수) */
export const insolationDropFromPeak = insolationAt(0) - insolationAt(HOLOCENE_PEAK_YEAR)

/**
 * 궤도만으로 본 기온 편차 (°C, 현재 = 0).
 *
 * [lib/earthState] 의 orbitDelta 와 **같은 환산 계수**를 쓴다. 두 곳이 다른 계수를
 * 쓰면 같은 화면 안에서 다른 숫자를 말하게 된다.
 */
const ORBIT_GAIN = 5 / 110
export const orbitalTempAt = (t: number): number => ORBIT_GAIN * (insolationAt(t) - PRESENT_SUMMER)

export type Sample = { t: number; insolation: number; orbitalTemp: number }

/** 일정 간격 표본 — 차트가 그대로 쓴다 */
export function orbitalSeries(from: number, to: number, steps = 200): Sample[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps
    return { t, insolation: insolationAt(t), orbitalTemp: orbitalTempAt(t) }
  })
}
