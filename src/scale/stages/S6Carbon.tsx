/**
 * S6 · 탄소 레이어 충돌.
 *
 * 기획안 §3 S6. S5 에서 사용자가 직접 만든 자연 곡선 옆에 실제 CO₂ 기온 곡선을
 * 놓는다. 비교하는 것은 **같은 크기의 변화가 도착하는 데 걸린 시간**이다.
 *
 * x축이 로그인 이유: 자연은 5만 년, 탄소는 274년이다. 선형 축에 놓으면 둘 중
 * 하나는 반드시 안 보인다 — 처음엔 선형 5만 년으로 그렸는데 탄소가 왼쪽 끝의
 * 선 한 줄로 뭉개지고, 오른쪽 3만 년어치는 아무것도 없는 빈 칸이었다. 로그 축은
 * 모든 자릿수에 자리를 똑같이 주므로 274년과 5만 년이 한 화면에서 다 읽힌다.
 *
 * 로그 축은 눈금을 왜곡해 극적으로 만드는 장치가 아니다. 오히려 반대로, 선형
 * 축이 만들던 '수직 절벽'이라는 과장을 걷어내고 두 기울기를 정직하게 맞댄다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChartFrame } from '../components/ChartFrame'
import { useGlobe } from '../components/GlobeLayer'
import { PREINDUSTRIAL_CO2, PRESENT_CO2 } from '../lib/earthState'
import {
  CARBON_END_YEAR,
  CARBON_START_YEAR,
  NATURAL_HORIZON_YEARS,
  carbonCurve,
  carbonWarmingNow,
  naturalCurveLog,
  naturalEndDelta,
} from '../lib/longTermClimate'
import { linearScale, niceTicks, smoothPath } from '../lib/scales'
import { surfaceFromAnomaly } from '../lib/surfaceState'
import { useWorld } from '../state/world'

const W = 900
const H = 400
const M = { top: 24, right: 120, bottom: 36, left: 52 }

/** CO₂ 카운트업 시간 (ms) */
const COUNT_MS = 2600

export function S6Carbon({ onNext }: { onNext: () => void }) {
  const { orbit, setCo2 } = useWorld()
  const { setClimateTint, setSurface } = useGlobe()
  const [carbonOn, setCarbonOn] = useState(false)
  /** 카운트업 진행도 0…1 — 곡선이 그려지는 정도이자 대시보드 숫자의 진행도 */
  const [t, setT] = useState(0)

  const natural = useMemo(() => naturalCurveLog(orbit), [orbit])
  const carbon = useMemo(() => carbonCurve(), [])
  const endDelta = naturalEndDelta(orbit)
  const nowWarming = carbonWarmingNow()

  /*
   * 토글이 켜지면 산업화 이전 → 현재로 밀어 올린다. 대시보드의 CO₂ 와 기온이
   * 같은 진행도를 공유하므로, 곡선이 솟는 동안 하단 숫자도 함께 뛴다.
   */
  const raf = useRef(0)
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    const from = t
    const to = carbonOn ? 1 : 0
    if (from === to) return
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const p = Math.min(1, (now - start) / COUNT_MS)
      const v = from + (to - from) * p
      setT(v)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // t 를 의존성에 넣으면 매 프레임 effect 가 다시 돈다 — 시작값은 ref 처럼 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carbonOn])

  // 대시보드 CO₂ · 지구 색 · 지표 — 전부 같은 진행도를 따른다.
  // 토글을 켜면 S5 에서 자라 있던 빙상이 물러나고 육지가 마르기 시작한다.
  const ppmNow = PREINDUSTRIAL_CO2 + (PRESENT_CO2 - PREINDUSTRIAL_CO2) * t
  useEffect(() => {
    setCo2(Math.round(ppmNow))
    setClimateTint(t * 0.9)
    setSurface(surfaceFromAnomaly(endDelta * (1 - t) + nowWarming * t))
  }, [ppmNow, t, endDelta, nowWarming, setCo2, setClimateTint, setSurface])

  // 이 단계를 떠날 때 CO₂ 를 현재 지구 값으로 돌려놓는다 — 다음 단계가 산업화
  // 이전 농도를 물려받으면 대시보드가 거짓말을 한다.
  useEffect(() => () => setCo2(PRESENT_CO2), [setCo2])

  /* x = 지금으로부터 걸린 시간(년), 로그. 1년부터 5만 년까지 모든 자릿수가 같은 폭. */
  const lx = linearScale([0, Math.log10(NATURAL_HORIZON_YEARS)], [M.left, W - M.right])
  const x = (years: number) => lx(Math.log10(Math.max(1, years)))

  /*
   * y 범위는 데이터에 맞춘다. S5 에서 실험 구간까지 밀고 오면 자연 끝값이 +30℃
   * 같은 값이 되는데, 고정 축이면 곡선이 화면 밖으로 나가 사라진다 — 실제로 그랬다.
   */
  const rawLo = Math.min(endDelta, 0) - 1
  const rawHi = Math.max(endDelta, nowWarming) + 1
  // 너무 납작해지지 않도록 최소 폭은 지켜준다
  const pad = Math.max(0, 3.5 - (rawHi - rawLo)) / 2
  const yLo = Math.floor((rawLo - pad) * 2) / 2
  const yHi = Math.ceil((rawHi + pad) * 2) / 2
  const y = linearScale([yLo, yHi], [H - M.bottom, M.top])

  // 자연: 앞으로 5만 년에 걸쳐 도착하는 변화
  const naturalPts = natural.filter((p) => p.year >= 1).map((p) => [x(p.year), y(p.delta)] as [number, number])
  // 탄소: 지난 274년 동안 이미 도착한 변화 (1750년을 0 으로 둔 경과 시간)
  const carbonElapsed = carbon.map((p) => ({
    years: p.year + (CARBON_END_YEAR - CARBON_START_YEAR),
    delta: p.delta - carbon[0].delta,
  }))
  const shown = carbonElapsed.slice(0, Math.max(2, Math.ceil(carbonElapsed.length * t)))
  const carbonPts = shown.filter((p) => p.years >= 1).map((p) => [x(p.years), y(p.delta)] as [number, number])
  const head = carbonPts[carbonPts.length - 1] ?? [x(1), y(0)]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">여정의 끝 · 전체</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {t > 0.6 ? '274년이 5만 년을 앞질렀습니다' : '두 시계를 같은 축에 놓으면'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setCarbonOn((v) => !v)}
          aria-pressed={carbonOn}
          className="flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] transition-colors"
          style={{
            borderColor: carbonOn ? 'color-mix(in oklab, var(--color-bad) 60%, transparent)' : 'rgb(255 255 255 / 0.16)',
            background: carbonOn ? 'color-mix(in oklab, var(--color-bad) 16%, transparent)' : 'transparent',
            color: carbonOn ? 'var(--color-ink-1)' : 'var(--color-ink-2)',
          }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: carbonOn ? 'var(--color-bad)' : 'rgb(255 255 255 / 0.3)' }}
          />
          탄소 레이어 {carbonOn ? '켜짐' : '꺼짐'}
        </button>
      </div>

      <div className="panel p-4">
        <ChartFrame
          width={W}
          height={H}
          margins={M}
          x={lx}
          y={y}
          xTicks={[1, 10, 100, 1_000, 10_000, 50_000].map((v) => Math.log10(v))}
          yTicks={niceTicks(yLo + 0.5, yHi - 0.5, 6)}
          xTickFormat={(v) => {
            const years = Math.round(10 ** v)
            return years >= 10_000 ? `${years / 10_000}만 년` : years >= 1_000 ? `${years / 1_000}천 년` : `${years}년`
          }}
          yTickFormat={(v) => `${v > 0 ? '+' : ''}${v}`}
          yUnit="℃"
        >
          <line
            x1={M.left}
            x2={W - M.right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--color-ink-3)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />

          {/* 자연 곡선 — S5 에서 사용자가 만든 그것 */}
          <path d={smoothPath(naturalPts)} fill="none" stroke="var(--color-act-3)" strokeWidth={2.5} strokeLinecap="round" />
          <text
            x={W - M.right + 8}
            y={y(endDelta) + 4}
            fontSize={11}
            fill="var(--color-act-3)"
            className="tnum"
          >
            자연 {endDelta.toFixed(1)}℃
          </text>

          {/* 탄소 곡선 — 270년이 5만 년 축 위에서는 수직선 한 줄이다 */}
          {t > 0 && (
            <>
              <path
                d={smoothPath(carbonPts)}
                fill="none"
                stroke="var(--color-bad)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={head[0]} cy={head[1]} r={5} fill="var(--color-bad)" />
              <text
                x={head[0] + 10}
                y={head[1] - 8}
                fontSize={12}
                fontWeight={600}
                fill="var(--color-bad)"
                className="tnum"
              >
                +{(nowWarming * t).toFixed(2)}℃
              </text>
            </>
          )}
        </ChartFrame>

        <div className="mt-1 flex items-center justify-between text-[10.5px] text-ink-3">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--color-act-3)' }} />
            자연 변수만 (교육용 단순화 모델) · 5만 년에 걸쳐
            <span className="mx-2">|</span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--color-bad)' }} />
            CO₂ {PREINDUSTRIAL_CO2} → {PRESENT_CO2} ppm 이 만든 기온 · {CARBON_END_YEAR - CARBON_START_YEAR}년 만에
          </span>
          <span className="tnum">
            {Math.round(ppmNow)} ppm · {CARBON_START_YEAR + Math.round(t * (CARBON_END_YEAR - CARBON_START_YEAR))}년
          </span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-6">
        <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
          {t > 0.6 ? (
            <>
              {Math.abs(endDelta) < 0.05 ? (
                <>
                  자연은 5만 년 동안 <span className="text-ink-1">사실상 아무것도 하지 않는데</span>,
                </>
              ) : (
                <>
                  자연이 5만 년에 걸쳐 <span className="tnum text-ink-1">{Math.abs(endDelta).toFixed(1)}℃</span> 를{' '}
                  {endDelta < 0 ? '내리는' : '올리는'} 동안,
                </>
              )}{' '}
              인류는{' '}
              <span className="tnum" style={{ color: 'var(--color-bad)' }}>
                {CARBON_END_YEAR - CARBON_START_YEAR}년
              </span>{' '}
              만에{' '}
              <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                +{nowWarming.toFixed(2)}℃
              </span>{' '}
              를 올렸습니다.{' '}
              <span className="text-ink-1">
                같은 크기의 변화가 {Math.round(NATURAL_HORIZON_YEARS / (CARBON_END_YEAR - CARBON_START_YEAR))}배 빠르게
                도착한 것
              </span>
              이 문제예요 — 가로축이 로그라 두 기울기를 그대로 맞대어 볼 수 있습니다.
              {Math.abs(endDelta) < 0.05 && ' 앞 단계로 돌아가 궤도 다이얼을 돌리면 보라색 곡선이 움직입니다.'}
            </>
          ) : (
            <>
              방금 만드신 보라색 곡선이 자연의 시계입니다. 어느 쪽으로 돌려도 아래로 향했죠. 이제 오른쪽 위 토글로{' '}
              <span className="text-ink-1">탄소 레이어</span>를 켜보세요.
            </>
          )}
        </p>
        {t > 0.6 ? (
          <button type="button" className="btn btn-primary shrink-0 rise" onClick={onNext}>
            처음의 질문으로
          </button>
        ) : (
          <button type="button" className="btn btn-ghost shrink-0" onClick={() => setCarbonOn(true)}>
            켜기
          </button>
        )}
      </div>
    </div>
  )
}
