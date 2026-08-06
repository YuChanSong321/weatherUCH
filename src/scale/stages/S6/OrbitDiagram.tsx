/** 궤도 모형 — 이심률/세차가 '어느 계절에 태양과 가까워지는가'를 바꾸는 것을 보여준다. */
import { PRESENT, type OrbitParams } from '../../lib/milankovitch'

const RAD = Math.PI / 180
const W = 300
const H = 208
const CX = W / 2
const CY = H / 2 + 2
/** 이심률은 실제로 0.058 이하라 눈에 안 보인다 — 형태를 읽히게 6배 과장한다 */
const E_EXAGGERATION = 6

const SEASONS = [
  { lambda: 90, label: '하지', accent: true },
  { lambda: 180, label: '추분', accent: false },
  { lambda: 270, label: '동지', accent: false },
  { lambda: 0, label: '춘분', accent: false },
]

export function OrbitDiagram({ params }: { params: OrbitParams }) {
  const eDraw = Math.min(0.42, params.eccentricity * E_EXAGGERATION)
  const scale = 70

  /** 태양(초점)을 원점으로 한 궤도 위 위치 — 진근점이각 ν */
  const pos = (nuDeg: number) => {
    const nu = nuDeg * RAD
    const r = (scale * (1 - eDraw ** 2)) / (1 + eDraw * Math.cos(nu))
    return [CX + r * Math.cos(nu), CY - r * Math.sin(nu)] as const
  }

  const orbitPath =
    Array.from({ length: 121 }, (_, i) => {
      const [px, py] = pos((i / 120) * 360)
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`
    }).join(' ') + ' Z'

  // 하지(λ=90°)의 궤도상 위치. 근일점의 태양황경은 ω+180 이므로 진근점이각은 λ−(ω+180)
  const summerNu = 90 - (params.precession + 180)
  const [ex, ey] = pos(summerNu)
  const summerR = Math.hypot(ex - CX, ey - CY)
  const perihelionR = scale * (1 - eDraw)
  const aphelionR = scale * (1 + eDraw)
  const nearness = (aphelionR - summerR) / (aphelionR - perihelionR || 1) // 1 = 근일점, 0 = 원일점

  const tilt = params.obliquity
  const axisLen = 24

  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">궤도와 자전축</h3>
        <span className="text-[10px] text-ink-3">이심률 6배 과장</span>
      </div>

      <svg width={W} height={H} className="mx-auto block">
        {/* 궤도 */}
        <path d={orbitPath} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth={1.5} />

        {/* 태양 */}
        <circle cx={CX} cy={CY} r={9} fill="var(--color-act-2)" />
        <circle cx={CX} cy={CY} r={16} fill="var(--color-act-2)" opacity={0.18} />

        {/* 계절 위치 */}
        {SEASONS.map((s) => {
          const [sx, sy] = pos(s.lambda - (params.precession + 180))
          return (
            <g key={s.label}>
              <circle
                cx={sx}
                cy={sy}
                r={s.accent ? 0 : 2.6}
                fill="var(--color-ink-3)"
              />
              {!s.accent && (
                <text x={sx} y={sy - 8} textAnchor="middle" fontSize={9.5} fill="var(--color-ink-3)">
                  {s.label}
                </text>
              )}
            </g>
          )
        })}

        {/* 태양–지구 선 */}
        <line x1={CX} y1={CY} x2={ex} y2={ey} stroke="var(--color-act-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />

        {/* 지구 (하지 위치) + 자전축 */}
        <g transform={`translate(${ex} ${ey})`}>
          <circle r={7.5} fill="#4a7fb5" stroke="var(--color-space-1)" strokeWidth={1.5} />
          <g transform={`rotate(${tilt})`}>
            <line
              x1={0}
              y1={-axisLen / 2}
              x2={0}
              y2={axisLen / 2}
              stroke="var(--color-act-3)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={0} cy={-axisLen / 2} r={2} fill="var(--color-act-3)" />
          </g>
          <text x={12} y={-10} fontSize={9.5} fill="var(--color-ink-2)">
            하지
          </text>
        </g>
      </svg>

      <div className="text-[11.5px] leading-relaxed text-ink-2">
        <span className="text-ink-3">세차 {params.precession.toFixed(0)}° · </span>
        여름에 태양과{' '}
        <span className="font-semibold" style={{ color: nearness > 0.5 ? 'var(--color-bad)' : 'var(--color-act-1)' }}>
          {nearness > 0.72
            ? '가장 가깝다 (뜨거운 여름)'
            : nearness > 0.5
              ? '가까운 편이다'
              : nearness > 0.28
                ? '먼 편이다'
                : '가장 멀다 (서늘한 여름)'}
        </span>
        {Math.abs(params.obliquity - PRESENT.obliquity) > 0.4 && (
          <>
            {' · '}
            자전축 {params.obliquity > PRESENT.obliquity ? '더 세워짐' : '더 누워짐'}
          </>
        )}
      </div>
    </div>
  )
}
