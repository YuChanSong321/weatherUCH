/** 최소 스케일 유틸 — d3 없이 SVG를 직접 그리기 위한 선형 스케일과 눈금. */

export type Scale = {
  (value: number): number
  invert: (px: number) => number
  domain: [number, number]
  range: [number, number]
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  const fn = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale
  fn.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span
  fn.domain = domain
  fn.range = range
  return fn
}

/** 사람이 읽기 좋은 간격의 눈금 값 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)))
  return out
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** 부드러운 곡선 경로 (Catmull-Rom → 베지어). 계절 곡선·시나리오 선에 사용. */
export function smoothPath(points: Array<[number, number]>, tension = 0.5): string {
  if (points.length === 0) return ''
  if (points.length < 3) return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')

  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d
}
