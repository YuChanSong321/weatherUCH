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

/**
 * 유효숫자 2자리로 자른다. 자연 곡선은 교육용 단순화 모델이라 "1,597배" 같은
 * 정밀도는 없는 정밀도를 주장하는 셈이 된다 — "약 1,600배" 가 정직하다.
 */
const roundSig = (v: number): number => {
  if (!Number.isFinite(v) || v === 0) return v
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 1)
  return Math.round(v / mag) * mag
}

const fmtCount = (v: number): string => roundSig(v).toLocaleString('ko-KR')

/** 사람이 시간으로 느낄 수 있는 단위로 — "31년", "1,600년", "44만 년" */
const fmtYears = (y: number): string =>
  y >= 10_000 ? `${fmtCount(y / 10_000)}만 년` : `${fmtCount(y)}년`

/**
 * @param embedded 엔딩의 장면 레일 안에 얹힌 경우.
 *   내용·구조·화면 구성은 그대로 두고 **껍데기만** 옆 장면들과 맞춘다 — 판 위에
 *   올리고, 제목 줄을 kicker 형식으로 낮추고, 자기 진행 버튼을 감춘다(레일의
 *   '다음'이 그 일을 한다). 형식이 어긋나면 이 화면만 딴 데서 온 것처럼 보인다.
 */
export function S6Carbon({ onNext, embedded = false }: { onNext?: () => void; embedded?: boolean }) {
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
   * "몇 배 빠른가" 를 정직하게 계산한다.
   *
   * 이전 문구는 5만 년 ÷ 274년 = 182배를 썼다. 그건 두 구간의 길이 비일 뿐이어서
   * 변화의 크기(자연 endDelta ℃ vs 인류 nowWarming ℃)를 통째로 무시한다. 그래서
   * "같은 크기의 변화가 182배 빠르게"라는 말이 사실이 아니었고, 궤도 다이얼을 어떻게
   * 돌려도 값이 182 에 고정이었다 — 자연 곡선이 평평한 경우까지 그랬다.
   *
   * 대신 같은 크기끼리 견준다: 자연이 5만 년에 걸쳐 만드는 변화량을 인류의 속도로는
   * 몇 년에 만드는가. 두 변화의 크기가 같아지므로 '같은 크기'라는 말이 비로소 사실이
   * 되고, 배율은 순수하게 시간의 비가 된다.
   */
  const carbonYears = CARBON_END_YEAR - CARBON_START_YEAR
  const carbonRate = nowWarming / carbonYears // ℃/년
  const naturalSpan = Math.abs(endDelta)
  /** 자연 5만 년치의 변화를 인류의 속도로 만드는 데 걸리는 시간 (년) */
  const humanYears = carbonRate > 0 ? naturalSpan / carbonRate : Infinity
  const speedRatio = humanYears > 0 ? NATURAL_HORIZON_YEARS / humanYears : Infinity
  /** 인류가 274년에 올린 폭이 자연 5만 년치의 몇 배인가 */
  const sizeRatio = naturalSpan > 0 ? nowWarming / naturalSpan : Infinity

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
    <div
      className={
        embedded
          ? 'panel flex w-full flex-col gap-3 p-5'
          : 'mx-auto flex w-full max-w-6xl flex-col gap-3'
      }
    >
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10.5px] font-medium tracking-[0.14em] text-act-3">
            {embedded ? '② 탄소 · 사람의 시계' : '여정의 끝 · 전체'}
          </div>
          <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
            {t > 0.6
              ? `사람의 ${carbonYears}년이 자연의 5만 년을 앞질렀습니다`
              : '자연의 시계와 사람의 시계를 나란히 놓아봅시다'}
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

        {/* 범례 — 두 줄을 같은 문형으로 맞춰, 무엇과 무엇을 견주는지가 형태로 보이게 한다 */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] text-ink-3">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--color-act-3)' }} />
            <span className="text-ink-2">자연</span> — 지구의 궤도가 앞으로 <span className="tnum">5만 년</span> 동안 바꾸는
            기온 (교육용 단순화 모델)
            <span className="mx-2">|</span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--color-bad)' }} />
            <span className="text-ink-2">사람</span> — 늘어난 이산화탄소가 지난 <span className="tnum">{carbonYears}년</span>{' '}
            동안 바꾼 기온
          </span>
          <span className="tnum">
            {Math.round(ppmNow)} ppm · {CARBON_START_YEAR + Math.round(t * carbonYears)}년
          </span>
        </div>

        {/*
          로그 축과 ppm 은 이 화면을 읽는 데 반드시 필요한 두 개념인데, 둘 다 설명 없이
          쓰이고 있었다. 고등학생이 처음 보고 바로 읽히는 것이 이 콘텐츠의 목표다.
        */}
        <p className="mt-2 border-t border-white/8 pt-2 text-[10.5px] leading-relaxed text-ink-3">
          <span className="text-ink-2">가로축 읽는 법</span> · 한 칸 옮길 때마다 시간이 10배씩 늘어납니다 — 1년, 10년,
          100년, 1천 년… 이렇게요. 5만 년을 그냥 늘어놓으면 274년은 왼쪽 끝에 붙은 선 한 줄이 되어 보이지 않기 때문에,
          두 시간대를 한 화면에서 같이 보려고 이렇게 그립니다. <span className="text-ink-2">ppm</span> 은 공기 알갱이
          100만 개 중 이산화탄소가 몇 개인지를 뜻해요 — {PREINDUSTRIAL_CO2}개에서 {PRESENT_CO2}개로 늘었습니다.
        </p>
      </div>

      <div className="flex items-start justify-between gap-6">
        <div className="flex max-w-3xl flex-col gap-2 text-[13.5px] leading-relaxed text-ink-2">
          {t > 0.6 ? (
            naturalSpan < 0.05 ? (
              <>
                <p>
                  지금 맞춰둔 궤도에서는 <span className="text-ink-1">자연이 5만 년 내내 기온을 거의 그대로 둡니다.</span>{' '}
                  그 사이 사람은 {carbonYears}년 만에{' '}
                  <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                    +{nowWarming.toFixed(2)}℃
                  </span>{' '}
                  를 올렸어요. 견줄 기울기가 자연 쪽에 아예 없는 셈입니다.
                </p>
                <p className="text-ink-3">
                  앞 단계로 돌아가 궤도 다이얼을 돌리면 보라색 곡선이 움직입니다. 자연도 기온을 바꾸기는 하는데, 얼마나
                  느리게 바꾸는지를 그때 나란히 놓고 보세요.
                </p>
              </>
            ) : (
              <>
                {/* 핵심 한 문장 — 같은 크기끼리 견주고, 배율은 시간의 비로만 말한다 */}
                <p>
                  자연이 <span className="tnum text-ink-1">5만 년</span> 을 들여 만드는 기온 변화는{' '}
                  <span className="tnum text-ink-1">{naturalSpan.toFixed(1)}℃</span> 입니다. 사람은{' '}
                  <span className="text-ink-1">똑같은 크기의 변화</span> 를{' '}
                  <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                    {fmtYears(humanYears)}
                  </span>{' '}
                  만에 만들었어요 — <span className="text-ink-1">약 {fmtCount(speedRatio)}배 빠른 속도</span>입니다.
                </p>
                <p>
                  {carbonYears}년 전체로 보면 사람이 올린 기온은{' '}
                  <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                    +{nowWarming.toFixed(2)}℃
                  </span>
                  , 자연이 5만 년에 걸쳐 만드는 폭의 약 {fmtCount(sizeRatio)}배예요.
                  {endDelta < 0 &&
                    ' 게다가 자연은 지구를 식히는 쪽으로 가는 중인데, 사람은 그 반대 방향으로 데우고 있습니다.'}
                </p>
              </>
            )
          ) : null}

          {/*
            속도 결론은 **분기 밖**에 둔다.
            한때 "자연 곡선이 평평하지 않은" 분기 안에만 있었는데, 궤도 다이얼을 한 번도
            안 건드린 사용자는 평평한 쪽으로 빠져 이 결론을 아예 못 봤다. 이 화면이
            하려는 말이 바로 이거라서, 어느 분기로 오든 보여야 한다.
          */}
          {/* 이 화면의 결론이다. 예전에는 회색 보조문(text-ink-3)이라 위의 숫자 문단에
              묻혔는데, "그래서 무엇이 문제냐"에 답하는 건 이 문단이다. 판을 씌워 끌어낸다. */}
          {t > 0.6 && (
              <div
                className="mt-1 rounded-xl border px-4 py-3"
                style={{
                  borderColor: 'color-mix(in oklab, var(--color-bad) 40%, transparent)',
                  background: 'color-mix(in oklab, var(--color-bad) 9%, transparent)',
                }}
              >
                <p className="text-[14px] leading-snug font-semibold text-ink-1">
                  문제는 <span style={{ color: 'var(--color-bad)' }}>크기가 아니라 속도</span>입니다.
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                  기온이 오르내리는 것 자체는 지구가 늘 해온 일이에요. 지구는 이보다 더 더웠던 적도, 더 추웠던
                  적도 있습니다. 다만 그때는 <span className="text-ink-1">만 년에 걸쳐</span> 바뀌었어요.
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                  숲은 한 세대에 수십 미터씩 서식지를 옮기고, 농사는 새 품종을 찾는 데 수십 년이 걸리고, 도시가
                  제방과 배수를 다시 놓는 데도 수십 년이 듭니다. 만 년이 주어지면 다들 따라갈 수 있는 속도예요.{' '}
                  <span className="text-ink-1">
                    {Number.isFinite(speedRatio)
                      ? `그 시간이 ${fmtCount(speedRatio)}분의 1로 줄었다는 것`
                      : '그 시간이 수백 년으로 줄었다는 것'}
                  </span>{' '}
                  — 그게 지금 일어나는 일입니다.
                </p>
              </div>
          )}

          {t <= 0.6 && (
            <p>
              방금 만드신 보라색 곡선이 <span className="text-ink-1">자연의 시계</span>입니다. 지구의 궤도가 앞으로 5만 년
              동안 기온을 어디까지 데려가는지 보여줘요. 3단계를 열 때 봤던 그 곡선 —{' '}
              <span className="text-ink-1">궤도만 보면 지금은 식을 창</span>이라던 그 이야기의 뒷면입니다. 이제 오른쪽
              위 토글로 <span className="text-ink-1">탄소 레이어</span>를 켜서, 사람이 만든 변화를 같은 축에 겹쳐 보세요.
            </p>
          )}
        </div>
        {/* 레일 안에서는 진행을 레일의 '다음'이 맡는다 — 버튼이 둘이면 어느 쪽이
            앞으로 가는 것인지 알 수 없다. 레이어 켜기만 남긴다. */}
        {t > 0.6 ? (
          embedded ? null : (
            <button type="button" className="btn btn-primary shrink-0 rise" onClick={onNext}>
              처음의 질문으로
            </button>
          )
        ) : (
          <button type="button" className="btn btn-ghost shrink-0" onClick={() => setCarbonOn(true)}>
            켜기
          </button>
        )}
      </div>
    </div>
  )
}
