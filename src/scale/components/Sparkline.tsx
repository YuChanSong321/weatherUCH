/** 3일치 미니 추세 — 기압/습도의 "방향"을 한눈에 보여주는 최소 차트. */

type Props = {
  values: number[]
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ values, width = 76, height = 26, color = 'var(--color-ink-2)' }: Props) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 4
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = height - pad - ((v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* 마지막 점 = 오늘. 표면색 링으로 겹침을 끊는다 */}
      <circle cx={last[0]} cy={last[1]} r={3.6} fill={color} stroke="var(--color-space-1)" strokeWidth={2} />
    </svg>
  )
}
