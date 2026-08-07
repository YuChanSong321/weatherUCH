/**
 * 밀란코비치 3요소 → 일사량 계산 (단순화 모델, 데이터 파일 없이 물리식으로 직접 계산).
 *
 * 하루 평균 일사량 (Berger 1978 의 표준 식):
 *   Q = (S0/π) · (a/r)² · (H₀·sinφ·sinδ + cosφ·cosδ·sinH₀)
 *   δ  = asin(sin ε · sin λ)              적위 (λ = 태양의 황경, 춘분 = 0°)
 *   H₀ = acos(−tanφ · tanδ)               일몰 시각각 (백야/극야는 경계로 처리)
 *   r/a = (1 − e²) / (1 + e·cos(λ − ϖ))   ϖ = ω + 180° (근일점의 태양황경)
 *
 * 세차각 ω 는 기후학 관례를 따른다: 현재 값 102.9° 는 근일점이 1월 초(태양황경 약
 * 283°)에 온다는 뜻이다. 이 180° 를 빼먹으면 "6월에 태양과 가장 가깝다"는 반대
 * 결론이 나오므로 주의. 이 구현의 현재 지구 하지 일사량은 478 W/m² 로,
 * 문헌값(약 480 W/m²)과 일치한다.
 *
 * 빙하기 논의에서 관습적으로 쓰는 지표인 "북위 65°의 여름(하지) 일사량"을 미션
 * 목표로 삼는다. 여름이 서늘하면 눈이 녹지 않고 쌓여 빙하가 자란다.
 */

export type OrbitParams = {
  /** 궤도 이심률 (0 = 완전한 원) */
  eccentricity: number
  /** 자전축 기울기 (도) — 연교차의 진폭을 정한다 */
  obliquity: number
  /** 근일점 경도 ω (도) — 세차. 어느 계절에 태양과 가까워지는지를 정한다 */
  precession: number
}

export const S0 = 1361 // 태양 상수 (W/m²)
export const MISSION_LAT = 65 // 북위 65° — 대륙 빙상이 자라는 위도

/** 현재 지구 */
export const PRESENT: OrbitParams = { eccentricity: 0.0167, obliquity: 23.44, precession: 102.9 }

/** 지질시대 동안 실제로 오간 범위 + 주기 */
export const RANGES = {
  eccentricity: { min: 0.0, max: 0.058, step: 0.001, cycle: '약 10만 년' },
  obliquity: { min: 22.1, max: 24.5, step: 0.05, cycle: '약 4.1만 년' },
  precession: { min: 0, max: 360, step: 1, cycle: '약 2.6만 년' },
} as const

const RAD = Math.PI / 180

/** 위도 φ, 태양 황경 λ 에서의 하루 평균 일사량 (W/m²) */
export function dailyInsolation(latDeg: number, lambdaDeg: number, p: OrbitParams): number {
  const phi = latDeg * RAD
  const lambda = lambdaDeg * RAD
  const eps = p.obliquity * RAD
  const omega = p.precession * RAD

  const delta = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const perihelion = omega + Math.PI // 근일점의 태양황경
  const rho = (1 - p.eccentricity ** 2) / (1 + p.eccentricity * Math.cos(lambda - perihelion))

  const cosH0 = -Math.tan(phi) * Math.tan(delta)
  if (cosH0 >= 1) return 0 // 극야
  const H0 = cosH0 <= -1 ? Math.PI : Math.acos(cosH0) // 백야 포함

  const term = H0 * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(H0)
  return (S0 / Math.PI) * (1 / rho ** 2) * term
}

/** 북위 65° 하지(λ=90°) 일사량 — 미션 지표 */
export const summerInsolation = (p: OrbitParams): number => dailyInsolation(MISSION_LAT, 90, p)

/** 북위 65° 동지(λ=270°) 일사량 */
export const winterInsolation = (p: OrbitParams): number => dailyInsolation(MISSION_LAT, 270, p)

/** 부산 위도 — 연교차 진폭을 여기서 읽는다 (여정의 출발지로 되돌아오는 연결선) */
export const BUSAN_LAT = 35.1

/** 1년 일사량 곡선 (λ 0~360°, n 샘플) */
export function seasonalCurve(p: OrbitParams, latDeg = MISSION_LAT, n = 73): Array<{ lambda: number; q: number }> {
  return Array.from({ length: n }, (_, i) => {
    const lambda = (i / (n - 1)) * 360
    return { lambda, q: dailyInsolation(latDeg, lambda, p) }
  })
}

/**
 * 연교차 진폭 — 부산 위도에서 여름(하지)과 겨울(동지) 일사량의 차.
 * 북위 65°는 극야 때문에 겨울값이 0에 붙어 진폭이 둔감하다. 중위도에서 재야
 * 자전축 기울기의 효과가 그대로 드러난다.
 */
export const annualAmplitude = (p: OrbitParams): number =>
  dailyInsolation(BUSAN_LAT, 90, p) - dailyInsolation(BUSAN_LAT, 270, p)

export const PRESENT_SUMMER = summerInsolation(PRESENT)

/** 조작 가능한 범위의 양 끝 (게이지 스케일용) */
export const SUMMER_BOUNDS = (() => {
  let min = Infinity
  let max = -Infinity
  for (const e of [RANGES.eccentricity.min, RANGES.eccentricity.max]) {
    for (const o of [RANGES.obliquity.min, RANGES.obliquity.max]) {
      for (let w = 0; w < 360; w += 5) {
        const q = summerInsolation({ eccentricity: e, obliquity: o, precession: w })
        if (q < min) min = q
        if (q > max) max = q
      }
    }
  }
  return { min, max }
})()

export type MissionId = 'glaciate' | 'deglaciate'

/** 난이도 균형: 현재 지구에서 양쪽 한계까지 거리의 55% 지점을 목표로 둔다 */
const REACH = 0.55
const COLD_TARGET = PRESENT_SUMMER - REACH * (PRESENT_SUMMER - SUMMER_BOUNDS.min)
const WARM_TARGET = PRESENT_SUMMER + REACH * (SUMMER_BOUNDS.max - PRESENT_SUMMER)

export type Mission = {
  id: MissionId
  title: string
  goal: string
  /** 성공 판정: 현재 여름 일사량이 이 값 이하(glaciate) / 이상(deglaciate) */
  threshold: number
  direction: 'below' | 'above'
  hint: string
  success: string
}

export const MISSIONS: Record<MissionId, Mission> = {
  glaciate: {
    id: 'glaciate',
    title: '빙하기를 유발하라',
    goal: `북위 65° 여름 일사량을 ${COLD_TARGET.toFixed(0)} W/m² 이하로 낮춰보세요`,
    threshold: COLD_TARGET,
    direction: 'below',
    hint: '여름이 서늘해야 눈이 녹지 않습니다. 자전축을 눕히고(기울기↓), 여름에 태양과 멀어지도록 세차를 돌려보세요.',
    success:
      '여름이 서늘해졌습니다. 고위도의 눈이 여름을 버티고 쌓이기 시작합니다 — 빙상이 자라고, 흰 표면이 햇빛을 더 되쏘아 스스로를 키웁니다.',
  },
  deglaciate: {
    id: 'deglaciate',
    title: '빙하기를 끝내라',
    goal: `북위 65° 여름 일사량을 ${WARM_TARGET.toFixed(0)} W/m² 이상으로 올려보세요`,
    threshold: WARM_TARGET,
    direction: 'above',
    hint: '여름을 뜨겁게 만들어야 빙상이 녹습니다. 자전축을 더 세우고(기울기↑), 여름에 태양과 가까워지도록 세차를 맞춘 뒤, 이심률로 그 효과를 증폭해보세요.',
    success:
      '여름이 뜨거워졌습니다. 빙상이 물러나고 해수면이 오릅니다 — 지구는 간빙기로 들어섰어요. 우리가 사는 시대가 바로 여기입니다.',
  },
}

export const isMissionMet = (mission: Mission, q: number): boolean =>
  mission.direction === 'below' ? q <= mission.threshold : q >= mission.threshold

/** 슬라이더 하나하나가 지금 목표에 도움이 되는지 (실시간 코칭용) */
export function contribution(mission: Mission, p: OrbitParams, key: keyof OrbitParams, delta: number): number {
  const bumped = { ...p, [key]: p[key] + delta }
  const before = summerInsolation(p)
  const after = summerInsolation(bumped)
  const gain = after - before
  return mission.direction === 'below' ? -gain : gain
}
