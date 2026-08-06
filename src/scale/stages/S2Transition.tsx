/**
 * S2 · 전환 — S1에서 만졌던 그 해의 일별 점들이 월평균으로, 다시 연평균 하나로 압축된다.
 * "이게 날씨입니다 → 이것이 기후입니다"를 말이 아니라 움직임으로 보여주는 구간.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChartFrame } from '../components/ChartFrame'
import { daily, monthlyNormals, yearly } from '../data/loader'
import { linearScale, niceTicks, smoothPath } from '../lib/scales'

const W = 960
const H = 380
const M = { top: 20, right: 28, bottom: 34, left: 46 }

const MONTH_CENTER = [15.5, 46, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5]

const PHASES = [
  {
    title: '365개의 점',
    body: '하루하루의 기온이다. 당신이 방금 맞히려 했던 것 — 이것이 날씨다. 가까이서 보면 위아래로 마구 튄다.',
  },
  {
    title: '월별로 묶으면',
    body: '흩어진 점들 뒤에서 계절이 드러난다. 개별 날짜는 예측할 수 없어도, 7월이 1월보다 덥다는 것은 틀릴 수 없다.',
  },
  {
    title: '1년을 하나의 숫자로',
    body: '365일을 눌러 평균 하나로 만들면 날씨는 사라지고 기후가 남는다. 이제 이 점을 40년 동안 찍어보자.',
  },
] as const

export function S2Transition({ year, onNext }: { year: number; onNext: () => void }) {
  const [phase, setPhase] = useState(0)

  const model = useMemo(() => {
    const records = daily.filter((r) => r.date.startsWith(String(year)))
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const rows = records.filter((r) => Number(r.date.slice(5, 7)) === m + 1)
      return rows.reduce((s, r) => s + r.tavg, 0) / (rows.length || 1)
    })
    const yearMean = yearly.find((r) => r.year === year)?.tavg ?? records.reduce((s, r) => s + r.tavg, 0) / records.length
    return { records, monthly, yearMean }
  }, [year])

  useEffect(() => {
    if (phase >= PHASES.length - 1) return
    const delay = phase === 0 ? 2600 : 3400
    const t = window.setTimeout(() => setPhase((p) => p + 1), delay)
    return () => window.clearTimeout(t)
  }, [phase])

  const temps = model.records.map((r) => r.tavg)
  const yDomain: [number, number] = [Math.floor(Math.min(...temps) - 1), Math.ceil(Math.max(...temps) + 1)]
  const x = linearScale([1, 366], [M.left, W - M.right])
  const y = linearScale(yDomain, [H - M.bottom, M.top])
  const yTicks = niceTicks(yDomain[0], yDomain[1], 5)

  const doyOf = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z')
    const start = Date.UTC(d.getUTCFullYear(), 0, 1)
    return Math.floor((d.getTime() - start) / 86400000) + 1
  }

  const monthPts = model.monthly.map((v, i) => [x(MONTH_CENTER[i]), y(v)] as [number, number])
  const normalPts = monthlyNormals.map((n, i) => [x(MONTH_CENTER[i]), y(n.tavg)] as [number, number])
  const meanX = x(183)
  const meanY = y(model.yearMean)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-1">전환 · 날씨에서 기후로</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {PHASES[phase].title}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          <span>부산 · {year}년 일평균기온</span>
          <div className="flex items-center gap-1.5">
            {PHASES.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full transition-colors"
                style={{ background: i <= phase ? 'var(--color-act-1)' : 'rgb(255 255 255 / 0.18)' }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <ChartFrame
          width={W}
          height={H}
          margins={M}
          x={x}
          y={y}
          xTicks={phase === 0 ? MONTH_CENTER.filter((_, i) => i % 2 === 0) : MONTH_CENTER}
          yTicks={yTicks}
          xTickFormat={(v) => `${MONTH_CENTER.indexOf(v) + 1}월`}
          yTickFormat={(v) => `${v}`}
          yUnit="℃"
        >
          {/* 평년값 곡선 — 비교 기준선 (관측과 다른 역할이므로 점선 처리) */}
          <path
            d={smoothPath(normalPts)}
            fill="none"
            stroke="var(--color-ink-3)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={phase >= 1 ? 0.85 : 0}
            style={{ transition: 'opacity 700ms ease' }}
          />
          {phase >= 1 && (
            <text
              x={monthPts[6][0] + 6}
              y={normalPts[6][1] - 10}
              fontSize={10.5}
              fill="var(--color-ink-3)"
              style={{ transition: 'opacity 700ms ease' }}
            >
              평년값 1991–2020
            </text>
          )}

          {/* 월평균 곡선 (그 해의 계절 곡선) */}
          <path
            d={smoothPath(monthPts)}
            fill="none"
            stroke="var(--color-series-obs)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={phase === 1 ? 1 : 0}
            style={{ transition: 'opacity 700ms ease' }}
          />

          {/* 일별 점 → 월평균 → 연평균으로 이동 */}
          {model.records.map((r, i) => {
            const doy = doyOf(r.date)
            const month = Number(r.date.slice(5, 7)) - 1
            const pos =
              phase === 0
                ? [x(doy), y(r.tavg)]
                : phase === 1
                  ? [x(MONTH_CENTER[month]), y(model.monthly[month])]
                  : [meanX, meanY]
            return (
              <circle
                key={r.date}
                r={phase === 0 ? 2.2 : phase === 1 ? 2.6 : 3}
                fill="var(--color-series-obs)"
                opacity={phase === 0 ? 0.5 : phase === 1 ? 0.32 : 0.16}
                style={{
                  transform: `translate(${pos[0]}px, ${pos[1]}px)`,
                  transition: `transform 1100ms cubic-bezier(0.16,1,0.3,1) ${(i % 31) * 12}ms, opacity 700ms ease, r 700ms ease`,
                }}
              />
            )
          })}

          {/* 연평균 한 점 */}
          <g opacity={phase === 2 ? 1 : 0} style={{ transition: 'opacity 800ms ease 500ms' }}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={meanY}
              y2={meanY}
              stroke="var(--color-act-2)"
              strokeWidth={1.5}
              strokeDasharray="2 5"
              opacity={0.7}
            />
            <circle cx={meanX} cy={meanY} r={7} fill="var(--color-act-2)" stroke="var(--color-space-1)" strokeWidth={2} />
            <text x={meanX + 14} y={meanY - 10} fontSize={12.5} fontWeight={600} fill="var(--color-ink-1)" className="tnum">
              {year}년 연평균 {model.yearMean.toFixed(2)}℃
            </text>
          </g>
        </ChartFrame>
      </div>

      <div className="flex items-start justify-between gap-6">
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{PHASES[phase].body}</p>
        {phase < PHASES.length - 1 ? (
          <button type="button" className="btn btn-ghost shrink-0" onClick={() => setPhase(PHASES.length - 1)}>
            건너뛰기
          </button>
        ) : (
          <button type="button" className="btn btn-primary shrink-0 rise" onClick={onNext}>
            40년을 펼쳐보기
          </button>
        )}
      </div>
    </div>
  )
}
