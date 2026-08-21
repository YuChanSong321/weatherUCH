/**
 * S5 · 100년 — 사용자가 곡선을 2100년까지 끌어 연장하고, 손을 떼면 SSP 부채꼴로 갈라진다.
 * 시간 규모 순서상 '수십 년' 다음, '수만 년'(궤도) 앞이다.
 * 손을 떼면 SSP 세 시나리오가 부채꼴로 펼쳐진다: 미래는 하나의 선이 아니다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CHART_MARGINS, YearlyChart } from '../components/YearlyChart'
import { StageIntro, StageIntroBar, type IntroStep } from '../components/StageIntro'
import { scenarios, sspBaseline, sspRegion, yearly, yearlyTrend } from '../data/loader'
import { clamp, linearScale, smoothPath } from '../lib/scales'
import { WeatherVsClimate } from '../components/WeatherVsClimate'
import { useJourney } from '../state/journey'

const W = 960
const H = 400
const LAST_YEAR = 2100

/** 본 화면에 앞서 한 마디씩 거치는 도입 (→ [components/StageIntro]) */
const INTRO: IntroStep[] = [
  {
    label: '지금 할 일',
    body: (
      <>
        기온 곡선의 끝을 잡고 <span className="text-act-2">2100년까지 직접 끌었다가</span> 손을 떼세요. 당신이 놓은
        자리에서, 과학이 계산한 세 갈래가 펼쳐집니다.
      </>
    ),
  },
  {
    label: '여기서 배우는 개념',
    body: (
      <>
        <span className="text-act-2">SSP 시나리오</span> — 미래 기후는 하나의 예측값이 아니라, 사회가 어떤 선택을
        하느냐에 따라 갈라지는 여러 개의 경로입니다.
      </>
    ),
    chip: 'SSP 시나리오 — 미래는 하나의 값이 아니라 선택이 만드는 여러 경로',
  },
  {
    label: '이 개념이 쓰이는 곳',
    body: (
      <>
        <span className="text-act-2">2050 탄소중립 목표</span>, 지자체 기후변화 적응대책, 해안 제방과 댐의 설계 기준이
        모두 이 시나리오 위에서 정해집니다.
      </>
    ),
  },
]

export function S5Future({ onNext }: { onNext: () => void }) {
  const { setDragged2100, trendGuess } = useJourney()
  /*
   * 2단계의 마지막 문. 여기까지 사용자는 기상(값)과 기후(방향)를 둘 다 겪었다.
   * 그 차이를 정리하기에 가장 납득되는 자리가 바로 여기다 — 맨 마지막 엔딩에서
   * 꺼내면 이미 다 지나간 이야기가 된다 (→ components/WeatherVsClimate).
   */
  const [outro, setOutro] = useState(false)
  const trend = useMemo(() => yearlyTrend(), [])
  const lastObs = yearly[yearly.length - 1]
  /** 부채의 경첩 — 최근 10년 평균. 관측·사용자 연장선·시나리오가 모두 여기서 출발한다. */
  const hinge = useMemo(() => {
    const last10 = yearly.slice(-10)
    return last10.reduce((s, r) => s + r.tavg, 0) / last10.length
  }, [])
  /** 관측 추세를 그대로 2100년까지 밀었을 때의 값 */
  const naiveExtension = hinge + trend.slope * (LAST_YEAR - lastObs.year)
  /**
   * 2단계에서 사용자가 직접 찍었던 추세를 그대로 민 값 — 여정의 연결선.
   * "아까 당신이 그린 기울기가 여기까지 온다"는 것을 보여줘야, 40년 화면과 100년
   * 화면이 별개의 두 그래프가 아니라 하나의 이야기가 된다.
   */
  const guessExtension = trendGuess
    ? hinge + (trendGuess.perDecade / 10) * (LAST_YEAR - lastObs.year)
    : null

  const yDomain: [number, number] = [13.5, 22.5]
  const xDomain: [number, number] = [yearly[0].year - 1, LAST_YEAR + 1]
  const y = linearScale(yDomain, [H - CHART_MARGINS.bottom, CHART_MARGINS.top])

  /** 도입 세 마디를 지났는가 — 지나기 전에는 그래프를 아예 띄우지 않는다 */
  const [introDone, setIntroDone] = useState(false)
  const [endValue, setEndValue] = useState<number>(Number(hinge.toFixed(2)))
  const [touched, setTouched] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [fan, setFan] = useState(0) // 0 → 1 부채꼴 펼침 진행도
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!revealed) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400)
      setFan(t < 1 ? 1 - (1 - t) ** 3 : 1)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [revealed])

  const valueFrom = (clientY: number): number => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return endValue
    return Number(clamp(y.invert(clientY - rect.top), yDomain[0], yDomain[1]).toFixed(2))
  }

  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    if (touched && !revealed) {
      setRevealed(true)
      setDragged2100(endValue)
    }
  }

  /** 사용자의 선이 어느 시나리오에 가장 가까운가 */
  const nearest = useMemo(() => {
    let best = scenarios[0]
    let bestGap = Infinity
    for (const s of scenarios) {
      const gap = Math.abs(s.points[s.points.length - 1].tavg - endValue)
      if (gap < bestGap) {
        bestGap = gap
        best = s
      }
    }
    return { scenario: best, gap: bestGap }
  }, [endValue])

  // 훅은 모두 위에서 부른 뒤에 갈라진다 (조건부 훅 금지)
  if (!introDone) {
    return (
      <StageIntro
        eyebrow="2단계-B · 100년"
        steps={INTRO}
        tone="var(--color-act-2)"
        onDone={() => setIntroDone(true)}
      />
    )
  }

  /* 2단계를 닫는 화면 — 기상과 기후를 둘 다 겪은 직후에만 납득되는 정리다 */
  if (outro) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <WeatherVsClimate
          footer={
            <div className="flex items-center justify-between gap-6">
              <p className="text-[12px] leading-relaxed text-ink-2">
                여기까지가 <span className="text-ink-1">사람이 만든 기후</span> 이야기입니다. 다음은 사람이
                등장하기 훨씬 전부터 기후를 움직여온 쪽이에요.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="btn btn-ghost px-5 py-2 text-[13px]" onClick={() => setOutro(false)}>
                  그래프로 돌아가기
                </button>
                <button type="button" className="btn btn-primary px-5 py-2 text-[13px]" onClick={onNext}>
                  그런데 이 기후를 움직이는 건 무엇일까요
                </button>
              </div>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-2">2단계-B · 100년</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {revealed ? '미래는 하나의 선이 아닙니다' : '이 곡선을 2100년까지 끌어보세요'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-series-obs" /> 관측 {yearly[0].year}–{lastObs.year}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-act-3" /> 당신의 연장선
          </span>
          {revealed &&
            scenarios.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
        </div>
      </div>

      <StageIntroBar
        chip={INTRO[1].chip!}
        tone="var(--color-act-2)"
        onReplay={() => setIntroDone(false)}
      />

      <div className="panel p-4">
        <div
          ref={wrapRef}
          className={revealed ? '' : 'cursor-ns-resize'}
          onPointerDown={(e) => {
            if (revealed) return
            dragging.current = true
            setEndValue(valueFrom(e.clientY))
            setTouched(true)
          }}
          onPointerMove={(e) => {
            if (!dragging.current || revealed) return
            setEndValue(valueFrom(e.clientY))
            setTouched(true)
          }}
          onPointerUp={release}
          onPointerLeave={release}
        >
          <YearlyChart
            width={W}
            height={H}
            records={yearly}
            xDomain={xDomain}
            yDomain={yDomain}
            trend={trend}
            trendVisible={false}
            xTicks={[2000, 2025, 2050, 2075, 2100]}
            tooltipEnabled={false}
          >
            {({ x }) => {
              const clipW = Math.max(0, (x(LAST_YEAR) - x(2024)) * fan)
              return (
                <g>
                  {/* 최근 10년 평균 = 부채의 경첩 */}
                  <line
                    x1={x(lastObs.year - 9)}
                    x2={x(lastObs.year)}
                    y1={y(hinge)}
                    y2={y(hinge)}
                    stroke="var(--color-act-2)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  <text
                    x={x(lastObs.year - 9) - 6}
                    y={y(hinge) - 10}
                    textAnchor="end"
                    fontSize={10.5}
                    fill="var(--color-act-2)"
                    className="tnum"
                  >
                    최근 10년 평균 {hinge.toFixed(1)}℃
                  </text>
                  {/* 관측/전망 경계 */}
                  <line
                    x1={x(lastObs.year)}
                    x2={x(lastObs.year)}
                    y1={CHART_MARGINS.top}
                    y2={H - CHART_MARGINS.bottom}
                    stroke="rgb(255 255 255 / 0.18)"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={x(lastObs.year) - 6}
                    y={CHART_MARGINS.top + 10}
                    textAnchor="end"
                    fontSize={10.5}
                    fill="var(--color-ink-3)"
                  >
                    관측 끝
                  </text>

                  {/* 시나리오 부채꼴 — 클립 사각형이 오른쪽으로 열린다 */}
                  <defs>
                    <clipPath id="fan-clip">
                      <rect x={x(2024)} y={0} width={clipW} height={H} />
                    </clipPath>
                  </defs>
                  {revealed && (
                    <g clipPath="url(#fan-clip)">
                      {scenarios.map((s) => {
                        const pts = [
                          [x(lastObs.year), y(hinge)] as [number, number],
                          ...s.points.map((p) => [x(p.year), y(p.tavg)] as [number, number]),
                        ]
                        const hi = s.points.map((p) => [x(p.year), y(p.high)] as [number, number])
                        const lo = s.points.map((p) => [x(p.year), y(p.low)] as [number, number]).reverse()
                        const band = `${smoothPath(hi)} L${lo[0][0]} ${lo[0][1]} ${smoothPath(lo).slice(1)} Z`
                        return (
                          <g key={s.id}>
                            <path d={band} fill={s.color} opacity={0.16} />
                            <path
                              d={smoothPath(pts)}
                              fill="none"
                              stroke={s.color}
                              strokeWidth={2}
                              strokeLinecap="round"
                            />
                          </g>
                        )
                      })}
                    </g>
                  )}

                  {/* 시나리오 직접 라벨 */}
                  {revealed &&
                    fan > 0.85 &&
                    scenarios.map((s) => {
                      const last = s.points[s.points.length - 1]
                      return (
                        <text
                          key={`lbl-${s.id}`}
                          x={x(LAST_YEAR) + 8}
                          y={y(last.tavg) + 4}
                          fontSize={11}
                          fontWeight={600}
                          fill={s.color}
                          className="tnum"
                        >
                          {s.label}
                        </text>
                      )
                    })}

                  {/* 사용자의 연장선 */}
                  <line
                    x1={x(lastObs.year)}
                    x2={x(LAST_YEAR)}
                    y1={y(hinge)}
                    y2={y(endValue)}
                    stroke="var(--color-act-3)"
                    strokeWidth={2.5}
                    strokeDasharray={revealed ? '6 5' : undefined}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={x(LAST_YEAR)}
                    cy={y(endValue)}
                    r={7}
                    fill="var(--color-act-3)"
                    stroke="var(--color-space-1)"
                    strokeWidth={2}
                  />
                  {!revealed && (
                    <text
                      x={x(LAST_YEAR) - 12}
                      y={y(endValue) - 14}
                      textAnchor="end"
                      fontSize={11.5}
                      fontWeight={600}
                      fill="var(--color-act-3)"
                      className="tnum"
                    >
                      2100년 {endValue.toFixed(2)}℃
                    </text>
                  )}
                </g>
              )
            }}
          </YearlyChart>
        </div>

        {!revealed && (
          <div className="mt-2 flex items-center gap-3 px-1">
            <span className="text-[11px] whitespace-nowrap text-ink-3">2100년 값</span>
            <input
              className="slider"
              type="range"
              min={yDomain[0]}
              max={yDomain[1]}
              step={0.05}
              value={endValue}
              onChange={(e) => {
                setEndValue(Number(e.target.value))
                setTouched(true)
              }}
              aria-label="2100년 연평균기온 연장값"
            />
            <button
              type="button"
              className="btn btn-primary shrink-0 px-5 py-2 text-[13px]"
              disabled={!touched}
              onClick={() => {
                setRevealed(true)
                setDragged2100(endValue)
              }}
            >
              손 떼기
            </button>
          </div>
        )}
      </div>

      {!revealed ? (
        <p className="max-w-4xl text-[13.5px] leading-relaxed text-ink-2">
          {guessExtension !== null && (
            <>
              방금 40년 화면에서 추세를{' '}
              <span className="tnum font-semibold" style={{ color: 'var(--color-act-3)' }}>
                {trendGuess!.perDecade > 0 ? '+' : ''}
                {trendGuess!.perDecade.toFixed(2)}℃/10년
              </span>
              으로 찍으셨죠. 그 기울기를 그대로 밀면 2100년은{' '}
              <span className="tnum text-ink-1">{guessExtension.toFixed(1)}℃</span>가 됩니다.{' '}
            </>
          )}
          {guessExtension !== null ? '실제 관측 추세로 밀면 ' : '관측 추세를 그대로 2100년까지 밀면 '}
          <span className="tnum text-ink-1">{naiveExtension.toFixed(1)}℃</span>
          {guessExtension !== null ? '고요.' : '입니다.'} 하지만 그건 지난 40년의 속도가 그대로 유지된다는 가정일
          뿐이에요 —{' '}
          <span className="text-ink-1">기후는 직선으로 움직이지 않습니다.</span> 어디에 점을 놓으시겠어요? 끌었다가 손을
          떼면 과학이 계산한 답이 펼쳐집니다.
        </p>
      ) : (
        /* 결과 문장과 시나리오 설명을 한 패널에 넣는다 — 1280×800 에서 둘로 나누면
           세로가 넘친다. 곡선 세 개만 보여주고 SSP 가 뭔지 안 알려주면 이 화면은
           읽히지 않으므로, 자리를 만들어야 하는 쪽은 결과 문장이다. */
        <div className="panel flex flex-col gap-2.5 px-5 py-3 rise">
          <div className="flex items-start justify-between gap-6">
            <p className="text-[13px] leading-relaxed text-ink-2">
              당신이 놓은 2100년은 <span className="tnum font-semibold text-act-3">{endValue.toFixed(2)}℃</span> —{' '}
              <span style={{ color: nearest.scenario.color }} className="font-semibold">
                {nearest.scenario.label}
              </span>{' '}
              경로와 가장 가깝습니다. 미래는 하나의 선이 아니라{' '}
              <span className="text-ink-1">갈라지는 부채</span>예요. 세 갈래는 물리가 아니라 배출량 선택이 만듭니다 —{' '}
              <span className="text-ink-1">어느 갈래인지는 인간의 선택</span>입니다.
            </p>
            <button type="button" className="btn btn-primary shrink-0" onClick={() => setOutro(true)}>
              여기까지 정리하고 넘어가기
            </button>
          </div>

          <ScenarioGuide nearestId={nearest.scenario.id} />
        </div>
      )}
    </div>
  )
}

/**
 * SSP 세 시나리오가 각각 무엇을 뜻하는지.
 *
 * 곡선 세 개와 'SSP5-8.5' 라는 이름만으로는 아무것도 읽히지 않는다. 이름을 풀고,
 * 어떤 세상을 가정한 경로인지 한 줄로 붙인다.
 *
 * ⚠️ 숫자를 두 벌 보여주는 이유.
 * 흔히 인용되는 "+1.8 / +2.7 / +4.4℃" 는 **전 지구 평균**을 **산업화 이전(1850–1900)**
 * 과 비교한 값이다(IPCC AR6, 2081–2100). 반면 이 그래프는 **경상권 연평균기온**을
 * **1995–2014 평균**과 비교한다. 지역도 기준연도도 다르므로 두 값은 원래 일치하지
 * 않는다. 한쪽만 적어두면 "그래프는 +6.1인데 표는 +4.4"라는 모순으로 읽히므로,
 * 둘 다 적고 기준이 다르다는 것을 밝힌다 — 그리고 그 차이 자체가 가르칠 거리다.
 * 중위도 육지는 전 지구 평균보다 빠르게 데워진다.
 */
type ScenarioNote = {
  /** 한 단어 등급 — 카드를 훑을 때 가장 먼저 읽히는 것 */
  grade: string
  /** 이 경로를 만드는 사회의 모습 (SSP 는 배출량이 아니라 사회 시나리오다) */
  society: string
  /** 그 사회에서 실제로 벌어지는 일 */
  impact: string
  /** 이 경로로 가려면 / 이 경로를 피하려면 무엇을 해야 하는가 */
  actsTitle: string
  acts: string[]
  /** 전 지구 평균 상승폭 (IPCC AR6, 2081–2100, 산업화 이전 대비) */
  global: string
}

/**
 * 세 시나리오의 상세.
 *
 * 원래는 5열짜리 한 줄 표였다. 심사 피드백이 "각기 내용을 더 자세히, 대응방안도"
 * 라고 짚어 카드로 펼쳤다. 한 줄에 다 넣으려다 보니 SSP 가 **배출량 시나리오가
 * 아니라 사회 시나리오**라는 가장 중요한 사실이 빠져 있었다 — 그래서 society 를
 * 첫 칸에 둔다. 곡선이 갈라지는 이유는 물리가 아니라 사회이기 때문이다.
 */
const SCENARIO_NOTE: Record<string, ScenarioNote> = {
  ssp126: {
    grade: '저배출 · 지속가능',
    society: '재생에너지와 전기화로 에너지를 바꾸고, 2050년 무렵 배출과 흡수가 맞아떨어지는(탄소중립) 세상.',
    impact:
      '이미 배출한 몫 때문에 21세기 중반까지는 계속 더워집니다. 그래도 후반에 곡선이 눕는 유일한 경로예요.',
    actsTitle: '이 길로 가려면',
    acts: [
      '발전을 무탄소 전원(재생·원자력)으로 교체',
      '건물 단열·수송 전동화로 에너지 수요 자체를 줄이기',
      '숲·갯벌 등 흡수원 복원과 탄소 포집·저장',
    ],
    global: '+1.8',
  },
  ssp245: {
    grade: '중간 · 현재 궤도',
    society: '각국이 선언한 감축 목표는 있으나 이행은 절반쯤인 세상. 지금 정책의 연장선에 가장 가깝습니다.',
    impact:
      '폭염일수와 집중호우가 지금의 몇 배로 잦아집니다. 감축이 늦어진 만큼 적응에 드는 비용이 커져요.',
    actsTitle: '여기서 벗어나려면',
    acts: [
      '선언을 이행으로 — 감축 목표의 점검·공시 체계',
      '폭염·집중호우에 맞춘 도시 인프라 재설계',
      '농업 품종 전환과 물 관리 적응 계획',
    ],
    global: '+2.7',
  },
  ssp585: {
    grade: '고배출 · 화석연료 기반',
    society: '기술과 경제는 빠르게 성장하지만 그 동력을 여전히 화석연료에서 얻는 세상.',
    impact:
      '해수면 상승과 생태계 이동이 적응 속도를 앞지릅니다. 사람이 살기 어려워지는 지역이 생겨요.',
    actsTitle: '이 경로에 대한 대응',
    acts: [
      '대응이 아니라 회피의 대상입니다',
      '적응만으로 감당할 수 없는 지역이 나옵니다',
      '넘고 나서 고치는 비용이 넘지 않는 비용보다 훨씬 큽니다',
    ],
    global: '+4.4',
  },
}

const GRADE_TONE: Record<string, string> = {
  ssp126: 'var(--color-good)',
  ssp245: 'var(--color-warn)',
  ssp585: 'var(--color-bad)',
}

function ScenarioGuide({ nearestId }: { nearestId: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/8 pt-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[12.5px] font-semibold">세 갈래는 각각 어떤 세상일까요</h3>
        <span className="text-[10.5px] text-ink-3">
          SSP = 공통사회경제경로 — <span className="text-ink-2">배출량이 아니라 ‘사회’ 시나리오</span>입니다 · 뒤의
          숫자는 2100년의 온실가스 강제력(W/m²)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {scenarios.map((s) => {
          const g = SCENARIO_NOTE[s.id]
          const last = s.points[s.points.length - 1]
          const isNearest = s.id === nearestId
          return (
            <div
              key={s.id}
              className="flex flex-col gap-1.5 rounded-xl border px-3 py-2.5"
              style={{
                borderColor: isNearest ? s.color : 'rgb(255 255 255 / 0.1)',
                background: isNearest ? `color-mix(in oklab, ${s.color} 10%, transparent)` : 'transparent',
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: s.color }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="text-[10px]" style={{ color: GRADE_TONE[s.id] ?? 'var(--color-ink-2)' }}>
                  {g?.grade}
                </span>
              </div>

              {/* 숫자 두 벌 — 아래 각주가 왜 다른지 설명한다 */}
              <div className="tnum flex items-baseline justify-between gap-2 border-y border-white/8 py-1 text-[11px]">
                <span className="text-ink-3">
                  {sspRegion} <span className="font-semibold text-ink-1">{last.tavg.toFixed(1)}℃</span> (+
                  {last.anomaly.toFixed(1)})
                </span>
                <span className="text-ink-3">
                  전 지구 <span className="text-ink-2">{g?.global}℃</span>
                </span>
              </div>

              <p className="text-[11px] leading-relaxed text-ink-2">{g?.society}</p>
              <p className="text-[11px] leading-relaxed text-ink-3">{g?.impact}</p>

              <div className="mt-auto border-t border-white/8 pt-1.5">
                <div className="text-[10px] font-medium tracking-[0.08em]" style={{ color: GRADE_TONE[s.id] }}>
                  {g?.actsTitle}
                </div>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {g?.acts.map((a) => (
                    <li key={a} className="text-[10.5px] leading-relaxed text-ink-2">
                      · {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10.5px] leading-relaxed text-ink-3">
        두 숫자의 기준이 다릅니다 — {sspRegion} 값은 {sspBaseline.period} 평균({sspBaseline.tavg}℃) 대비,
        전 지구 평균은 산업화 이전(1850–1900) 대비입니다. 그래서 값이 서로 다른 게 정상이고,
        <span className="text-ink-2"> 중위도 육지가 전 지구 평균보다 빠르게 데워진다</span>는 뜻이기도 합니다.
        바다는 천천히 데워지거든요.
      </p>
    </div>
  )
}
