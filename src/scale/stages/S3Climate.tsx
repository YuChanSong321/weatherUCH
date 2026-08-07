/**
 * S3 · 2단계 — x축이 연도로 줌아웃. 40년의 연평균 점이 차례로 찍히며 추세가 드러난다.
 * 사용자 권한이 '관찰자 → 분석가'로 올라가는 지점.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BlossomLayer, doyLabel } from '../components/BlossomLayer'
import { YearlyChart } from '../components/YearlyChart'
import { blossom, blossomSpecies, yearly, yearlyTrend } from '../data/loader'

const W = 960
const H = 380

/**
  * 추세가 드러나고 나서 개화일 레이어가 얹히기까지.
  *
  * ⚠️ 이 값과 '다음' 버튼이 뜨는 조건은 한 몸이다. 전에는 버튼이 추세선과 함께 뜨고
  * 개화일이 1.6초 뒤에 왔는데, 그 사이에 넘어가버리면 이 단계의 핵심 장면을 통째로
  * 못 본다. 지금은 개화일이 얹힌 뒤에야 버튼이 나온다 (아래 canLeave).
  */
const BLOSSOM_DELAY = 900
/** 레이어가 걷히는 시간 — S4로 넘어가기 전에 이만큼 기다린다 */
const BLOSSOM_FADE = 480

export function S3Climate({ highlightYear, onNext }: { highlightYear: number; onNext: () => void }) {
  const [revealed, setRevealed] = useState(0)
  const [trendVisible, setTrendVisible] = useState(false)
  const [blossomVisible, setBlossomVisible] = useState(false)
  const trend = useMemo(() => yearlyTrend(), [])

  useEffect(() => {
    if (revealed >= yearly.length) {
      const t = window.setTimeout(() => setTrendVisible(true), 500)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 500 : 55)
    return () => window.clearTimeout(t)
  }, [revealed])

  // 추세선이 드러난 뒤 개화일이 자동으로 얹힌다 (토글로 끌 수 있다)
  useEffect(() => {
    if (!trendVisible || blossom.length === 0) return
    const t = window.setTimeout(() => setBlossomVisible(true), BLOSSOM_DELAY)
    return () => window.clearTimeout(t)
  }, [trendVisible])

  /**
   * S4는 빈 해의 기온을 맞히는 화면이다. 개화일 점이 남아 있으면 정답을 가리키는
   * 두 번째 단서가 되므로, 넘어가기 전에 반드시 먼저 걷어낸다.
   */
  const handleNext = useCallback(() => {
    if (!blossomVisible) return onNext()
    setBlossomVisible(false)
    window.setTimeout(onNext, BLOSSOM_FADE)
  }, [blossomVisible, onNext])

  /**
   * 다음으로 넘어갈 수 있는 시점 — 개화일까지 다 보여준 뒤다.
   * 개화일 데이터가 없을 때는 추세선만으로 넘어간다 (흐름이 막히면 안 된다).
   */
  const canLeave = blossom.length > 0 ? blossomVisible : trendVisible

  const blossomShift = useMemo(() => {
    if (blossom.length < 10) return null
    const head = blossom.slice(0, 5).reduce((s, r) => s + r.doy, 0) / 5
    const tail = blossom.slice(-5).reduce((s, r) => s + r.doy, 0) / 5
    return { head, tail, days: head - tail }
  }, [])

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
            {blossomVisible
              ? '숫자로는 0.0몇 ℃, 벚꽃으로는 며칠'
              : trendVisible
                ? '개별 연도는 튀지만, 방향은 흔들리지 않습니다'
                : '한 해에 한 점씩'}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-series-obs" /> 관측 연평균
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-act-2" /> 선형 추세
          </span>
          {trendVisible && blossom.length > 0 && (
            <button
              type="button"
              onClick={() => setBlossomVisible((v) => !v)}
              aria-pressed={blossomVisible}
              className="flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors"
              style={{
                borderColor: blossomVisible
                  ? 'color-mix(in oklab, var(--color-blossom) 55%, transparent)'
                  : 'rgb(255 255 255 / 0.14)',
                color: blossomVisible ? 'var(--color-ink-1)' : 'var(--color-ink-3)',
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: 'var(--color-blossom)', opacity: blossomVisible ? 1 : 0.45 }}
              />
              벚꽃 개화일
            </button>
          )}
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
          {(ctx) => {
            const { x, y, width } = ctx
            return (
              <>
                <BlossomLayer ctx={ctx} records={blossom} visible={blossomVisible} />
                {trendVisible ? (
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
                ) : null}
              </>
            )
          }}
        </YearlyChart>
        {/* 두 축을 한 그림에 놓았으므로, 기울기를 직접 비교하면 안 된다는 것을 적어둔다 */}
        {blossomVisible && (
          <p className="mt-1.5 text-[10.5px] text-ink-3">
            왼쪽 눈금은 기온(℃), 오른쪽 눈금은 {blossomSpecies} 개화일입니다. 두 축의 눈금은 서로 독립이라 기울기를
            맞대어 읽으면 안 됩니다 — 같은 x축(연도) 위에 놓인 별개의 두 사실이에요.
          </p>
        )}
      </div>

      <div className="flex items-start justify-between gap-6">
        <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
          {blossomVisible && blossomShift ? (
            <>
              40년 동안 연평균 기온은 <span className="tnum text-ink-1">{(last - first).toFixed(2)}℃</span> 올랐습니다 —
              소수점 아래 숫자라 잘 와닿지 않죠. 같은 기간 부산의 벚꽃은{' '}
              <span className="tnum font-semibold" style={{ color: 'var(--color-blossom)' }}>
                {blossomShift.days.toFixed(0)}일
              </span>{' '}
              일찍 핍니다 ({doyLabel(Math.round(blossomShift.head))} → {doyLabel(Math.round(blossomShift.tail))}).{' '}
              <span className="text-ink-1">0.0몇 ℃는 달력 위에서 이만큼입니다.</span>
            </>
          ) : trendVisible ? (
            <>
              한 해만 보면 위아래로 튑니다 — 방금 당신을 이겼던 그 혼돈이죠. 그런데 40년을 늘어놓으면 개별 연도의
              튐은 잡음이 되고, 처음 5년 평균 {first.toFixed(2)}℃ → 마지막 5년 평균 {last.toFixed(2)}℃ 의 방향만
              남습니다. <span className="text-ink-1">날씨는 예측이 안 되는데 기후는 예측이 된다</span>는 말의 뜻이 여기 있어요.
            </>
          ) : (
            <>
              방금 하루를 맞히려 애썼던 곳에서 카메라를 뒤로 뺍니다. 점 하나가 1년 — 365일의 날씨를 눌러 만든 숫자예요.
            </>
          )}
        </p>
        {canLeave ? (
          <button type="button" className="btn btn-primary shrink-0 rise" onClick={handleNext}>
            그럼 빈 해를 맞혀볼까요
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={() => {
              // 끝까지 건너뛴다 — 추세선만 켜고 멈추면 개화일을 또 기다려야 한다
              setRevealed(yearly.length)
              setTrendVisible(true)
              setBlossomVisible(blossom.length > 0)
            }}
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
