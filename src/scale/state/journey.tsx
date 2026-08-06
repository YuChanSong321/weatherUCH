/** 여정 전역 상태 — 어느 단계에 있고, 각 단계에서 몇 점을 얻었는지. */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { RoundScore } from '../lib/forecast'

export type Stage = 's0' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7'

export const STAGE_ORDER: Stage[] = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']

/** 각 단계가 서 있는 시간 규모 (줌아웃 연출의 기준) */
export const STAGE_SCALE: Record<Stage, { act: 1 | 2 | 3; scaleLabel: string; caption: string }> = {
  s0: { act: 1, scaleLabel: '며칠', caption: '부산 · 하루 뒤' },
  s1: { act: 1, scaleLabel: '며칠', caption: '부산 · 하루 뒤' },
  s2: { act: 1, scaleLabel: '한 해', caption: '부산 · 1년' },
  s3: { act: 2, scaleLabel: '수십 년', caption: '부산 · 40년' },
  s4: { act: 2, scaleLabel: '수십 년', caption: '부산 · 40년' },
  s5: { act: 2, scaleLabel: '100년', caption: '부산 · 2100년까지' },
  s6: { act: 3, scaleLabel: '수만 년', caption: '지구 · 20만 년' },
  s7: { act: 3, scaleLabel: '전체', caption: '며칠 → 수만 년' },
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
  rounds: RoundScore[]
  pushRound: (r: RoundScore) => void
  yearGuess: YearGuessResult | null
  setYearGuess: (r: YearGuessResult) => void
  orbitResult: OrbitMissionResult | null
  setOrbitResult: (r: OrbitMissionResult) => void
  /** 사용자가 S5에서 직접 끌어본 2100년 값 (기억해서 S7에서 회수) */
  dragged2100: number | null
  setDragged2100: (v: number) => void
  totals: { earned: number; max: number }
  restart: () => void
}

const JourneyContext = createContext<JourneyValue | null>(null)

export const S1_MAX = 280 // R1 100 + R2 100 + R3 80
export const S4_MAX = 100
export const S6_MAX = 120
export const TOTAL_MAX = S1_MAX + S4_MAX + S6_MAX

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('s0')
  const [rounds, setRounds] = useState<RoundScore[]>([])
  const [yearGuess, setYearGuessState] = useState<YearGuessResult | null>(null)
  const [orbitResult, setOrbitResultState] = useState<OrbitMissionResult | null>(null)
  const [dragged2100, setDragged2100State] = useState<number | null>(null)
  const [runId, setRunId] = useState(0)

  const go = useCallback((s: Stage) => {
    setStage(s)
  }, [])

  const next = useCallback(() => {
    setStage((s) => STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, STAGE_ORDER.indexOf(s) + 1)])
  }, [])

  const pushRound = useCallback((r: RoundScore) => {
    setRounds((prev) => [...prev.filter((p) => p.round !== r.round), r].sort((a, b) => a.round - b.round))
  }, [])

  const restart = useCallback(() => {
    setRounds([])
    setYearGuessState(null)
    setOrbitResultState(null)
    setDragged2100State(null)
    setRunId((n) => n + 1)
    setStage('s0')
  }, [])

  const value = useMemo<JourneyValue>(() => {
    const earned =
      rounds.reduce((s, r) => s + r.earned, 0) + (yearGuess?.earned ?? 0) + (orbitResult?.earned ?? 0)
    return {
      stage,
      runId,
      go,
      next,
      rounds,
      pushRound,
      yearGuess,
      setYearGuess: setYearGuessState,
      orbitResult,
      setOrbitResult: setOrbitResultState,
      dragged2100,
      setDragged2100: setDragged2100State,
      totals: { earned, max: TOTAL_MAX },
      restart,
    }
  }, [stage, runId, go, next, rounds, pushRound, yearGuess, orbitResult, dragged2100, restart])

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}

export function useJourney(): JourneyValue {
  const ctx = useContext(JourneyContext)
  if (!ctx) throw new Error('useJourney 는 JourneyProvider 안에서만 쓸 수 있다')
  return ctx
}
