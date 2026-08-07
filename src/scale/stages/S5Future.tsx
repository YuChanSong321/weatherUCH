/**
 * S5 · 2단계-B — 사용자가 곡선을 2100년까지 끌어 연장한다.
 * 손을 떼면 SSP 세 시나리오가 부채꼴로 펼쳐진다: 미래는 하나의 선이 아니다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CHART_MARGINS, YearlyChart } from '../components/YearlyChart'
import { scenarios, sspBaseline, sspRegion, yearly, yearlyTrend } from '../data/loader'
import { clamp, linearScale, smoothPath } from '../lib/scales'
import { useJourney } from '../state/journey'

const W = 960
const H = 400
const LAST_YEAR = 2100

export function S5Future({ onNext }: { onNext: () => void }) {
  const { setDragged2100 } = useJourney()
  const trend = useMemo(() => yearlyTrend(), [])
  const lastObs = yearly[yearly.length - 1]
  /** 부채의 경첩 — 최근 10년 평균. 관측·사용자 연장선·시나리오가 모두 여기서 출발한다. */
  const hinge = useMemo(() => {
    const last10 = yearly.slice(-10)
    return last10.reduce((s, r) => s + r.tavg, 0) / last10.length
  }, [])
  /** 관측 추세를 그대로 2100년까지 밀었을 때의 값 */
  const naiveExtension = hinge + trend.slope * (LAST_YEAR - lastObs.year)

  const yDomain: [number, number] = [13.5, 22.5]
  const xDomain: [number, number] = [yearly[0].year - 1, LAST_YEAR + 1]
  const y = linearScale(yDomain, [H - CHART_MARGINS.bottom, CHART_MARGINS.top])

  const [endValue, setEndValue] = useState<number>(Number(hinge.toFixed(2)))
  const [touched, setTouched] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [fan, setFan] = useState(0) // 0 → 1 부채꼴 펼침 진행도
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!revealed) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400)
      setFan(t < 1 ? 1 - (1 - t) ** 3 : 1)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [revealed])

  const valueFrom = (clientY: number): number => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return endValue
    return Number(clamp(y.invert(clientY - rect.top), yDomain[0], yDomain[1]).toFixed(2))
  }

  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    if (touched && !revealed) {
      setRevealed(true)
      setDragged2100(endValue)
    }
  }

  /** 사용자의 선이 어느 시나리오에 가장 가까운가 */
  const nearest = useMemo(() => {
    let best = scenarios[0]
    let bestGap = Infinity
    for (const s of scenarios) {
      const gap = Math.abs(s.points[s.points.length - 1].tavg - endValue)
      if (gap < bestGap) {
        bestGap = gap
        best = s
      }
    }
    return { scenario: best, gap: bestGap }
  }, [endValue])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-2">2단계-B · 미래</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {revealed ? '미래는 하나의 선이 아닙니다' : '이 곡선을 2100년까지 끌어보세요'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-series-obs" /> 관측 {yearly[0].year}–{lastObs.year}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-act-3" /> 당신의 연장선
          </span>
          {revealed &&
            scenarios.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
        </div>
      </div>

      <div className="panel p-4">
        <div
          ref={wrapRef}
          className={revealed ? '' : 'cursor-ns-resize'}
          onPointerDown={(e) => {
            if (revealed) return
            dragging.current = true
            setEndValue(valueFrom(e.clientY))
            setTouched(true)
          }}
          onPointerMove={(e) => {
            if (!dragging.current || revealed) return
            setEndValue(valueFrom(e.clientY))
            setTouched(true)
          }}
          onPointerUp={release}
          onPointerLeave={release}
        >
          <YearlyChart
            width={W}
            height={H}
            records={yearly}
            xDomain={xDomain}
            yDomain={yDomain}
            trend={trend}
            trendVisible={false}
            xTicks={[2000, 2025, 2050, 2075, 2100]}
            tooltipEnabled={false}
          >
            {({ x }) => {
              const clipW = Math.max(0, (x(LAST_YEAR) - x(2024)) * fan)
              return (
                <g>
                  {/* 최근 10년 평균 = 부채의 경첩 */}
                  <line
                    x1={x(lastObs.year - 9)}
                    x2={x(lastObs.year)}
                    y1={y(hinge)}
                    y2={y(hinge)}
                    stroke="var(--color-act-2)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  <text
                    x={x(lastObs.year - 9) - 6}
                    y={y(hinge) - 10}
                    textAnchor="end"
                    fontSize={10.5}
                    fill="var(--color-act-2)"
                    className="tnum"
                  >
                    최근 10년 평균 {hinge.toFixed(1)}℃
                  </text>
                  {/* 관측/전망 경계 */}
                  <line
                    x1={x(lastObs.year)}
                    x2={x(lastObs.year)}
                    y1={CHART_MARGINS.top}
                    y2={H - CHART_MARGINS.bottom}
                    stroke="rgb(255 255 255 / 0.18)"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={x(lastObs.year) - 6}
                    y={CHART_MARGINS.top + 10}
                    textAnchor="end"
                    fontSize={10.5}
                    fill="var(--color-ink-3)"
                  >
                    관측 끝
                  </text>

                  {/* 시나리오 부채꼴 — 클립 사각형이 오른쪽으로 열린다 */}
                  <defs>
                    <clipPath id="fan-clip">
                      <rect x={x(2024)} y={0} width={clipW} height={H} />
                    </clipPath>
                  </defs>
                  {revealed && (
                    <g clipPath="url(#fan-clip)">
                      {scenarios.map((s) => {
                        const pts = [
                          [x(lastObs.year), y(hinge)] as [number, number],
                          ...s.points.map((p) => [x(p.year), y(p.tavg)] as [number, number]),
                        ]
                        const hi = s.points.map((p) => [x(p.year), y(p.high)] as [number, number])
                        const lo = s.points.map((p) => [x(p.year), y(p.low)] as [number, number]).reverse()
                        const band = `${smoothPath(hi)} L${lo[0][0]} ${lo[0][1]} ${smoothPath(lo).slice(1)} Z`
                        return (
                          <g key={s.id}>
                            <path d={band} fill={s.color} opacity={0.16} />
                            <path
                              d={smoothPath(pts)}
                              fill="none"
                              stroke={s.color}
                              strokeWidth={2}
                              strokeLinecap="round"
                            />
                          </g>
                        )
                      })}
                    </g>
                  )}

                  {/* 시나리오 직접 라벨 */}
                  {revealed &&
                    fan > 0.85 &&
                    scenarios.map((s) => {
                      const last = s.points[s.points.length - 1]
                      return (
                        <text
                          key={`lbl-${s.id}`}
                          x={x(LAST_YEAR) + 8}
                          y={y(last.tavg) + 4}
                          fontSize={11}
                          fontWeight={600}
                          fill={s.color}
                          className="tnum"
                        >
                          {s.label}
                        </text>
                      )
                    })}

                  {/* 사용자의 연장선 */}
                  <line
                    x1={x(lastObs.year)}
                    x2={x(LAST_YEAR)}
                    y1={y(hinge)}
                    y2={y(endValue)}
                    stroke="var(--color-act-3)"
                    strokeWidth={2.5}
                    strokeDasharray={revealed ? '6 5' : undefined}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={x(LAST_YEAR)}
                    cy={y(endValue)}
                    r={7}
                    fill="var(--color-act-3)"
                    stroke="var(--color-space-1)"
                    strokeWidth={2}
                  />
                  {!revealed && (
                    <text
                      x={x(LAST_YEAR) - 12}
                      y={y(endValue) - 14}
                      textAnchor="end"
                      fontSize={11.5}
                      fontWeight={600}
                      fill="var(--color-act-3)"
                      className="tnum"
                    >
                      2100년 {endValue.toFixed(2)}℃
                    </text>
                  )}
                </g>
              )
            }}
          </YearlyChart>
        </div>

        {!revealed && (
          <div className="mt-2 flex items-center gap-3 px-1">
            <span className="text-[11px] whitespace-nowrap text-ink-3">2100년 값</span>
            <input
              className="slider"
              type="range"
              min={yDomain[0]}
              max={yDomain[1]}
              step={0.05}
              value={endValue}
              onChange={(e) => {
                setEndValue(Number(e.target.value))
                setTouched(true)
              }}
              aria-label="2100년 연평균기온 연장값"
            />
            <button
              type="button"
              className="btn btn-primary shrink-0 px-5 py-2 text-[13px]"
              disabled={!touched}
              onClick={() => {
                setRevealed(true)
                setDragged2100(endValue)
              }}
            >
              손 떼기
            </button>
          </div>
        )}
      </div>

      {!revealed ? (
        <p className="max-w-4xl text-[13.5px] leading-relaxed text-ink-2">
          관측 추세를 그대로 밀면 2100년은 {naiveExtension.toFixed(1)}℃입니다. 하지만 그건 지난 40년의 속도가 그대로
          유지된다는 가정이에요. 어디에 점을 놓으시겠어요? 끌었다가 손을 떼면 과학이 계산한 답이 펼쳐집니다.
        </p>
      ) : (
        <div className="panel flex items-start justify-between gap-6 px-5 py-4 rise">
          <div className="flex flex-col gap-2">
            <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
              당신이 놓은 2100년은 <span className="tnum font-semibold text-act-3">{endValue.toFixed(2)}℃</span> —{' '}
              <span style={{ color: nearest.scenario.color }} className="font-semibold">
                {nearest.scenario.label}
              </span>{' '}
              경로와 가장 가깝습니다 ({nearest.scenario.description}).
              <br />
              미래는 하나의 선이 아니라 <span className="text-ink-1">갈라지는 부채</span>입니다. 세 갈래는 물리가 아니라
              배출량 선택이 만들어요 — <span className="text-ink-1">어느 갈래인지는 인간의 선택</span>입니다.
            </p>
            <p className="text-[11px] text-ink-3">
              {sspRegion} 시나리오 · 기준 {sspBaseline.period} 평균 {sspBaseline.tavg}℃ · 음영은 불확실성 범위
            </p>
          </div>
          <button type="button" className="btn btn-primary shrink-0" onClick={onNext}>
            그런데 이 기후를 움직이는 건 무엇일까요
          </button>
        </div>
      )}
    </div>
  )
}
