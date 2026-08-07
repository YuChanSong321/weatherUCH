/**
 * S4 · 2단계-A — 곡선에서 한 해를 지우고 사용자가 값을 찍는다.
 * 개별 연도는 어긋나도 추세 안에서는 대체로 맞는다 → "평균은 예측 가능하다"를 체감.
 */
import { useMemo, useRef, useState } from 'react'
import { YearlyChart, CHART_MARGINS } from '../components/YearlyChart'
import { yearly, yearlyTrend } from '../data/loader'
import { clamp, linearScale } from '../lib/scales'
import { useJourney } from '../state/journey'
import { S4_MAX } from '../state/journey'

const W = 960
const H = 380

/** 앞뒤로 추세를 읽을 수 있어야 하므로 양끝 6년은 출제하지 않는다 */
function pickHiddenYear(): number {
  const pool = yearly.slice(6, -6)
  return pool[Math.floor(Math.random() * pool.length)].year
}

const scoreOf = (error: number): number => {
  if (error <= 0.2) return S4_MAX
  const decay = Math.min(1, ((error - 0.2) / 1.5) ** 1.15)
  return Math.max(0, Math.round(S4_MAX * (1 - decay)))
}

export function S4YearGuess({ onNext }: { onNext: () => void }) {
  const { setYearGuess, rounds } = useJourney()
  const [hiddenYear] = useState(pickHiddenYear)
  const trend = useMemo(() => yearlyTrend(), [])

  const temps = yearly.map((r) => r.tavg)
  const yDomain: [number, number] = [
    Math.floor(Math.min(...temps) * 2) / 2 - 0.3,
    Math.ceil(Math.max(...temps) * 2) / 2 + 0.3,
  ]
  const xDomain: [number, number] = [yearly[0].year - 1, yearly[yearly.length - 1].year + 1]
  const y = linearScale(yDomain, [H - CHART_MARGINS.bottom, CHART_MARGINS.top])

  const actual = yearly.find((r) => r.year === hiddenYear)!
  const trendValue = trend.slope * hiddenYear + trend.intercept

  // 시작값은 40년 전체 평균 — 추세값에서 시작하면 정답을 흘리는 셈이 된다
  const seriesMean = temps.reduce((a, b) => a + b, 0) / temps.length
  const [guess, setGuess] = useState<number>(() => Number(seriesMean.toFixed(2)))
  const [touched, setTouched] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const svgWrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const valueFromEvent = (clientY: number): number => {
    const rect = svgWrapRef.current?.getBoundingClientRect()
    if (!rect) return guess
    const local = clientY - rect.top
    return Number(clamp(y.invert(local), yDomain[0], yDomain[1]).toFixed(2))
  }

  const handleMove = (clientY: number) => {
    if (!dragging.current || revealed) return
    setGuess(valueFromEvent(clientY))
    setTouched(true)
  }

  const submit = () => {
    const errorVsActual = Math.abs(guess - actual.tavg)
    const earned = scoreOf(errorVsActual)
    setRevealed(true)
    setYearGuess({
      year: hiddenYear,
      guess,
      actual: actual.tavg,
      trendValue,
      errorVsActual: Number(errorVsActual.toFixed(2)),
      errorVsTrend: Number(Math.abs(guess - trendValue).toFixed(2)),
      earned,
      max: S4_MAX,
    })
  }

  const errorVsActual = Math.abs(guess - actual.tavg)
  const earned = scoreOf(errorVsActual)
  const dailyMeanError =
    rounds.length > 0 ? rounds.reduce((s, r) => s + r.tmaxError, 0) / rounds.length : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-2">2단계-A · 빈 해</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {revealed ? `${hiddenYear}년의 실제 값이 도착했습니다` : `${hiddenYear}년이 지워졌습니다 — 값을 찍어보세요`}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-series-obs" /> 관측
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-act-2" /> 추세
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-act-3" /> 당신의 예측
          </span>
        </div>
      </div>

      <div className="panel p-4">
        <div
          ref={svgWrapRef}
          className={revealed ? '' : 'cursor-ns-resize'}
          onPointerDown={(e) => {
            if (revealed) return
            dragging.current = true
            setGuess(valueFromEvent(e.clientY))
            setTouched(true)
          }}
          onPointerMove={(e) => handleMove(e.clientY)}
          onPointerUp={() => {
            dragging.current = false
          }}
          onPointerLeave={() => {
            dragging.current = false
          }}
        >
          <YearlyChart
            width={W}
            height={H}
            records={yearly}
            xDomain={xDomain}
            yDomain={yDomain}
            trend={trend}
            trendVisible
            hiddenYear={revealed ? null : hiddenYear}
            highlightYear={revealed ? hiddenYear : null}
            xTicks={[1985, 1995, 2005, 2015, 2024]}
            tooltipEnabled={revealed}
          >
            {({ x }) => (
              <g>
                {/* 빈 해의 세로 안내선 */}
                <line
                  x1={x(hiddenYear)}
                  x2={x(hiddenYear)}
                  y1={CHART_MARGINS.top}
                  y2={H - CHART_MARGINS.bottom}
                  stroke="var(--color-act-3)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.55}
                />
                {/* 사용자의 예측 마커 */}
                <g style={{ transition: 'transform 90ms linear' }}>
                  <line
                    x1={x(hiddenYear) - 16}
                    x2={x(hiddenYear) + 16}
                    y1={y(guess)}
                    y2={y(guess)}
                    stroke="var(--color-act-3)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={x(hiddenYear)}
                    cy={y(guess)}
                    r={6.5}
                    fill="var(--color-act-3)"
                    stroke="var(--color-space-1)"
                    strokeWidth={2}
                  />
                  <text
                    x={x(hiddenYear) + 22}
                    y={y(guess) - 12}
                    fontSize={11.5}
                    fontWeight={600}
                    fill="var(--color-act-3)"
                    className="tnum"
                  >
                    {guess.toFixed(2)}℃
                  </text>
                </g>

                {/* 채점 후: 실제값과의 간격 */}
                {revealed && (
                  <g className="rise">
                    <line
                      x1={x(hiddenYear)}
                      x2={x(hiddenYear)}
                      y1={y(guess)}
                      y2={y(actual.tavg)}
                      stroke="var(--color-ink-2)"
                      strokeWidth={1.5}
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x(hiddenYear) - 12}
                      y={(y(guess) + y(actual.tavg)) / 2 + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill="var(--color-ink-2)"
                      className="tnum"
                    >
                      {errorVsActual.toFixed(2)}℃
                    </text>
                  </g>
                )}
              </g>
            )}
          </YearlyChart>
        </div>

        {/* 접근성 대체 입력 — 드래그 없이 키보드로도 값을 정할 수 있다 */}
        {!revealed && (
          <div className="mt-2 flex items-center gap-3 px-1">
            <span className="text-[11px] whitespace-nowrap text-ink-3">미세 조정</span>
            <input
              className="slider"
              type="range"
              min={yDomain[0]}
              max={yDomain[1]}
              step={0.01}
              value={guess}
              onChange={(e) => {
                setGuess(Number(e.target.value))
                setTouched(true)
              }}
              aria-label={`${hiddenYear}년 연평균기온 예측`}
            />
            <span className="tnum w-16 text-right text-[12px] font-semibold">{guess.toFixed(2)}℃</span>
          </div>
        )}
      </div>

      {!revealed ? (
        <div className="flex items-start justify-between gap-6">
          <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
            차트를 클릭하거나 위아래로 끌어 {hiddenYear}년의 연평균기온을 놓아보세요. 그 해의 날씨는 아무도 모릅니다 —
            하지만 앞뒤 39개의 점이 이미 말을 하고 있어요.
          </p>
          <button type="button" className="btn btn-primary shrink-0" disabled={!touched} onClick={submit}>
            {touched ? '이 값으로 확정' : '값을 먼저 놓아보세요'}
          </button>
        </div>
      ) : (
        <div className="panel flex items-start justify-between gap-6 px-5 py-4 rise">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-4">
              <span className="tnum text-[13px]">
                당신의 예측 <span className="font-semibold text-act-3">{guess.toFixed(2)}℃</span>
              </span>
              <span className="tnum text-[13px]">
                실제 <span className="font-semibold">{actual.tavg.toFixed(2)}℃</span>
              </span>
              <span className="tnum text-[13px] text-ink-2">
                추세선 값 {trendValue.toFixed(2)}℃
              </span>
              <span className="tnum text-[13px]">
                오차 <span className="font-semibold">{errorVsActual.toFixed(2)}℃</span>
              </span>
            </div>
            <p className="max-w-3xl text-[13px] leading-relaxed text-ink-2">
              {dailyMeanError !== null && (
                <>
                  1단계에서 하루 뒤 기온을 찍었을 때 평균 오차는 {dailyMeanError.toFixed(1)}℃였습니다. 지금은{' '}
                  {errorVsActual.toFixed(2)}℃고요.{' '}
                </>
              )}
              개별 연도의 날씨는 여전히 예측 불가지만, 40년의 추세가 값의 범위를 미리 좁혀두었기 때문입니다.{' '}
              <span className="text-ink-1">평균은 예측 가능합니다</span> — 이것이 기후 예측의 정체예요.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="tnum text-[22px] leading-none font-semibold text-act-2">
              +{earned}
              <span className="text-[13px] text-ink-3"> / {S4_MAX}</span>
            </span>
            <button type="button" className="btn btn-primary" onClick={onNext}>
              미래로 끌어보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
