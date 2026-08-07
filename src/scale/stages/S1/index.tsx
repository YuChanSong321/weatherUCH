/**
 * S1 · 1단계 — 날씨 맞히기 3라운드.
 * 사용자 권한: '관찰자'. 데이터를 읽고 하루 뒤를 찍는다.
 */
import { useState } from 'react'
import { GuessPanel } from './GuessPanel'
import { ObservationCard } from './ObservationCard'
import { RoundResult } from './RoundResult'
import { S1Summary } from './S1Summary'
import { scoreRound, type ForecastCase, type Guess, type RoundScore } from '../../lib/forecast'
import { useJourney } from '../../state/journey'

type Phase = { kind: 'guess' } | { kind: 'result'; guess: Guess; score: RoundScore } | { kind: 'summary' }

export function S1Forecast({ cases }: { cases: ForecastCase[] }) {
  const { rounds, pushRound, next } = useJourney()
  const [roundIndex, setRoundIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'guess' })

  const forecastCase = cases[roundIndex]
  const isLastRound = roundIndex === cases.length - 1

  const handleSubmit = (guess: Guess) => {
    const score = scoreRound(forecastCase, guess)
    pushRound(score)
    setPhase({ kind: 'result', guess, score })
  }

  const handleNext = () => {
    if (isLastRound) {
      setPhase({ kind: 'summary' })
    } else {
      setRoundIndex((i) => i + 1)
      setPhase({ kind: 'guess' })
    }
  }

  if (phase.kind === 'summary') {
    return <S1Summary rounds={rounds} onNext={next} />
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-1">1단계 · 며칠 앞</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            관측만 보고 내일을 찍어봅시다
          </h1>
        </div>
        <RoundDots count={cases.length} current={roundIndex} done={rounds.map((r) => r.round)} />
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
            이날 부산에는 {forecastCase.todayAdvisory.kind}가 발효 중이었습니다 —{' '}
            {forecastCase.todayAdvisory.headline}
          </span>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
        <ObservationCard forecastCase={forecastCase} />
        {phase.kind === 'guess' ? (
          <GuessPanel key={forecastCase.today.date} forecastCase={forecastCase} onSubmit={handleSubmit} />
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

function RoundDots({ count, current, done }: { count: number; current: number; done: number[] }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: count }, (_, i) => {
        const isDone = done.includes((i + 1) as 1 | 2 | 3)
        const isCurrent = i === current
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full transition-colors"
              style={{
                background: isDone ? 'var(--color-act-1)' : isCurrent ? 'var(--color-ink-1)' : 'rgb(255 255 255 / 0.18)',
                boxShadow: isCurrent ? '0 0 10px var(--color-ink-1)' : undefined,
              }}
            />
            <span className={`text-[11px] ${isCurrent ? 'text-ink-1' : 'text-ink-3'}`}>R{i + 1}</span>
          </div>
        )
      })}
    </div>
  )
}
