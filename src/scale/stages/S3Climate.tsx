/**
 * S3 · 40년 스크러빙.
 *
 * 기획안 §3 S3: 타임라인 스크러버를 **손으로 문지르면** 연평균 점이 하나씩 쌓이고,
 * 일정 개수 이상 쌓이면 추세선이 자라난다. 자동 재생이 아니라 사용자의 손이
 * 시간을 밀어야 "개별 연도는 튀지만 방향은 남는다"가 발견이 된다.
 *
 * 지구본 색도 스크러버가 선 해를 따라간다 — 40년치 색이 서서히 붉어지는 것을
 * 손으로 만들어내는 것이 이 단계의 두 번째 장면이다.
 *
 * ⚠️ 스크러버는 절반에서 한 번 멈춘다. 거기서 "나머지 20년은 어디로 갈까"를 먼저
 * 받아둔다. 끝까지 문지르는 것만으로는 어차피 보여줄 데이터를 여는 동작이라
 * 심심했다. 사용자가 그린 추세는 [state/journey] 에 남아 S4·S5 가 회수한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BlossomLayer, doyLabel } from '../components/BlossomLayer'
import { useGlobe } from '../components/GlobeLayer'
import { YearlyChart } from '../components/YearlyChart'
import { blossom, blossomSpecies } from '../data/loader'
import { clamp } from '../lib/scales'
import { trendOf, useClimate } from '../state/climate'
import { useJourney } from '../state/journey'

const W = 960
const H = 380

/** 이만큼 쌓여야 추세선이 자란다 — 점 몇 개로 그은 직선은 추세가 아니다 */
const TREND_MIN = 12
/** 스크러버가 예측을 받기 위해 멈추는 지점 (전체의 비율) */
const GATE = 0.5
/** 레이어가 걷히는 시간 — S4로 넘어가기 전에 이만큼 기다린다 */
const BLOSSOM_FADE = 480

export function S3Climate({ highlightYear, onNext }: { highlightYear: number; onNext: () => void }) {
  const climate = useClimate()
  const { setClimateTint } = useGlobe()
  const { trendGuess, setTrendGuess } = useJourney()
  const series = climate.yearly

  /** 스크러버 위치 = 지금까지 드러난 연도 수 */
  const [revealed, setRevealed] = useState(0)
  const [blossomVisible, setBlossomVisible] = useState(false)
  const [scrubbed, setScrubbed] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const trend = useMemo(() => trendOf(series), [series])
  const trendVisible = revealed >= TREND_MIN
  const showBlossom = climate.hasBlossom && blossom.length > 0

  /** 절반까지 왔고 아직 추세를 안 찍었다면 여기서 멈춘다 */
  const gateIndex = Math.round(series.length * GATE)
  const gated = trendGuess === null
  const maxReveal = gated ? gateIndex : series.length
  const atGate = gated && revealed >= gateIndex
  const [guessPerDecade, setGuessPerDecade] = useState(0)

  /* 스크러버 — 문지르는 동작 자체가 조작이다. 포인터를 캡처해 트랙 밖으로 나가도
     끊기지 않게 한다. 슬라이더 대신 넓은 트랙을 쓰는 이유는 '문지른다'는 감각 때문. */
  const valueFromX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return 0
      const t = clamp((clientX - rect.left) / rect.width, 0, 1)
      return Math.min(maxReveal, Math.round(t * series.length))
    },
    [series.length, maxReveal],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setRevealed(valueFromX(e.clientX))
    setScrubbed(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setRevealed(valueFromX(e.clientX))
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  // 추세선이 자라면 개화일 레이어를 얹는다 (번들 부산에만 있는 자료)
  useEffect(() => {
    if (trendVisible && showBlossom && revealed >= series.length) setBlossomVisible(true)
  }, [trendVisible, showBlossom, revealed, series.length])

  /* 지구 색 — 스크러버가 선 해의 편차. 40년 전체의 폭으로 정규화해, 마지막 해에
     닿았을 때 색이 확실히 붉게 서도록 한다. */
  useEffect(() => {
    if (revealed === 0) {
      setClimateTint(0)
      return
    }
    const mean = series.reduce((s, r) => s + r.tavg, 0) / series.length
    const spread = Math.max(0.3, Math.max(...series.map((r) => Math.abs(r.tavg - mean))))
    const here = series[Math.min(series.length, revealed) - 1]
    setClimateTint((here.tavg - mean) / spread)
  }, [revealed, series, setClimateTint])

  /**
   * S4는 빈 해의 기온을 맞히는 화면이다. 개화일 점이 남아 있으면 정답을 가리키는
   * 두 번째 단서가 되므로, 넘어가기 전에 반드시 먼저 걷어낸다.
   */
  const handleNext = useCallback(() => {
    if (!blossomVisible) return onNext()
    setBlossomVisible(false)
    window.setTimeout(onNext, BLOSSOM_FADE)
  }, [blossomVisible, onNext])

  const blossomShift = useMemo(() => {
    if (!showBlossom || blossom.length < 10) return null
    const head = blossom.slice(0, 5).reduce((s, r) => s + r.doy, 0) / 5
    const tail = blossom.slice(-5).reduce((s, r) => s + r.doy, 0) / 5
    return { head, tail, days: head - tail }
  }, [showBlossom])

  const temps = series.map((r) => r.tavg)
  const yDomain: [number, number] = [
    Math.floor(Math.min(...temps) * 2) / 2 - 0.3,
    Math.ceil(Math.max(...temps) * 2) / 2 + 0.3,
  ]
  const xDomain: [number, number] = [series[0].year - 1, series[series.length - 1].year + 1]

  const first = series.slice(0, 5).reduce((s, r) => s + r.tavg, 0) / 5
  const last = series.slice(-5).reduce((s, r) => s + r.tavg, 0) / 5
  const headYear = revealed > 0 ? series[Math.min(series.length, revealed) - 1].year : null
  const complete = revealed >= series.length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-2">2단계 · 수십 년</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {blossomVisible
              ? '숫자로는 0.0몇 ℃, 벚꽃으로는 며칠'
              : trendVisible
                ? '개별 연도는 튀지만, 방향은 흔들리지 않습니다'
                : '문질러서 40년을 쌓아보세요'}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-series-obs" /> {climate.label} 연평균
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-act-2" /> 선형 추세
          </span>
          {trendVisible && showBlossom && (
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
          records={series}
          xDomain={xDomain}
          yDomain={yDomain}
          revealCount={revealed}
          trend={trend}
          trendVisible={trendVisible}
          highlightYear={complete ? highlightYear : null}
          xTicks={tickYears(series[0].year, series[series.length - 1].year)}
        >
          {(ctx) => {
            const { x, y, width, margins, height } = ctx
            return (
              <>
                {showBlossom && <BlossomLayer ctx={ctx} records={blossom} visible={blossomVisible} />}
                {/* 스크러버 머리 — 지금 손이 서 있는 해 */}
                {headYear !== null && !complete && (
                  <g>
                    <line
                      x1={x(headYear)}
                      x2={x(headYear)}
                      y1={margins.top}
                      y2={height - margins.bottom}
                      stroke="var(--color-act-2)"
                      strokeWidth={1}
                      opacity={0.5}
                    />
                    <text
                      x={x(headYear)}
                      y={margins.top - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--color-act-2)"
                      className="tnum"
                    >
                      {headYear}
                    </text>
                  </g>
                )}
                {/* 사용자가 그린 추세 — 실제 추세선과 나란히 남는다 */}
                {trendGuess && (
                  <g>
                    {(() => {
                      const mid = series[Math.round(series.length / 2)]
                      const slope = trendGuess.perDecade / 10
                      const at = (yr: number) => mid.tavg + slope * (yr - mid.year)
                      return (
                        <>
                          <line
                            x1={x(xDomain[0])}
                            y1={y(at(xDomain[0]))}
                            x2={x(xDomain[1])}
                            y2={y(at(xDomain[1]))}
                            stroke="var(--color-act-3)"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                          <text
                            x={x(xDomain[0]) + 8}
                            y={y(at(xDomain[0])) - 8}
                            fontSize={10.5}
                            fill="var(--color-act-3)"
                            className="tnum"
                          >
                            당신의 추세 {trendGuess.perDecade > 0 ? '+' : ''}
                            {trendGuess.perDecade.toFixed(2)}℃/10년
                          </text>
                        </>
                      )
                    })()}
                  </g>
                )}
                {trendVisible && (
                  <g className="rise">
                    <text
                      x={width - 88}
                      y={y(trend.slope * (series[series.length - 1].year + 1) + trend.intercept) - 12}
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
                      y={y(trend.slope * (series[series.length - 1].year + 1) + trend.intercept) + 3}
                      fontSize={10.5}
                      fill="var(--color-ink-3)"
                    >
                      10년당
                    </text>
                  </g>
                )}
              </>
            )
          }}
        </YearlyChart>

        {atGate && (
          <TrendGuessPanel
            value={guessPerDecade}
            onChange={setGuessPerDecade}
            onSubmit={() =>
              setTrendGuess({
                perDecade: Number(guessPerDecade.toFixed(2)),
                actualPerDecade: Number(trend.perDecade.toFixed(2)),
              })
            }
          />
        )}

        <Scrubber
          trackRef={trackRef}
          revealed={revealed}
          total={series.length}
          firstYear={series[0].year}
          lastYear={series[series.length - 1].year}
          scrubbed={scrubbed}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyAdjust={(delta) => {
            setScrubbed(true)
            setRevealed((n) => clamp(n + delta, 0, maxReveal))
          }}
        />

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
              한 해만 보면 위아래로 튑니다 — 방금 당신을 이겼던 그 혼돈이죠. 그런데 늘어놓으면 개별 연도의 튐은
              잡음이 되고, 처음 5년 평균 {first.toFixed(2)}℃ → 마지막 5년 평균 {last.toFixed(2)}℃ 의 방향만 남습니다.{' '}
              <span className="text-ink-1">날씨는 예측이 안 되는데 기후는 예측이 된다</span>는 말의 뜻이 여기 있어요.
            </>
          ) : atGate ? (
            <>
              절반까지 오셨습니다. 여기까지의 점만 보고{' '}
              <span className="text-ink-1">나머지 20년의 방향</span>을 찍어보세요 — 10년마다 몇 도씩 움직일까요?
            </>
          ) : scrubbed ? (
            <>
              점 하나가 1년 — 365일의 날씨를 눌러 만든 숫자입니다. 계속 문지르세요. 몇 개로는 아무 방향도 보이지
              않다가, <span className="text-ink-1">{TREND_MIN}개쯤 쌓이면</span> 선이 자라기 시작합니다.
            </>
          ) : (
            <>
              방금 하루를 맞히려 애썼던 곳에서 카메라를 뒤로 뺍니다. 아래 띠를 왼쪽에서 오른쪽으로 문질러 40년을
              직접 쌓아보세요.
            </>
          )}
        </p>
        {complete && trendVisible ? (
          <button type="button" className="btn btn-primary shrink-0 rise" onClick={handleNext}>
            그럼 빈 해를 맞혀볼까요
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            disabled={gated}
            onClick={() => {
              setRevealed(series.length)
              setScrubbed(true)
              if (showBlossom) setBlossomVisible(true)
            }}
          >
            {gated ? '먼저 추세를 찍어주세요' : '끝까지 채우기'}
          </button>
        )}
      </div>
    </div>
  )
}

/** x축 눈금 — 시작·끝을 포함해 10년 간격 */
function tickYears(first: number, last: number): number[] {
  const out: number[] = []
  for (let y = Math.ceil(first / 10) * 10; y <= last; y += 10) out.push(y)
  if (out[0] !== first) out.unshift(first)
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

function Scrubber({
  trackRef,
  revealed,
  total,
  firstYear,
  lastYear,
  scrubbed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyAdjust,
}: {
  trackRef: React.RefObject<HTMLDivElement | null>
  revealed: number
  total: number
  firstYear: number
  lastYear: number
  scrubbed: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onKeyAdjust: (delta: number) => void
}) {
  const pct = (revealed / total) * 100
  return (
    <div className="mt-2">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="연도 타임라인 — 문질러서 연평균을 쌓습니다"
        aria-valuemin={firstYear}
        aria-valuemax={lastYear}
        aria-valuenow={revealed > 0 ? firstYear + revealed - 1 : firstYear}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onKeyAdjust(1)
          if (e.key === 'ArrowLeft') onKeyAdjust(-1)
          if (e.key === 'End') onKeyAdjust(total)
          if (e.key === 'Home') onKeyAdjust(-total)
        }}
        className="relative h-9 cursor-ew-resize touch-none rounded-lg border border-white/10 bg-white/4 select-none"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-l-lg"
          style={{ width: `${pct}%`, background: 'color-mix(in oklab, var(--color-act-2) 17%, transparent)' }}
        />
        <div
          className="absolute inset-y-1 w-0.5 rounded-full"
          style={{ left: `calc(${pct}% - 1px)`, background: 'var(--color-act-2)' }}
        />
        {revealed === 0 && !scrubbed && (
          <span className="pulse-soft absolute inset-0 grid place-items-center text-[11.5px] text-ink-2">
            ← 여기를 오른쪽으로 문지르세요 →
          </span>
        )}
        <span className="tnum absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-ink-1">
          {revealed} / {total}년
        </span>
      </div>
      <div className="tnum mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{firstYear}</span>
        <span>{lastYear}</span>
      </div>
    </div>
  )
}

/**
 * 절반 지점에서 받는 추세 예측.
 *
 * 점을 찍게 하지 않고 **기울기**를 받는 이유: 바로 다음 단계(S4)가 빈 해에 점을
 * 찍는 화면이다. 같은 조작을 두 번 시키면 S4 가 반복으로 읽힌다. 그리고 이 단계가
 * 가르치려는 것은 개별 값이 아니라 방향이다.
 */
function TrendGuessPanel({
  value,
  onChange,
  onSubmit,
}: {
  value: number
  onChange: (v: number) => void
  onSubmit: () => void
}) {
  const label = value > 0.02 ? '더워진다' : value < -0.02 ? '추워진다' : '그대로'
  return (
    <div className="panel-quiet mt-2 flex items-end gap-4 px-4 py-2.5 rise">
      <div className="min-w-[10.5rem]">
        <div className="text-[11px] text-ink-3">10년당 기온 변화</div>
        <div className="flex items-baseline gap-1.5">
          <span className="tnum text-[24px] leading-none font-semibold" style={{ color: 'var(--color-act-3)' }}>
            {value > 0 ? '+' : ''}
            {value.toFixed(2)}
          </span>
          <span className="text-[11px] text-ink-3">℃ · {label}</span>
        </div>
      </div>
      <div className="flex-1">
        <input
          className="slider"
          type="range"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="10년당 기온 변화 예측"
        />
        <div className="tnum -mt-1 flex justify-between text-[10px] text-ink-3">
          <span>−0.5℃ (추워짐)</span>
          <span>0</span>
          <span>+0.5℃ (더워짐)</span>
        </div>
      </div>
      <button type="button" className="btn btn-primary shrink-0 px-5 py-2 text-[13px]" onClick={onSubmit}>
        이 방향으로 확정
      </button>
    </div>
  )
}
