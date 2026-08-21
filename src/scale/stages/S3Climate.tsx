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
import { StageIntro, StageIntroBar, type IntroStep } from '../components/StageIntro'
import { YearlyChart } from '../components/YearlyChart'
import { blossom, blossomSpecies } from '../data/loader'
import { clamp } from '../lib/scales'
import { trendOf, useClimate } from '../state/climate'
import { useJourney } from '../state/journey'

const W = 960
const H = 380

/**
 * 이만큼 쌓여야 추세선이 자란다 — 점 몇 개로 그은 직선은 추세가 아니다.
 * 단, 이 문턱을 넘어도 사용자가 방향을 찍기 전에는 선을 그리지 않는다 (아래 trendVisible).
 */
const TREND_MIN = 12

/**
 * 본 화면에 앞서 한 마디씩 거치는 도입 (→ [components/StageIntro]).
 * 세 마디의 순서는 고정이다: 손이 할 일 → 그게 가르치는 개념 → 그 개념이 쓰이는 곳.
 */
const INTRO: IntroStep[] = [
  {
    label: '지금 할 일',
    body: (
      <>
        아래 띠를 왼쪽에서 오른쪽으로 <span className="text-act-2">문질러</span> 40년치 연평균을 직접 쌓아보세요.
        절반쯤에서 한 번 멈추고, 나머지 20년이 어디로 갈지 먼저 찍습니다.
      </>
    ),
  },
  {
    label: '여기서 배우는 개념',
    body: (
      <>
        <span className="text-act-2">추세와 잡음의 분리</span> — 한 해의 오르내림(잡음)과 여러 해에 걸친 방향(신호)은
        다른 것이고, 신호는 점을 충분히 모아야만 드러납니다.
      </>
    ),
    chip: '추세와 잡음의 분리 — 점을 충분히 모아야 방향이 드러난다',
  },
  {
    /*
     * 조작 전에 한 번, 조작 후에 한 번.
     * 원래는 선이 나타나는 순간(조작 한가운데)에 다섯 마디짜리 해설을 통째로 끼워
     * 넣었는데, 손이 움직이는 중에 화면을 빼앗는 셈이라 흐름이 끊겼다. 그래서
     * "선이 무엇인지"만 여기서 미리 말해 두고, "그 선을 어떻게 읽는지"는 다 쌓은
     * 뒤로 미룬다 (→ readerSteps).
     */
    label: '곧 나올 선은 무엇인가',
    body: (
      <>
        점이 충분히 쌓이면 <span className="text-act-2">추세선</span>이 자랍니다. 점들 한가운데를 지나도록 그은
        직선이고, 기울기가 <span className="text-ink-1">10년마다 몇 도씩 움직였는지</span>를 말해줍니다. 개별
        연도를 설명하려는 선이 아니에요.
      </>
    ),
  },
  {
    label: '이 개념이 쓰이는 곳',
    body: (
      <>
        기후변화 감시, 해수면·빙하 관측. 그리고 통계가 쓰이는 거의 모든 곳 —{' '}
        <span className="text-act-2">주가·감염병 곡선·시험 성적</span>도 같은 방법으로 읽습니다.
      </>
    ),
  },
]
/** 스크러버가 예측을 받기 위해 멈추는 지점 (전체의 비율) */
const GATE = 0.5
/** 레이어가 걷히는 시간 — S4로 넘어가기 전에 이만큼 기다린다 */
const BLOSSOM_FADE = 480

export function S3Climate({ highlightYear, onNext }: { highlightYear: number; onNext: () => void }) {
  const climate = useClimate()
  const { setClimateTint } = useGlobe()
  const { trendGuess, setTrendGuess } = useJourney()
  const series = climate.yearly

  /*
   * 진입 카드는 앞 단계(S2)의 나가는 카드에 합쳐졌다 — 조작 없이 설명만 이어지는
   * 카드가 연달아 두 장 뜨던 것을 한 장으로 줄인 것이다. 그래서 여기서는 곧장
   * 그래프로 들어간다. 아래 INTRO 는 '안내 다시 보기'로만 열린다.
   */
  const [introDone, setIntroDone] = useState(true)
  /** 추세선 읽는 법 다섯 마디를 지났는가 — 다 쌓은 뒤 나가면서 한 번 거친다 */
  const [readerDone, setReaderDone] = useState(false)
  /** 그 다섯 마디를 지금 띄우고 있는가 */
  const [readerOpen, setReaderOpen] = useState(false)
  /** 스크러버 위치 = 지금까지 드러난 연도 수 */
  const [revealed, setRevealed] = useState(0)
  const [blossomVisible, setBlossomVisible] = useState(false)
  const [scrubbed, setScrubbed] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const trend = useMemo(() => trendOf(series), [series])
  const showBlossom = climate.hasBlossom && blossom.length > 0

  /** 절반까지 왔고 아직 추세를 안 찍었다면 여기서 멈춘다 */
  const gateIndex = Math.round(series.length * GATE)
  const gated = trendGuess === null

  /*
   * 실제 추세선은 **찍은 뒤에** 나온다.
   *
   * 원래는 점이 TREND_MIN 개 쌓이면 바로 선이 자라게 했는데, 그 문턱(12개)이 절반
   * 관문(약 21개)보다 앞이라 "10년당 몇 도"를 찍으라고 물어보는 순간 화면에는 이미
   * 정답선과 +0.27℃/10년 이라는 숫자가 떠 있었다. 답을 보여주고 답을 묻는 셈이라
   * 예측이 성립하지 않는다. 이제 순서는 점 쌓기 → 예측 → 정답 공개다.
   */
  const trendVisible = revealed >= TREND_MIN && !gated
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
  const leave = useCallback(() => {
    if (!blossomVisible) return onNext()
    setBlossomVisible(false)
    window.setTimeout(onNext, BLOSSOM_FADE)
  }, [blossomVisible, onNext])

  /* 나가는 길에 '읽는 법'을 한 번 거친다. 이미 봤으면 그대로 넘어간다. */
  const handleNext = useCallback(() => {
    if (!readerDone) return setReaderOpen(true)
    leave()
  }, [readerDone, leave])

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

  const reader = useMemo(() => readerSteps(series, trend, trendGuess), [series, trend, trendGuess])

  // 훅은 모두 위에서 부른 뒤에 갈라진다 (조건부 훅 금지)
  if (!introDone) {
    return (
      <StageIntro
        eyebrow="2단계 · 수십 년"
        steps={INTRO}
        tone="var(--color-act-2)"
        onDone={() => setIntroDone(true)}
      />
    )
  }

  /*
   * 선을 읽는 법은 **구간이 끝난 뒤에** 지난다.
   *
   * 원래는 선이 처음 나오는 순간(= 사용자가 아직 문지르는 중)에 이 다섯 마디를
   * 띄웠다. 조작 흐름 한가운데를 끊는 자리라, 손이 멈추고 읽기로 갈아탄 뒤 다시
   * 손으로 돌아와야 했다. 카드는 구간의 입구와 출구에만 둔다.
   */
  if (readerOpen) {
    return (
      <StageIntro
        eyebrow="추세선 읽는 법"
        steps={reader}
        tone="var(--color-act-2)"
        onDone={() => {
          setReaderOpen(false)
          setReaderDone(true)
          leave()
        }}
      />
    )
  }

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
          {/* 선이 아직 없을 때 범례만 먼저 띄우면 '어딘가에 선이 있다'는 힌트가 된다 */}
          {trendVisible && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-act-2" /> 선형 추세
            </span>
          )}
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

      <StageIntroBar
        chip={INTRO[1].chip!}
        tone="var(--color-act-2)"
        onReplay={() => setIntroDone(false)}
      />

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

      {/* 방금 읽은 다섯 마디는 한 줄로 접어 둔다 — 다시 보기로 펼친다 */}
      {readerDone && (
        <StageIntroBar
          chip={reader[reader.length - 1].chip!}
          tone="var(--color-act-2)"
          label="추세선 읽는 법"
          replayLabel="읽는 법 다시 보기"
          onReplay={() => setReaderOpen(true)}
        />
      )}

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
              절반까지 오셨습니다. 추세선은 아직 없습니다 — 지금까지 쌓인 점만 보고{' '}
              <span className="text-ink-1">나머지 20년의 방향</span>을 먼저 찍어보세요. 10년마다 몇 도씩 움직일까요?
            </>
          ) : scrubbed ? (
            <>
              점 하나가 1년 — 365일의 날씨를 눌러 만든 숫자입니다. 계속 문지르세요. 몇 개로는 아무 방향도 보이지
              않습니다. <span className="text-ink-1">절반쯤에서 한 번 멈춰</span> 나머지의 방향을 먼저 찍고, 그 다음에
              실제 추세선이 나옵니다.
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

/**
 * 추세선 읽는 법 — 한 번에 한 마디씩 **거쳐야** 넘어간다.
 *
 * 심사 피드백: "추세선 표현하는 쪽에 좀 더 디테일한 설명이 들어가면 좋겠다."
 * 그전까지 이 화면은 주황색 직선 하나와 "+0.28℃" 라는 숫자만 던져놓고 있었다. 그
 * 선이 **어떻게 그어졌고, 무엇을 주장하고, 무엇을 주장하지 않는지**가 없으면 추세선은
 * 그냥 예쁜 장식이다.
 *
 * 처음에는 네 칸짜리 판으로 차트 아래에 깔았는데 "부연설명처럼 보여서 읽지 않는다"는
 * 지적을 받았다. 그래서 도입에서 쓰는 카드 방식([components/StageIntro])으로 바꿨다 —
 * 찍은 직후 정답과 함께 다섯 마디를 지나야 차트로 돌아온다. 순서에는 이유가 있다:
 *   ⓪ 내 예측과 실제(정답 공개) → ① 어떻게 그었나(최소제곱) → ② 어떻게 읽나(기울기 단위)
 *   → ③ 얼마나 믿나(잔차) → ④ 무엇이 아닌가(예측이 아니다 → 다음 단계로)
 */
/**
 * 내가 그은 기울기와 실제 기울기를 같은 칸에 겹쳐 놓는다.
 *
 * 정리 카드가 "+0.31 대 +0.24" 라고만 말하면 두 숫자의 차이가 얼마나 큰 것인지
 * 감이 오지 않는다. 같은 폭 위에 두 선분을 그으면 각도 차이가 먼저 읽히고,
 * 그게 곧 "내가 얼마나 가파르게 봤나"다.
 */
function SlopeRecap({ guess, actual, span }: { guess: number; actual: number; span: number }) {
  const W = 300
  const H = 88
  const rise = (perDecade: number) => (perDecade * span) / 10
  const lim = Math.max(0.6, Math.abs(rise(guess)), Math.abs(rise(actual))) * 1.25
  const y = (v: number) => H / 2 - (v / lim) * (H / 2 - 10)
  const line = (perDecade: number, color: string) => (
    <line x1={8} y1={y(0)} x2={W - 8} y2={y(rise(perDecade))} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  )
  return (
    <div className="panel-quiet flex items-center gap-4 px-4 py-3 text-left">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" role="img" aria-label="내 기울기와 실제 기울기 비교">
        <line x1={8} y1={y(0)} x2={W - 8} y2={y(0)} stroke="rgb(255 255 255 / 0.14)" strokeWidth={1} strokeDasharray="3 4" />
        {line(guess, 'var(--color-act-3)')}
        {line(actual, 'var(--color-act-2)')}
      </svg>
      <div className="flex flex-col gap-1.5 text-[11px]">
        <span className="flex items-center gap-1.5" style={{ color: 'var(--color-act-3)' }}>
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--color-act-3)' }} />
          내가 찍은 기울기
        </span>
        <span className="flex items-center gap-1.5" style={{ color: 'var(--color-act-2)' }}>
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--color-act-2)' }} />
          실제 추세선
        </span>
        <span className="text-ink-3">{span}년 전체를 같은 폭에 놓은 것</span>
      </div>
    </div>
  )
}

function readerSteps(
  series: Array<{ year: number; tavg: number }>,
  trend: { slope: number; intercept: number; perDecade: number },
  guess: { perDecade: number; actualPerDecade: number } | null,
): IntroStep[] {
  const firstYear = series[0].year
  const lastYear = series[series.length - 1].year
  const span = lastYear - firstYear
  const totalRise = trend.slope * span
  const sign = trend.perDecade > 0 ? '+' : ''

  /** 잔차 — 점이 선에서 벗어난 정도. 이 폭이 "한 해로는 알 수 없다"의 크기다. */
  const resid = series.map((r) => r.tavg - (trend.slope * r.year + trend.intercept))
  const sigma = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / Math.max(1, resid.length - 1))
  /** 선에서 가장 멀리 떨어진 해 — "그런데도 이만큼 튄 해가 있다" */
  const worst = series.reduce(
    (acc, r, i) => (Math.abs(resid[i]) > Math.abs(acc.d) ? { year: r.year, d: resid[i] } : acc),
    { year: firstYear, d: 0 },
  )

  const gap = guess ? guess.perDecade - trend.perDecade : null
  const steps: IntroStep[] = []

  if (guess && gap !== null) {
    steps.push({
      label: '당신의 예측 vs 실제',
      body: (
        <>
          절반의 점만 보고{' '}
          <span className="tnum" style={{ color: 'var(--color-act-3)' }}>
            {guess.perDecade > 0 ? '+' : ''}
            {guess.perDecade.toFixed(2)}℃/10년
          </span>{' '}
          으로 찍으셨고, 전체의 실제 기울기는{' '}
          <span className="tnum" style={{ color: 'var(--color-act-2)' }}>
            {sign}
            {trend.perDecade.toFixed(2)}℃/10년
          </span>{' '}
          — 차이 {Math.abs(gap).toFixed(2)}℃.{' '}
          {Math.abs(gap) <= 0.08
            ? '거의 정확합니다. 하루 뒤 기온은 못 맞혔는데 40년의 방향은 읽어내셨어요.'
            : Math.abs(gap) <= 0.2
              ? '방향과 크기를 대체로 맞히셨습니다 — 개별 해는 못 맞혀도 기울기는 보입니다.'
              : gap > 0
                ? '실제보다 가파르게 보셨습니다. 최근의 더운 기억이 기울기를 끌어올리는 건 흔한 일이에요.'
                : `실제보다 완만하게 보셨습니다. 작아 보이지만 ${span}년을 곱하면 ${totalRise.toFixed(2)}℃입니다.`}
        </>
      ),
      // 두 기울기를 실제 선분으로 겹쳐 보여준다 — 숫자 두 개보다 각도 차이가 먼저 읽힌다
      visual: <SlopeRecap guess={guess.perDecade} actual={trend.perDecade} span={span} />,
    })
  }

  steps.push(
    {
      label: '① 어떻게 그은 선인가',
      body: (
        <>
          점 {series.length}개에서 선까지의{' '}
          <span className="text-act-2">세로 거리를 제곱해 더한 값이 가장 작아지는</span> 직선입니다(최소제곱법). 눈대중이
          아니라 이 점들에 대해 유일하게 정해지는 답이에요 — 점을 이어 그리면 잡음까지 따라 그리게 되니까요.
        </>
      ),
    },
    {
      label: '② 기울기 읽는 법',
      body: (
        <>
          <span className="tnum text-act-2">
            {sign}
            {trend.perDecade.toFixed(2)}℃/10년
          </span>{' '}
          은 "10년마다 연평균기온이 {Math.abs(trend.perDecade).toFixed(2)}℃씩{' '}
          {trend.perDecade > 0 ? '올라간다' : '내려간다'}"는 뜻입니다. {span}년으로 환산하면{' '}
          <span className="tnum text-act-2">
            {totalRise > 0 ? '+' : ''}
            {totalRise.toFixed(2)}℃
          </span>{' '}
          — 한 해 365일을 모두 평균한 값이 이만큼 움직였습니다.
        </>
      ),
    },
    {
      label: '③ 점들은 선 위에 있지 않습니다',
      body: (
        <>
          점들은 선에서 평균 <span className="tnum text-act-2">±{sigma.toFixed(2)}℃</span> 벗어나 있어요.{' '}
          {worst.year}년은 선보다 {Math.abs(worst.d).toFixed(2)}℃ {worst.d > 0 ? '높았고' : '낮았고'}, 그건 그해 날씨가
          그랬을 뿐입니다 — <span className="text-act-2">추운 한 해가 추세를 반박하지는 못합니다.</span>
        </>
      ),
    },
    {
      label: '④ 추세선은 예측이 아닙니다',
      body: (
        <>
          이 선은 {firstYear}–{lastYear}년을 <span className="text-act-2">요약</span>한 것이지 미래를 계산한 게
          아닙니다. 늘여서 2100년을 말하려면 "지금 속도가 유지된다면"이라는 가정이 붙어요. 그 가정을 실제 물리로
          대체하는 것이 다음 단계의 <span className="text-act-2">기후 시나리오</span>입니다.
        </>
      ),
      chip: '최소제곱 직선 — 잡음을 버리고 방향만 남긴 선, 예측이 아니라 구간 요약',
    },
  )

  return steps
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
