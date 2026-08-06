/**
 * S7 · 엔딩 — S0의 질문을 회수하고, 사용자가 방금 걸어온 세 지점을
 * 예측 가능성 U자 곡선 위에 얹어 보여준다.
 */
import { ChartFrame } from '../components/ChartFrame'
import { linearScale, smoothPath } from '../lib/scales'
import { S1_MAX, S4_MAX, S6_MAX, useJourney } from '../state/journey'

const W = 960
const H = 292
const M = { top: 24, right: 30, bottom: 40, left: 52 }

/** x = log10(예보 리드타임, 일) */
const CURVE: Array<[number, number]> = [
  [Math.log10(1), 0.93],
  [Math.log10(3), 0.8],
  [Math.log10(7), 0.5],
  [Math.log10(14), 0.16],
  [Math.log10(60), 0.08],
  [Math.log10(365), 0.24],
  [Math.log10(3650), 0.56],
  [Math.log10(365 * 40), 0.72],
  [Math.log10(365 * 100), 0.8],
  [Math.log10(365 * 1000), 0.87],
  [Math.log10(365 * 20000), 0.96],
]

const X_TICKS: Array<{ v: number; label: string }> = [
  { v: Math.log10(1), label: '1일' },
  { v: Math.log10(14), label: '2주' },
  { v: Math.log10(365), label: '1년' },
  { v: Math.log10(365 * 40), label: '40년' },
  { v: Math.log10(365 * 1000), label: '1천 년' },
  { v: Math.log10(365 * 20000), label: '2만 년' },
]

const ZONES = [
  { from: Math.log10(1), to: Math.log10(10), label: '날씨 — 지속성', color: 'var(--color-act-1)' },
  { from: Math.log10(10), to: Math.log10(180), label: '혼돈의 골짜기', color: 'var(--color-bad)' },
  { from: Math.log10(180), to: Math.log10(365 * 300), label: '기후 — 평균과 강제력', color: 'var(--color-act-2)' },
  { from: Math.log10(365 * 300), to: Math.log10(365 * 20000), label: '천체역학 — 시계', color: 'var(--color-act-3)' },
]

const CARDS = [
  {
    n: '①',
    title: '날씨는 며칠',
    body: '오늘의 대기는 내일과 닮아 있다. 그 닮음이 예보의 재료다. 하지만 작은 오차가 며칠마다 두 배로 자라 2주 앞에서 예측을 삼킨다.',
    color: 'var(--color-act-1)',
  },
  {
    n: '②',
    title: '기후는 수십 년',
    body: '개별 연도는 여전히 못 맞힌다. 그런데 40년을 평균하면 방향이 남는다. 그래서 2100년의 기후는 다음 주 날씨보다 오히려 더 잘 보인다.',
    color: 'var(--color-act-2)',
  },
  {
    n: '③',
    title: '그 기후를 움직이는 것은 지구의 궤도',
    body: '이심률·자전축 기울기·세차는 천체역학이 정한다. 시계처럼 계산되기에, 수만 년 규모의 기후는 가장 예측 가능한 영역이 된다.',
    color: 'var(--color-act-3)',
  },
]

export function S7Ending() {
  const { rounds, yearGuess, orbitResult, dragged2100, totals, restart } = useJourney()

  const s1Earned = rounds.reduce((s, r) => s + r.earned, 0)
  const meanDailyError =
    rounds.length > 0 ? rounds.reduce((s, r) => s + r.tmaxError, 0) / rounds.length : null

  const x = linearScale([0, Math.log10(365 * 20000)], [M.left, W - M.right])
  const y = linearScale([0, 1], [H - M.bottom, M.top])
  const pts = CURVE.map(([lx, ly]) => [x(lx), y(ly)] as [number, number])

  const valueAt = (lx: number): number => {
    for (let i = 0; i < CURVE.length - 1; i++) {
      const [x0, y0] = CURVE[i]
      const [x1, y1] = CURVE[i + 1]
      if (lx >= x0 && lx <= x1) {
        const t = (lx - x0) / (x1 - x0 || 1)
        return y0 + (y1 - y0) * t
      }
    }
    return CURVE[CURVE.length - 1][1]
  }

  /** 사용자가 실제로 서 봤던 세 지점 */
  const marks = [
    meanDailyError !== null && {
      lx: Math.log10(1),
      label: '1단계 · 하루 뒤',
      detail: `평균 오차 ${meanDailyError.toFixed(1)}℃ · ${s1Earned}/${S1_MAX}점`,
      color: 'var(--color-act-1)',
      anchor: 'start' as const,
      place: 'below' as const,
    },
    yearGuess && {
      lx: Math.log10(365 * 40),
      label: '2단계 · 40년 규모',
      detail: `${yearGuess.year}년 오차 ${yearGuess.errorVsActual.toFixed(2)}℃ · ${yearGuess.earned}/${S4_MAX}점`,
      color: 'var(--color-act-2)',
      anchor: 'end' as const,
      place: 'above' as const,
    },
    orbitResult && {
      lx: Math.log10(365 * 20000),
      label: '3단계 · 2만 년 규모',
      detail: `${orbitResult.success ? '미션 성공' : '미션 미완'} · ${orbitResult.earned}/${S6_MAX}점`,
      color: 'var(--color-act-3)',
      anchor: 'end' as const,
      place: 'below' as const,
    },
  ].filter(Boolean) as Array<{
    lx: number
    label: string
    detail: string
    color: string
    anchor: 'start' | 'end'
    place: 'above' | 'below'
  }>

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">여정의 끝 · 처음의 질문</div>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight">
            “당신은 며칠 앞을 맞힐 수 있을까?”
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
            답: <span className="text-ink-1">며칠은 맞힐 수 있고, 2주는 아무도 못 맞히며, 수십 년과 수만 년은 다시 맞힐 수 있다.</span>{' '}
            예측 가능성은 시간이 갈수록 나빠지는 직선이 아니라 — U자를 그린다.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-[34px] leading-none font-semibold">
            {totals.earned}
            <span className="text-[16px] text-ink-3"> / {totals.max}</span>
          </div>
          <div className="text-[11px] text-ink-3">총점</div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-1 flex items-baseline justify-between px-1">
          <h2 className="text-[13px] font-semibold">예측 가능성의 U자 곡선</h2>
          <span className="text-[10.5px] text-ink-3">가로축은 예보 리드타임 (로그 눈금)</span>
        </div>
        <ChartFrame
          width={W}
          height={H}
          margins={M}
          x={x}
          y={y}
          xTicks={X_TICKS.map((t) => t.v)}
          yTicks={[0, 0.25, 0.5, 0.75, 1]}
          xTickFormat={(v) => X_TICKS.find((t) => t.v === v)?.label ?? ''}
          yTickFormat={(v) => (v === 1 ? '높음' : v === 0 ? '낮음' : '')}
        >
          {/* 구간 띠 */}
          {ZONES.map((z) => (
            <g key={z.label}>
              <rect
                x={x(z.from)}
                y={M.top}
                width={x(z.to) - x(z.from)}
                height={H - M.bottom - M.top}
                fill={z.color}
                opacity={0.07}
              />
              <text
                x={(x(z.from) + x(z.to)) / 2}
                y={H - M.bottom - 5}
                textAnchor="middle"
                fontSize={10.5}
                fill={z.color}
              >
                {z.label}
              </text>
            </g>
          ))}

          {/* U자 곡선 */}
          <path
            d={smoothPath(pts)}
            fill="none"
            stroke="var(--color-series-obs)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* 사용자가 서 봤던 지점 */}
          {marks.map((mk) => {
            // 곡선 위에 얹히는 설명은 배경 카드를 깔아 선과 글자가 뒤섞이지 않게 한다
            const cy = y(valueAt(mk.lx))
            const cx = x(mk.lx)
            const cardW = 206
            const cardH = 38
            const cardX = mk.anchor === 'end' ? cx - 12 - cardW : cx + 12
            const cardY = mk.place === 'below' ? cy + 10 : cy - 10 - cardH
            return (
              <g key={mk.label} className="rise">
                <line
                  x1={cx}
                  y1={cy}
                  x2={mk.anchor === 'end' ? cardX + cardW : cardX}
                  y2={cardY + cardH / 2}
                  stroke={mk.color}
                  strokeWidth={1}
                  opacity={0.6}
                />
                <rect
                  x={cardX}
                  y={cardY}
                  width={cardW}
                  height={cardH}
                  rx={7}
                  fill="var(--color-space-1)"
                  fillOpacity={0.94}
                  stroke={mk.color}
                  strokeOpacity={0.45}
                />
                <text x={cardX + 10} y={cardY + 16} fontSize={11} fontWeight={600} fill={mk.color}>
                  {mk.label}
                </text>
                <text x={cardX + 10} y={cardY + 30} fontSize={10.5} fill="var(--color-ink-2)" className="tnum">
                  {mk.detail}
                </text>
                <circle cx={cx} cy={cy} r={6.5} fill={mk.color} stroke="var(--color-space-1)" strokeWidth={2} />
              </g>
            )
          })}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((c) => (
          <div key={c.n} className="panel flex flex-col gap-1.5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold" style={{ color: c.color }}>
                {c.n}
              </span>
              <h3 className="text-[13.5px] font-semibold">{c.title}</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-2">{c.body}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-6">
        <p className="text-[12px] leading-relaxed text-ink-3">
          {dragged2100 !== null && (
            <>
              당신은 2100년을 <span className="tnum text-ink-2">{dragged2100.toFixed(2)}℃</span>로 그렸다. 그 갈래는
              아직 정해지지 않았다 —{' '}
            </>
          )}
          기후를 움직이는 다이얼 중 하나는, 지금 인간이 잡고 있다.
        </p>
        <button type="button" className="btn btn-primary shrink-0" onClick={restart}>
          다시 도전하기
        </button>
      </div>
    </div>
  )
}
