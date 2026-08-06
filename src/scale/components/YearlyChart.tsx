/**
 * 연평균 기온 차트 — S3(점 누적) / S4(빈 해 예측) / S5(미래 부채꼴)가 공유한다.
 * 관측 시리즈는 중립 잉크색(= '실제로 있었던 것'), 시나리오만 색을 갖는다.
 */
import { useState, type ReactNode } from 'react'
import { ChartFrame, type Margins } from './ChartFrame'
import { linearScale, niceTicks, type Scale } from '../lib/scales'
import type { YearlyRecord } from '../types'

export const CHART_MARGINS: Margins = { top: 22, right: 96, bottom: 34, left: 46 }

export type ChartCtx = { x: Scale; y: Scale; margins: Margins; width: number; height: number }

type Props = {
  width: number
  height: number
  records: YearlyRecord[]
  xDomain: [number, number]
  yDomain: [number, number]
  /** 앞에서부터 몇 개까지 찍을지 (누적 애니메이션) */
  revealCount?: number
  trend?: { slope: number; intercept: number } | null
  trendVisible?: boolean
  /** 값을 숨긴 해 (S4에서 사용자가 맞힐 해) */
  hiddenYear?: number | null
  highlightYear?: number | null
  xTicks?: number[]
  /** 플롯 위에 얹을 추가 마크 */
  children?: (ctx: ChartCtx) => ReactNode
  tooltipEnabled?: boolean
}

export function YearlyChart({
  width,
  height,
  records,
  xDomain,
  yDomain,
  revealCount = records.length,
  trend = null,
  trendVisible = false,
  hiddenYear = null,
  highlightYear = null,
  xTicks,
  children,
  tooltipEnabled = true,
}: Props) {
  const [hover, setHover] = useState<YearlyRecord | null>(null)
  const m = CHART_MARGINS
  const x = linearScale(xDomain, [m.left, width - m.right])
  const y = linearScale(yDomain, [height - m.bottom, m.top])
  const yTicks = niceTicks(yDomain[0], yDomain[1], 5)
  const ticks = xTicks ?? niceTicks(xDomain[0], xDomain[1], 5).map((v) => Math.round(v))

  const visible = records.slice(0, revealCount)
  const trendLine = trend
    ? {
        x1: x(xDomain[0]),
        y1: y(trend.slope * xDomain[0] + trend.intercept),
        x2: x(xDomain[1]),
        y2: y(trend.slope * xDomain[1] + trend.intercept),
      }
    : null

  const ctx: ChartCtx = { x, y, margins: m, width, height }

  return (
    <div className="relative">
      <ChartFrame
        width={width}
        height={height}
        margins={m}
        x={x}
        y={y}
        xTicks={ticks}
        yTicks={yTicks}
        xTickFormat={(v) => `${v}`}
        yTickFormat={(v) => v.toFixed(1)}
        yUnit="℃"
      >
        {/* 추세선 — 관측 점보다 뒤에 그린다 */}
        {trendLine && (
          <line
            {...trendLine}
            stroke="var(--color-act-2)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={trendVisible ? 0.95 : 0}
            style={{ transition: 'opacity 900ms ease' }}
          />
        )}

        {children?.(ctx)}

        {/* 관측 점 */}
        {visible.map((r) => {
          const isHidden = hiddenYear === r.year
          const isHi = highlightYear === r.year
          if (isHidden) {
            return (
              <circle
                key={r.year}
                cx={x(r.year)}
                cy={y(r.tavg)}
                r={5}
                fill="none"
                stroke="var(--color-ink-3)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.5}
              />
            )
          }
          return (
            <circle
              key={r.year}
              cx={x(r.year)}
              cy={y(r.tavg)}
              r={isHi ? 6 : 4.2}
              fill={isHi ? 'var(--color-act-2)' : 'var(--color-series-obs)'}
              stroke="var(--color-space-1)"
              strokeWidth={1.6}
              opacity={hover && hover.year !== r.year ? 0.55 : 1}
              style={{ transition: 'opacity 160ms ease' }}
            />
          )
        })}

        {/* 히트박스 — 마크보다 크게 */}
        {tooltipEnabled &&
          visible.map((r) => (
            <circle
              key={`hit-${r.year}`}
              cx={x(r.year)}
              cy={y(r.tavg)}
              r={11}
              fill="transparent"
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover((h) => (h?.year === r.year ? null : h))}
            />
          ))}
      </ChartFrame>

      {tooltipEnabled && hover && (
        <div
          className="panel pointer-events-none absolute z-10 px-2.5 py-1.5 text-[11.5px] whitespace-nowrap"
          style={{ left: x(hover.year) + 12, top: y(hover.tavg) - 34 }}
        >
          <span className="tnum font-semibold">{hover.year}년</span>
          <span className="tnum ml-2 text-ink-2">연평균 {hover.tavg.toFixed(2)}℃</span>
        </div>
      )}
    </div>
  )
}
