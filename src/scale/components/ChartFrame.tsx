/**
 * 차트 공통 골격 — 눌러 죽인(recessive) 격자와 축, 플롯 영역만 제공한다.
 * 마크는 children 이 그린다. 이중 축은 절대 만들지 않는다 (축은 하나).
 */
import type { ReactNode } from 'react'
import type { Scale } from '../lib/scales'

export type Margins = { top: number; right: number; bottom: number; left: number }

export const DEFAULT_MARGINS: Margins = { top: 18, right: 24, bottom: 34, left: 46 }

export function ChartFrame({
  width,
  height,
  margins = DEFAULT_MARGINS,
  x,
  y,
  xTicks,
  yTicks,
  xTickFormat = (v) => String(v),
  yTickFormat = (v) => String(v),
  yUnit,
  children,
  overlay,
}: {
  width: number
  height: number
  margins?: Margins
  x: Scale
  y: Scale
  xTicks: number[]
  yTicks: number[]
  xTickFormat?: (v: number) => string
  yTickFormat?: (v: number) => string
  yUnit?: string
  children: ReactNode
  /** 플롯 영역 위에 얹을 상호작용 레이어 (툴팁 히트박스 등) */
  overlay?: ReactNode
}) {
  return (
    <svg width={width} height={height} className="block" role="img">
      {/* 가로 격자 */}
      {yTicks.map((t) => (
        <g key={`gy-${t}`}>
          <line
            x1={margins.left}
            x2={width - margins.right}
            y1={y(t)}
            y2={y(t)}
            stroke="rgb(255 255 255 / 0.07)"
            strokeWidth={1}
          />
          <text
            x={margins.left - 8}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            className="tnum"
            fontSize={10.5}
            fill="var(--color-ink-3)"
          >
            {yTickFormat(t)}
          </text>
        </g>
      ))}

      {/* x 축 */}
      <line
        x1={margins.left}
        x2={width - margins.right}
        y1={height - margins.bottom}
        y2={height - margins.bottom}
        stroke="rgb(255 255 255 / 0.16)"
      />
      {xTicks.map((t) => (
        <text
          key={`gx-${t}`}
          x={x(t)}
          y={height - margins.bottom + 15}
          textAnchor="middle"
          className="tnum"
          fontSize={10.5}
          fill="var(--color-ink-3)"
        >
          {xTickFormat(t)}
        </text>
      ))}

      {yUnit && (
        <text x={margins.left - 8} y={margins.top - 6} textAnchor="end" fontSize={10} fill="var(--color-ink-3)">
          {yUnit}
        </text>
      )}

      {children}
      {overlay}
    </svg>
  )
}
