/**
 * S1 · 1단계 — 날씨 맞히기 3라운드 (총 100점).
 * 사용자 권한: '관찰자'. S0 에서 찍은 지역의 관측만 읽고 앞날을 찍는다.
 *
 * 세 라운드가 **같은 상황**을 본다 (기획안 §3 S1). 라운드마다 묻는 것만 달라진다:
 *   R1 내일 최고기온 50 · R2 내일 강수 30 · R3 3일 뒤 최고기온 20
 */
import { useEffect, useState } from 'react'
import { GuessPanel } from './GuessPanel'
import { ObservationCard } from './ObservationCard'
import { RoundResult } from './RoundResult'
import { S1Summary } from './S1Summary'
import { useGlobe } from '../../components/GlobeLayer'
import {
  caseOf,
  scoreRound,
  type Guess,
  type RoundNumber,
  type RoundScore,
  type Situation,
} from '../../lib/forecast'
import { useJourney } from '../../state/journey'
import { usePlace } from '../../state/place'

type Phase = { kind: 'guess' } | { kind: 'result'; guess: Guess; score: RoundScore }

const ROUNDS: RoundNumber[] = [1, 2, 3]

export function S1Forecast({ situation }: { situation: Situation }) {
  const { rounds, pushRound, next } = useJourney()
  const { place } = usePlace()
  const { setView } = useGlobe()
  const [roundIndex, setRoundIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'guess' })
  const [done, setDone] = useState(false)

  const round = ROUNDS[roundIndex]
  const forecastCase = caseOf(situation, round)
  const isLastRound = roundIndex === ROUNDS.length - 1

  /*
   * 기획안: "라운드마다 지구본 카메라가 해당 지역으로 줌인한다."
   * 지역을 향한 정렬은 GlobeLayer 가 이미 맡고 있으므로, 여기서는 라운드가 넘어갈
   * 때마다 지구 뷰를 다시 잡아 그 움직임이 눈에 보이게 한다.
   */
  useEffect(() => {
    setView('earth', true, 1.4)
  }, [roundIndex, setView])

  const handleSubmit = (guess: Guess) => {
    const score = scoreRound(forecastCase, guess)
    pushRound(score)
    setPhase({ kind: 'result', guess, score })
  }

  const handleNext = () => {
    if (isLastRound) {
      setDone(true)
    } else {
      setRoundIndex((i) => i + 1)
      setPhase({ kind: 'guess' })
    }
  }

  if (done) return <S1Summary rounds={rounds} onNext={next} />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-1">
            1단계 · 며칠 앞 {place && <span className="text-ink-3">· {place.label}</span>}
          </div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            관측만 보고 앞날을 찍어봅시다
          </h1>
        </div>
        <RoundDots current={roundIndex} done={rounds.map((r) => r.round)} />
      </div>

      {/* 기상특보 배지. '오늘'의 특보다 — 정답인 내일의 특보를 미리 보여주면
          호우주의보 한 줄이 강수 4지선다의 답을 그대로 알려주게 된다. */}
      {forecastCase.todayAdvisory && (
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] leading-none"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-warn) 45%, transparent)',
            background: 'color-mix(in oklab, var(--color-warn) 12%, transparent)',
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--color-warn)' }}>
            {forecastCase.todayAdvisory.kind}
          </span>
          <span className="text-ink-2">
            이날 {place?.label ?? '이 지역'}에는 {forecastCase.todayAdvisory.kind}가 발효 중이었습니다 —{' '}
            {forecastCase.todayAdvisory.headline}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ObservationCard forecastCase={forecastCase} />
        {phase.kind === 'guess' ? (
          <GuessPanel key={round} forecastCase={forecastCase} onSubmit={handleSubmit} />
        ) : (
          <RoundResult
            forecastCase={forecastCase}
            guess={phase.guess}
            score={phase.score}
            isLastRound={isLastRound}
            onNext={handleNext}
          />
        )}
      </div>
    </div>
  )
}

const DOT_LABEL: Record<RoundNumber, string> = { 1: '기온', 2: '강수', 3: '3일 뒤' }

function RoundDots({ current, done }: { current: number; done: number[] }) {
  return (
    <div className="flex items-center gap-3">
      {ROUNDS.map((r, i) => {
        const isDone = done.includes(r)
        const isCurrent = i === current
        return (
          <div key={r} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full transition-colors"
              style={{
                background: isDone ? 'var(--color-act-1)' : isCurrent ? 'var(--color-ink-1)' : 'rgb(255 255 255 / 0.18)',
                boxShadow: isCurrent ? '0 0 10px var(--color-ink-1)' : undefined,
              }}
            />
            <span className={`text-[11px] ${isCurrent ? 'text-ink-1' : 'text-ink-3'}`}>{DOT_LABEL[r]}</span>
          </div>
        )
      })}
    </div>
  )
}
