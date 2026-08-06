/**
 * S3 · 2단계 — x축이 연도로 줌아웃. 40년의 연평균 점이 차례로 찍히며 추세가 드러난다.
 * 사용자 권한이 '관찰자 → 분석가'로 올라가는 지점.
 */
import { useEffect, useMemo, useState } from 'react'
import { YearlyChart } from '../components/YearlyChart'
import { yearly, yearlyTrend } from '../data/loader'

const W = 960
const H = 380

export function S3Climate({ highlightYear, onNext }: { highlightYear: number; onNext: () => void }) {
  const [revealed, setRevealed] = useState(0)
  const [trendVisible, setTrendVisible] = useState(false)
  const trend = useMemo(() => yearlyTrend(), [])

  useEffect(() => {
    if (revealed >= yearly.length) {
      const t = window.setTimeout(() => setTrendVisible(true), 500)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 500 : 55)
    return () => window.clearTimeout(t)
  }, [revealed])

  const temps = yearly.map((r) => r.tavg)
  const yDomain: [number, number] = [Math.floor(Math.min(...temps) * 2) / 2 - 0.3, Math.ceil(Math.max(...temps) * 2) / 2 + 0.3]
  const xDomain: [number, number] = [yearly[0].year - 1, yearly[yearly.length - 1].year + 1]

  const first = yearly.slice(0, 5).reduce((s, r) => s + r.tavg, 0) / 5
  const last = yearly.slice(-5).reduce((s, r) => s + r.tavg, 0) / 5

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-2">2단계 · 수십 년</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {trendVisible ? '개별 연도는 튀지만, 방향은 흔들리지 않는다' : '한 해에 한 점씩'}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-series-obs" /> 관측 연평균
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-act-2" /> 선형 추세
          </span>
        </div>
      </div>

      <div className="panel p-4">
        <YearlyChart
          width={W}
          height={H}
          records={yearly}
          xDomain={xDomain}
          yDomain={yDomain}
          revealCount={revealed}
          trend={trend}
          trendVisible={trendVisible}
          highlightYear={highlightYear}
          xTicks={[1985, 1995, 2005, 2015, 2024]}
        >
          {({ x, y, width }) =>
            trendVisible ? (
              <g className="rise">
                <text
                  x={width - 88}
                  y={y(trend.slope * (yearly[yearly.length - 1].year + 1) + trend.intercept) - 12}
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--color-act-2)"
                  className="tnum"
                >
                  {trend.perDecade > 0 ? '+' : ''}
                  {trend.perDecade.toFixed(2)}℃
                </text>
                <text
                  x={width - 88}
                  y={y(trend.slope * (yearly[yearly.length - 1].year + 1) + trend.intercept) + 3}
                  fontSize={10.5}
                  fill="var(--color-ink-3)"
                >
                  10년당
                </text>
                {/* S2에서 압축한 그 해 — 여정의 연결선 */}
                <text
                  x={x(highlightYear)}
                  y={y(yearly.find((r) => r.year === highlightYear)!.tavg) - 14}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="var(--color-act-2)"
                >
                  {highlightYear}
                </text>
              </g>
            ) : null
          }
        </YearlyChart>
      </div>

      <div className="flex items-start justify-between gap-6">
        <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
          {trendVisible ? (
            <>
              한 해만 보면 위아래로 튄다 — 방금 당신을 이겼던 그 혼돈이다. 그런데 40년을 늘어놓으면 개별 연도의
              튐은 잡음이 되고, 처음 5년 평균 {first.toFixed(2)}℃ → 마지막 5년 평균 {last.toFixed(2)}℃ 의 방향만
              남는다. <span className="text-ink-1">날씨는 예측이 안 되는데 기후는 예측이 된다</span>는 말의 뜻이 여기 있다.
            </>
          ) : (
            <>
              방금 하루를 맞히려 애썼던 곳에서 카메라를 뒤로 뺀다. 점 하나가 1년 — 365일의 날씨를 눌러 만든 숫자다.
            </>
          )}
        </p>
        {trendVisible ? (
          <button type="button" className="btn btn-primary shrink-0 rise" onClick={onNext}>
            그럼 빈 해를 맞혀보자
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={() => {
              setRevealed(yearly.length)
              setTrendVisible(true)
            }}
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
