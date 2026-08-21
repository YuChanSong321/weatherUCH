/** 여정 전역 상태 — 어느 단계에 있고, 각 단계에서 몇 점을 얻었는지. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { S1_TOTAL, type RoundScore } from '../lib/forecast'

export type Stage = 's0' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'

export const STAGE_ORDER: Stage[] = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']

/**
 * 각 단계가 서 있는 시간 규모.
 *
 * ⚠️ 이 목록은 **단조 증가**여야 한다. 이 콘텐츠의 전제가 "하루에서 수만 년까지
 * 한 방향으로 물러나는 줌아웃"이고, 상단 시간 자의 마커가 그 사실을 계속 보여주기
 * 때문이다. 기획안 §3 의 순서(수만 년 → 200년 → 2100년)를 그대로 따르면 마커가
 * 뒤로 되돌아가면서 그 전제가 깨진다. 그래서 화면 순서를 규모 순으로 다시 놓았다:
 *
 *   며칠 → 한 해 → 수십 년 → 100년(SSP) → 수만 년(궤도) → 임계 → 전체 겹쳐보기
 *
 * 마지막 단계가 '전체'인 것은 되돌아가는 것이 아니라, 물러날 만큼 물러난 자리에서
 * 274년과 5만 년을 한 화면에 겹쳐 보는 것이다 (로그 시간축).
 *
 * caption 의 `{place}` 는 사용자가 S0 에서 고른 지역 이름으로 치환된다.
 * 여기에 '부산'을 박아두면 호놀룰루를 고른 사람에게 부산이라고 말하게 된다.
 */
export const STAGE_SCALE: Record<Stage, { act: 1 | 2 | 3; scaleLabel: string; caption: string }> = {
  s0: { act: 1, scaleLabel: '지금', caption: '지구 · 내가 사는 곳' },
  s1: { act: 1, scaleLabel: '며칠', caption: '{place} · 하루 뒤' },
  s2: { act: 1, scaleLabel: '한 해', caption: '{place} · 1년' },
  s3: { act: 2, scaleLabel: '수십 년', caption: '{place} · 40년' },
  s4: { act: 2, scaleLabel: '수십 년', caption: '{place} · 40년' },
  s5: { act: 2, scaleLabel: '100년', caption: '{place} · 2100년까지' },
  s6: { act: 3, scaleLabel: '수만 년', caption: '지구 · 궤도 20만 년' },
  s7: { act: 3, scaleLabel: '임계', caption: '지구 · 자기권' },
  s8: { act: 3, scaleLabel: '전체', caption: '274년 vs 5만 년' },
}

export type YearGuessResult = {
  year: number
  guess: number
  actual: number
  trendValue: number
  errorVsActual: number
  errorVsTrend: number
  earned: number
  max: number
}

/**
 * 사용자가 조작 **전에** 먼저 찍은 값들.
 *
 * 이걸 따로 들고 있는 이유: 조작만 있고 판정이 없는 화면은 심심하다. 레버를 당기기
 * 전에 답을 받아두면 같은 조작이 곧 정답 공개가 되고, 그 값이 뒤 단계까지 따라가
 * "내가 만든 것이 남는다"는 감각을 만든다.
 */
export type YearMeanGuess = {
  year: number
  guess: number
  actual: number
}

export type TrendGuess = {
  /** 사용자가 찍은 10년당 기온 변화 (℃) */
  perDecade: number
  /** 실제 관측 추세 (℃/10년) */
  actualPerDecade: number
}

export type OrbitMissionResult = {
  missionId: string
  success: boolean
  secondsLeft: number
  earned: number
  max: number
}

type JourneyValue = {
  stage: Stage
  /** 다시하기를 누르면 증가 — 출제를 새로 뽑는 신호 */
  runId: number
  go: (stage: Stage) => void
  next: () => void
  /*
   * 복습용 앞뒤 이동.
   *
   * 여정은 한 방향으로 흐르지만, 지나온 단계를 다시 볼 길이 없으면 한 마디를
   * 놓친 사람은 처음부터 다시 하는 수밖에 없다. 그래서 **가본 곳까지만** 자유롭게
   * 오간다 — 앞질러 가는 것은 막는다(안 푼 단계의 점수가 비어 이야기가 깨진다).
   */
  back: () => void
  forward: () => void
  canBack: boolean
  canForward: boolean
  rounds: RoundScore[]
  pushRound: (r: RoundScore) => void
  yearGuess: YearGuessResult | null
  setYearGuess: (r: YearGuessResult) => void
  orbitResult: OrbitMissionResult | null
  setOrbitResult: (r: OrbitMissionResult) => void
  /** S2 — 레버를 당기기 전에 찍은 그 해의 연평균 */
  yearMeanGuess: YearMeanGuess | null
  setYearMeanGuess: (g: YearMeanGuess) => void
  /** S3 — 스크러빙 절반에서 찍은 40년 추세. S4·S5 가 이 값을 회수한다. */
  trendGuess: TrendGuess | null
  setTrendGuess: (g: TrendGuess) => void
  /** 사용자가 S5에서 직접 끌어본 2100년 값 (기억해서 S7에서 회수) */
  dragged2100: number | null
  setDragged2100: (v: number) => void
  totals: { earned: number; max: number }
  restart: () => void
}

const JourneyContext = createContext<JourneyValue | null>(null)

/*
 * 배점 — 기획안 §6 의 확정 체계 320점.
 *
 * S1 의 100 점은 [lib/forecast] 의 라운드 배점(50/30/20)에서 그대로 읽는다. 두 곳에
 * 따로 적어두면 한쪽만 바뀌었을 때 획득 점수가 만점을 넘는다.
 *
 * ORBIT_MISSION_MAX 는 지금 S5 밀란코비치 미션이 쓰고 있다. Phase 5 에서 이 120점이
 * S7 자기장 샌드박스로 넘어간다 (총점은 그대로).
 */
export const S1_MAX = S1_TOTAL
export const S4_MAX = 100
export const ORBIT_MISSION_MAX = 120
export const TOTAL_MAX = S1_MAX + S4_MAX + ORBIT_MISSION_MAX

/** 발표/디버그용: 주소창의 #s5 같은 해시로 특정 단계에서 바로 시작한다. */
function initialStage(): Stage {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '')
  return (STAGE_ORDER as string[]).includes(hash) ? (hash as Stage) : 's0'
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(initialStage)
  /** 지금까지 도달한 가장 먼 단계 — 앞으로 가기가 여기까지만 열린다 */
  const [maxStage, setMaxStage] = useState<Stage>(initialStage)
  const [rounds, setRounds] = useState<RoundScore[]>([])
  const [yearGuess, setYearGuessState] = useState<YearGuessResult | null>(null)
  const [orbitResult, setOrbitResultState] = useState<OrbitMissionResult | null>(null)
  const [yearMeanGuess, setYearMeanGuessState] = useState<YearMeanGuess | null>(null)
  const [trendGuess, setTrendGuessState] = useState<TrendGuess | null>(null)
  const [dragged2100, setDragged2100State] = useState<number | null>(null)
  const [runId, setRunId] = useState(0)

  const go = useCallback((s: Stage) => {
    setStage(s)
    setMaxStage((m) => (STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(m) ? s : m))
  }, [])

  // 이미 열려 있는 화면에서 주소의 해시만 바꿔도 그 단계로 이동한다 (발표 중 점프용)
  useEffect(() => {
    const onHashChange = () => {
      const s = initialStage()
      setStage(s)
      setMaxStage((m) => (STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(m) ? s : m))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const next = useCallback(() => {
    setStage((s) => {
      const n = STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, STAGE_ORDER.indexOf(s) + 1)]
      setMaxStage((m) => (STAGE_ORDER.indexOf(n) > STAGE_ORDER.indexOf(m) ? n : m))
      return n
    })
  }, [])

  const back = useCallback(() => {
    setStage((s) => STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(s) - 1)])
  }, [])

  /** 복습을 마치고 원래 있던 자리로 — 가본 곳을 넘어가지는 않는다 */
  const forward = useCallback(() => {
    setStage((s) => {
      const i = Math.min(STAGE_ORDER.indexOf(maxStage), STAGE_ORDER.indexOf(s) + 1)
      return STAGE_ORDER[Math.max(0, i)]
    })
  }, [maxStage])

  const pushRound = useCallback((r: RoundScore) => {
    setRounds((prev) => [...prev.filter((p) => p.round !== r.round), r].sort((a, b) => a.round - b.round))
  }, [])

  const restart = useCallback(() => {
    setRounds([])
    setYearGuessState(null)
    setOrbitResultState(null)
    setYearMeanGuessState(null)
    setTrendGuessState(null)
    setDragged2100State(null)
    setRunId((n) => n + 1)
    setStage('s0')
    setMaxStage('s0')
    // 딥링크 해시를 지운다 — 남겨두면 새로고침 시 그 단계로 되돌아간다
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  const value = useMemo<JourneyValue>(() => {
    const earned =
      rounds.reduce((s, r) => s + r.earned, 0) + (yearGuess?.earned ?? 0) + (orbitResult?.earned ?? 0)
    return {
      stage,
      runId,
      go,
      next,
      back,
      forward,
      canBack: STAGE_ORDER.indexOf(stage) > 0,
      canForward: STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(maxStage),
      rounds,
      pushRound,
      yearGuess,
      setYearGuess: setYearGuessState,
      orbitResult,
      setOrbitResult: setOrbitResultState,
      yearMeanGuess,
      setYearMeanGuess: setYearMeanGuessState,
      trendGuess,
      setTrendGuess: setTrendGuessState,
      dragged2100,
      setDragged2100: setDragged2100State,
      totals: { earned, max: TOTAL_MAX },
      restart,
    }
  }, [stage, maxStage, runId, go, next, back, forward, rounds, pushRound, yearGuess, orbitResult, yearMeanGuess, trendGuess, dragged2100, restart])

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}

export function useJourney(): JourneyValue {
  const ctx = useContext(JourneyContext)
  if (!ctx) throw new Error('useJourney 는 JourneyProvider 안에서만 쓸 수 있다')
  return ctx
}
