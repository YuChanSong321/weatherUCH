/**
 * 돌아올 수 없는 지점 — 무엇이 실제로 일어나는가.
 *
 * ⚠️ 지구는 폭발하지 않는다.
 * 궤도를 아무리 찌그러뜨리고 자기장을 통째로 지워도, 행성을 부술 에너지는 어디에도
 * 없다. 지구를 조각내려면 중력 결합에너지 약 2.2×10³² J 이 필요하고 그건 태양이
 * 일주일 동안 지구로 보내는 전체 에너지의 수천만 배다. "폭발"은 극적이지만 거짓이고,
 * 이 콘텐츠에서 거짓은 연출로도 쓰지 않는다.
 *
 * 대신 **실제로 돌이킬 수 없는 두 갈래**가 있다. 둘 다 태양계 안에서 이미 일어난 일이다.
 *
 *   화성 경로 — 자기 차폐를 잃으면 태양풍이 상층 대기를 직접 깎아낸다. 이온이
 *     태양풍에 실려 나가고, 물은 광분해되어 수소가 우주로 달아난다. 화성이 약
 *     40억 년 전 이 길을 걸었다. 지구는 그대로 있고 껍데기만 벗겨진다.
 *
 *   금성 경로 — 연평균 일사량이 폭주 온실 문턱(약 1.1배)을 넘으면 바다가 증발하고,
 *     수증기가 다시 온실효과를 키워 남은 바다까지 끓인다. 되먹임이라 한 번 걸리면
 *     스스로 멈추지 않는다. 금성이 그렇게 됐다.
 *
 * ✘ 지각 융용은 쓰지 않는다.
 *   이심률 0.9 의 근일점(0.10 AU)에서도 평형온도는 약 532℃ 다. 납(327℃)과
 *   아연(420℃)은 녹지만 현무암(약 1000~1200℃)은 녹지 않는다. 용암 연출은
 *   그래서 고증 위반이다 — 엔진에 melt 유니폼이 있어도 여기서는 건드리지 않는다.
 */
import { THRESHOLDS } from './earthState'
import type { SurfaceState } from './surfaceState'

/** 자기장이 완전히 사라진 값 (%) */
export const MAGNETIC_GONE = 0

/**
 * 폭주 온실이 걸리는 이심률.
 *
 * 연평균 일사량은 1/√(1−e²) 배다. 폭주 온실 문턱은 대략 현재의 1.1 배이고,
 * e = 0.5 에서 1.155 배가 되어 문턱을 넘는다. 이 아래에서는 계절이 험해질 뿐
 * 바다를 잃지 않는다 — 그래서 여기가 "돌아올 수 없는 선"이다.
 */
export const ECC_RUNAWAY = 0.5

/** 연평균 일사량 배율 */
export const meanFluxAt = (e: number): number => 1 / Math.sqrt(1 - e * e)

/** 되돌릴 시간 (초) — 이 안에 다이얼을 물리면 아무 일도 일어나지 않는다 */
export const GRACE_SECONDS = 6

export type CollapseKind = 'mars' | 'venus'

export type CollapseState = {
  kind: CollapseKind
  /** 경고 배너에 쓰는 한 줄 */
  warning: string
  /** 끝난 뒤의 제목 */
  title: string
  /** 실제로 무슨 일이 일어났는가 */
  mechanism: string
  /** 현실의 시간 규모 — 이걸 빼면 화면이 "즉시 일어난다"고 거짓말한다 */
  timescale: string
  /** 무엇이 사실이 아닌가 (연출과 사실의 경계) */
  caveat: string
  /** 이 결말의 지표 상태 */
  surface: SurfaceState
}

/**
 * 지금 상태가 되돌아올 수 없는 선을 넘었는가.
 *
 * 자전축은 단독으로 여기 들어오지 않는다. 기울기가 90° 라도(천왕성이 그렇다)
 * 계절이 극단으로 갈릴 뿐 행성이 죽지는 않는다 — 그걸 파국이라 부르면 거짓이다.
 */
export function collapseFor(p: {
  magneticField: number
  eccentricity: number
}): CollapseState | null {
  if (p.eccentricity >= ECC_RUNAWAY) {
    const flux = meanFluxAt(p.eccentricity)
    return {
      kind: 'venus',
      warning: `연평균 일사량이 폭주 온실 문턱을 넘었습니다 (${flux.toFixed(2)}배)`,
      title: '바다가 사라졌습니다 — 금성이 걸었던 길입니다',
      mechanism:
        '연평균 일사량이 현재의 1.1배를 넘으면 바다가 증발하기 시작합니다. 그런데 수증기 자체가 강력한 온실기체라, 증발할수록 더 더워지고 더 더워질수록 더 증발합니다. 스스로를 밀어 올리는 되먹임이라 한 번 걸리면 멈추지 않아요. 마지막 한 방울까지 증발한 뒤에는 수증기가 상층에서 광분해되고 수소가 우주로 달아나, 물이 돌아올 길 자체가 사라집니다.',
      timescale: '바다가 끓어 없어지는 데 수백만 년, 수소가 다 빠져나가는 데 수억 년.',
      caveat:
        '지각은 녹지 않습니다. 이심률 0.9의 근일점에서도 표면은 약 532℃ 로, 납은 녹지만 현무암(약 1000℃)은 멀쩡합니다. 용암 바다는 이 시나리오에 없습니다.',
      surface: { ice: 0, warm: 1, seaDry: 1 },
    }
  }
  if (p.magneticField <= MAGNETIC_GONE) {
    return {
      kind: 'mars',
      warning: '자기 차폐가 완전히 사라졌습니다 — 대기가 우주로 벗겨지기 시작합니다',
      title: '대기를 잃었습니다 — 화성이 걸었던 길입니다',
      mechanism:
        '자기권이 사라지면 태양풍이 상층 대기를 직접 때립니다. 이온화된 공기 입자가 붙들릴 자기장이 없어 태양풍에 실려 그대로 쓸려 나가고(이온 픽업), 물은 상층에서 자외선에 쪼개져 가벼운 수소가 먼저 달아납니다. 대기압이 떨어지면 남은 물은 액체로 있지 못하고 끓거나 얼어붙습니다. 화성이 약 40억 년 전에 밟은 경로예요.',
      timescale: '대부분을 잃는 데 수억 년. 화성은 그 과정에 약 5억 년이 걸렸습니다.',
      caveat:
        '지구가 부서지는 것이 아닙니다. 암석 행성 본체는 그대로 남고 껍데기(대기와 물)만 벗겨집니다. 폭발은 일어나지 않아요 — 지구를 조각내려면 태양이 지구로 보내는 에너지의 수천만 배가 필요합니다.',
      surface: { ice: 0.35, warm: 0.85, seaDry: 1 },
    }
  }
  return null
}

/** 그 결말에서 대기가 얼마나 남는가 (0 = 그대로, 1 = 완전히 벗겨짐) */
export const atmosphereLossOf = (k: CollapseKind): number => (k === 'mars' ? 1 : 0.25)

/** 경고 단계에서 아직 임계 안쪽이라면 되돌릴 여지가 있다 */
export const isRecoverable = (p: { magneticField: number; eccentricity: number }): boolean =>
  collapseFor(p) === null

/** 표시용 — 임계값을 화면에 그대로 적는다 */
export const COLLAPSE_LIMITS = {
  magnetic: `${MAGNETIC_GONE}%`,
  eccentricity: ECC_RUNAWAY.toFixed(2),
  warnMagnetic: `${THRESHOLDS.magneticCollapse}%`,
} as const
