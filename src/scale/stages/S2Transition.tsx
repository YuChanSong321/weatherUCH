/**
 * S2 · 시간 압축 레버 — "날씨가 기후가 되는 순간".
 *
 * 기획안 §3 S2: 사용자가 **시간축 레버를 직접 당긴다**. 자동 재생이 아니다.
 * 당기는 만큼 365개의 점이 월평균으로, 다시 연평균 하나로 눌린다. 노이즈가
 * 사라지는 그 과정을 손이 만들어야 "이게 날씨입니다 → 이것이 기후입니다"가
 * 설명이 아니라 경험이 된다 (§2 원칙 1: 조작 먼저, 설명 나중).
 *
 * 지구본은 지금 화면이 말하는 값을 색으로 따라간다. 레버가 왼쪽(일)에 있으면
 * 그 해의 실제 일별 기온을 훑으며 요동치고, 오른쪽(연)으로 갈수록 연평균 하나로
 * 가라앉는다 — 지구가 흔들리다 멈추는 것이 이 단계의 논지 그 자체다.
 *
 * ⚠️ 레버는 **예측을 제출한 뒤에만** 열린다. 처음엔 그냥 당기게 두었는데, 어차피
 * 보여줄 데이터를 여는 동작이라 건너뛰어도 손해가 없었고 그래서 심심했다. 먼저
 * 답을 받아두면 같은 조작이 곧 정답 공개가 된다 — 조작 하나가 두 배로 일한다.
 *
 * 첫 문장은 S1 의 "2주 벽"을 반드시 되짚는다. 벽 이야기 직후에 갑자기 365개의 점이
 * 나오면 "질문에 답을 안 하고 딴 얘기"로 읽히기 때문이다. 벽을 넘는 방법이 예보를
 * 늘리는 게 아니라 대상을 바꾸는 것이라는 걸 여기서 한 줄로 이어붙인다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChartFrame } from '../components/ChartFrame'
import { useGlobe } from '../components/GlobeLayer'
import { monthlyNormals } from '../data/loader'
import { linearScale, niceTicks, smoothPath } from '../lib/scales'
import { useClimate } from '../state/climate'
import { useJourney } from '../state/journey'

const W = 960
const H = 380
const M = { top: 20, right: 28, bottom: 34, left: 46 }

const MONTH_CENTER = [15.5, 46, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5]

/** 레버가 지나는 세 지점 */
const DETENTS = [
  { at: 0, label: '일', caption: '365개의 점' },
  { at: 0.5, label: '월', caption: '12개의 평균' },
  { at: 1, label: '연', caption: '1개의 숫자' },
] as const

const COPY = [
  {
    title: '365개의 점',
    body: '하루하루의 기온입니다. 방금 맞히려 하셨던 것 — 이것이 날씨예요. 가까이서 보면 위아래로 마구 튑니다.',
  },
  {
    title: '월별로 묶으면',
    body: '흩어진 점들 뒤에서 계절이 드러납니다. 개별 날짜는 예측할 수 없어도, 7월이 1월보다 덥다는 건 틀릴 수 없어요.',
  },
  {
    title: '1년을 하나의 숫자로',
    body: '365일을 눌러 평균 하나로 만들면 날씨는 사라지고 기후가 남습니다. 이제 이 점을 40년 동안 찍어볼까요.',
  },
] as const

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const doyOf = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1
}

export function S2Transition({ year, onNext }: { year: number; onNext: () => void }) {
  const climate = useClimate()
  const { setClimateTint } = useGlobe()
  const { yearMeanGuess, setYearMeanGuess } = useJourney()
  /** 레버 위치 0(일) … 1(연) */
  const [lever, setLever] = useState(0)
  const [pulled, setPulled] = useState(false)
  /** 제출 전에는 레버가 잠겨 있다 */
  const submitted = yearMeanGuess !== null

  const model = useMemo(() => {
    const prefix = String(year)
    let records = climate.daily.filter((r) => r.date.startsWith(prefix))
    // 고른 해가 이 지역 자료에 없을 수 있다 (지역마다 관측 구간이 다르다)
    if (records.length < 300) {
      const lastYear = climate.daily[climate.daily.length - 1]?.date.slice(0, 4)
      records = climate.daily.filter((r) => r.date.startsWith(String(lastYear)))
    }
    const shownYear = Number(records[0]?.date.slice(0, 4) ?? year)
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const rows = records.filter((r) => Number(r.date.slice(5, 7)) === m + 1)
      return rows.reduce((s, r) => s + r.tavg, 0) / (rows.length || 1)
    })
    const yearMean =
      climate.yearly.find((r) => r.year === shownYear)?.tavg ??
      records.reduce((s, r) => s + r.tavg, 0) / (records.length || 1)
    // 흩어짐(표준편차) — 레버를 당길수록 이 숫자가 줄어드는 것이 이 화면의 요점이다
    const sd = (xs: number[]) => {
      const m0 = xs.reduce((a, b) => a + b, 0) / xs.length
      return Math.sqrt(xs.reduce((s, v) => s + (v - m0) ** 2, 0) / xs.length)
    }
    return {
      records,
      shownYear,
      monthly,
      yearMean,
      sdDaily: sd(records.map((r) => r.tavg)),
      sdMonthly: sd(monthly),
    }
  }, [climate.daily, climate.yearly, year])

  /*
   * 지구 색. 레버가 왼쪽이면 그 해의 실제 일별 기온을 훑으며 흔들리고, 오른쪽으로
   * 갈수록 연평균 하나로 잦아든다. rAF 로 도는 이유는 '흔들림'이 시간의 함수이기
   * 때문이다 — 레버 값만으로는 요동을 만들 수 없다.
   */
  const leverRef = useRef(lever)
  leverRef.current = lever
  useEffect(() => {
    if (model.records.length === 0) return
    let raf = 0
    let t0 = 0
    const spread = Math.max(1, model.sdDaily)
    const tick = (now: number) => {
      if (!t0) t0 = now
      const days = ((now - t0) / 1000) * 45 // 초당 45일
      const i = Math.floor(days) % model.records.length
      const dayAnomaly = (model.records[i].tavg - model.yearMean) / (spread * 1.6)
      const settle = leverRef.current // 1 이면 완전히 가라앉는다
      setClimateTint(dayAnomaly * (1 - settle))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      setClimateTint(0)
    }
  }, [model, setClimateTint])

  const temps = model.records.map((r) => r.tavg)
  const yDomain: [number, number] = [Math.floor(Math.min(...temps) - 1), Math.ceil(Math.max(...temps) + 1)]
  // 예측 슬라이더의 시작값은 축의 가운데다. 실제 연평균에서 출발하면 정답을 흘린다.
  const [guess, setGuess] = useState(() => Math.round(((yDomain[0] + yDomain[1]) / 2) * 2) / 2)
  const x = linearScale([1, 366], [M.left, W - M.right])
  const y = linearScale(yDomain, [H - M.bottom, M.top])
  const yTicks = niceTicks(yDomain[0], yDomain[1], 5)

  const monthPts = model.monthly.map((v, i) => [x(MONTH_CENTER[i]), y(v)] as [number, number])
  const normalPts = monthlyNormals.map((n, i) => [x(MONTH_CENTER[i]), y(n.tavg)] as [number, number])
  const meanX = x(183)
  const meanY = y(model.yearMean)

  // 0…0.5 은 일→월, 0.5…1 은 월→연. 각 구간을 0…1 로 펴서 보간한다.
  const toMonth = Math.min(1, lever * 2)
  const toYear = Math.max(0, lever * 2 - 1)

  const stage = lever < 0.25 ? 0 : lever < 0.85 ? 1 : 2
  const spreadNow = lerp(lerp(model.sdDaily, model.sdMonthly, toMonth), 0, toYear)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-1">전환 · 날씨에서 기후로</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">{COPY[stage].title}</h1>
        </div>
        <div className="text-right text-[11px] text-ink-3">
          <div>
            {climate.label} · {model.shownYear}년 일평균기온
          </div>
          <div className="tnum mt-0.5">
            흩어짐(표준편차) <span className="text-ink-1">{spreadNow.toFixed(1)}℃</span>
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <ChartFrame
          width={W}
          height={H}
          margins={M}
          x={x}
          y={y}
          xTicks={MONTH_CENTER}
          yTicks={yTicks}
          xTickFormat={(v) => `${MONTH_CENTER.indexOf(v) + 1}월`}
          yTickFormat={(v) => `${v}`}
          yUnit="℃"
        >
          {/* 평년값 곡선 — 비교 기준선 (관측과 역할이 다르므로 점선) */}
          <path
            d={smoothPath(normalPts)}
            fill="none"
            stroke="var(--color-ink-3)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={climate.hasBlossom ? toMonth * 0.85 * (1 - toYear) : 0}
          />

          {/* 월평균 곡선 */}
          <path
            d={smoothPath(monthPts)}
            fill="none"
            stroke="var(--color-series-obs)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={toMonth * (1 - toYear)}
          />

          {/* 일별 점 → 월평균 → 연평균. 레버가 곧 애니메이션이므로 CSS 전환은 없다. */}
          {model.records.map((r) => {
            const month = Number(r.date.slice(5, 7)) - 1
            const px = lerp(lerp(x(doyOf(r.date)), x(MONTH_CENTER[month]), toMonth), meanX, toYear)
            const py = lerp(lerp(y(r.tavg), y(model.monthly[month]), toMonth), meanY, toYear)
            return (
              <circle
                key={r.date}
                cx={px}
                cy={py}
                r={lerp(2.2, 3, lever)}
                fill="var(--color-series-obs)"
                opacity={lerp(0.5, 0.14, lever)}
              />
            )
          })}

          {/* 내 예측선 — 제출하면 남고, 연평균 점이 이 선 위/아래에 착지한다 */}
          {submitted && (
            <g>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(yearMeanGuess.guess)}
                y2={y(yearMeanGuess.guess)}
                stroke="var(--color-act-3)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <text x={M.left + 6} y={y(yearMeanGuess.guess) - 7} fontSize={11} fill="var(--color-act-3)" className="tnum">
                당신의 예측 {yearMeanGuess.guess.toFixed(1)}℃
              </text>
            </g>
          )}

          {/* 연평균 한 점 */}
          <g opacity={toYear}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={meanY}
              y2={meanY}
              stroke="var(--color-act-2)"
              strokeWidth={1.5}
              strokeDasharray="2 5"
              opacity={0.7}
            />
            <circle cx={meanX} cy={meanY} r={7} fill="var(--color-act-2)" stroke="var(--color-space-1)" strokeWidth={2} />
            <text x={meanX + 14} y={meanY - 10} fontSize={12.5} fontWeight={600} fill="var(--color-ink-1)" className="tnum">
              {model.shownYear}년 연평균 {model.yearMean.toFixed(2)}℃
            </text>
            {submitted && (
              <>
                <line
                  x1={meanX}
                  x2={meanX}
                  y1={meanY}
                  y2={y(yearMeanGuess.guess)}
                  stroke="var(--color-ink-2)"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                />
                <text
                  x={meanX - 10}
                  y={(meanY + y(yearMeanGuess.guess)) / 2 + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--color-ink-2)"
                  className="tnum"
                >
                  {Math.abs(yearMeanGuess.guess - model.yearMean).toFixed(2)}℃
                </text>
              </>
            )}
          </g>
        </ChartFrame>
      </div>

      {submitted ? (
        <Lever
          value={lever}
          onChange={(v) => {
            setLever(v)
            if (v > 0.02) setPulled(true)
          }}
        />
      ) : (
        <GuessPanel
          value={guess}
          lo={yDomain[0]}
          hi={yDomain[1]}
          year={model.shownYear}
          onChange={setGuess}
          onSubmit={() =>
            setYearMeanGuess({ year: model.shownYear, guess, actual: Number(model.yearMean.toFixed(2)) })
          }
        />
      )}

      <div className="flex items-start justify-between gap-6">
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          {!submitted ? (
            <>
              2주 뒤 그날의 기온은 아무도 못 맞힙니다. 그래서 하루를 묻는 건 여기서 접고, 1년을 통째로 눌러볼게요.
              위 차트의 점 하나하나가 하루의 기온입니다 — 이 흩어진 365개를 하나로 누르면 몇 도가 될까요?{' '}
              <span className="text-ink-1">먼저 찍고 나서 레버를 당기세요.</span>
            </>
          ) : (
            COPY[stage].body
          )}
          {climate.source === 'open-meteo-archive' && (
            <span className="text-ink-3"> · 이 지역 값은 ERA5 재분석 자료입니다.</span>
          )}
        </p>
        {lever >= 0.98 ? (
          <button type="button" className="btn btn-primary shrink-0 rise" onClick={onNext}>
            40년을 펼쳐보기
          </button>
        ) : submitted ? (
          <button type="button" className="btn btn-ghost shrink-0" onClick={() => setLever(1)}>
            {pulled ? '끝까지 당기기' : '한 번에 압축하기'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** 시간축 레버. 눈금 세 개가 붙어 있어 어디까지 당겼는지가 보인다. */
function Lever({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="panel-quiet px-4 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-ink-2">
          시간 압축 레버 — <span className="text-ink-3">오른쪽으로 당겨보세요</span>
        </span>
        <span className="text-[11px] text-ink-3">
          {DETENTS.reduce((best, d) => (Math.abs(d.at - value) < Math.abs(best.at - value) ? d : best)).caption}
        </span>
      </div>
      <div className="relative">
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="시간 압축 레버 — 일에서 월, 연으로"
          aria-valuetext={`${Math.round(value * 100)}% 압축`}
        />
        {DETENTS.map((d) => (
          <div key={d.label} className="pointer-events-none absolute top-[13px]" style={{ left: `${d.at * 100}%` }}>
            <div className="h-3 w-px bg-white/35" />
            <div
              className="-translate-x-1/2 pt-0.5 text-[10px] whitespace-nowrap"
              style={{ color: Math.abs(d.at - value) < 0.12 ? 'var(--color-ink-1)' : 'var(--color-ink-3)' }}
            >
              {d.label}
            </div>
          </div>
        ))}
      </div>
      <div className="h-3" />
    </div>
  )
}

/** 레버를 당기기 전에 받는 예측. 이 값이 곧 압축 애니메이션의 과녁이 된다. */
function GuessPanel({
  value,
  lo,
  hi,
  year,
  onChange,
  onSubmit,
}: {
  value: number
  lo: number
  hi: number
  year: number
  onChange: (v: number) => void
  onSubmit: () => void
}) {
  return (
    <div className="panel-quiet flex items-end gap-4 px-4 py-2.5">
      <div className="min-w-[9rem]">
        <div className="text-[11px] text-ink-3">{year}년 연평균기온</div>
        <div className="flex items-baseline gap-1">
          <span className="tnum text-[26px] leading-none font-semibold" style={{ color: 'var(--color-act-3)' }}>
            {value.toFixed(1)}
          </span>
          <span className="text-[12px] text-ink-3">℃</span>
        </div>
      </div>
      <div className="flex-1">
        <input
          className="slider"
          type="range"
          min={lo}
          max={hi}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={`${year}년 연평균기온 예측`}
        />
        <div className="tnum -mt-1 flex justify-between text-[10px] text-ink-3">
          <span>{lo}℃</span>
          <span>{hi}℃</span>
        </div>
      </div>
      <button type="button" className="btn btn-primary shrink-0 px-5 py-2 text-[13px]" onClick={onSubmit}>
        이 값으로 확정
      </button>
    </div>
  )
}
