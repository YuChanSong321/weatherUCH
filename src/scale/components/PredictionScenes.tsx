/**
 * 기상 예측 / 기후 전망 — 두 장면과 그 껍데기.
 *
 * 원래는 여정 맨 끝(S7Ending)에 있었다. 그런데 이 둘은 **2단계까지의 결론**이지
 * 여정 전체의 결론이 아니다. 기상과 기후를 막 겪고 나온 직후에 보여야
 * "아, 그래서 그랬구나"가 되고, 맨 끝에서 꺼내면 이미 지나간 이야기가 된다.
 * 그래서 2단계가 닫히는 자리(S5Future 의 출구)로 옮기고 여기 공용으로 뒀다.
 *
 * 껍데기(Scene · Item)는 엔딩의 장면들도 함께 쓴다 — 같은 자리에 같은 모양으로
 * 서야 네 장면이 한 줄기로 읽힌다.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChartFrame } from './ChartFrame'
import { WeatherVsClimate } from './WeatherVsClimate'
import { scenarios } from '../data/loader'
import { linearScale, smoothPath } from '../lib/scales'
import { trendOf, useClimate } from '../state/climate'
import { S1_MAX, S4_MAX, useJourney } from '../state/journey'

/* ─────────────────────────────  통계 도구  ───────────────────────────── */

/** 오차함수 근사 (Abramowitz–Stegun 7.1.26). 정규분포 누적확률에만 쓴다. */
function erf(x: number): number {
  const s = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a)
  return s * y
}
const normCdf = (x: number, mu: number, sigma: number) => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)))
export const normPdf = (x: number, mu: number, sigma: number) =>
  Math.exp(-(((x - mu) / sigma) ** 2) / 2) / (sigma * Math.sqrt(2 * Math.PI))

/** 표준정규분포의 삼분위 경계 z값 — 상·하위 1/3 을 가르는 지점 */
const TERCILE_Z = 0.4307273
/** 미래의 변동폭은 지금보다 조금 넓다 — 모델 간 이견과 경로 안의 폭이 더해진다 */
export const SIGMA_WIDEN = 1.15

/* ───────────────────────  기상: 앙상블 발산  ─────────────────────── */

/** 예보 앙상블 멤버 수 — 실제 수치예보센터도 수십 개를 돌린다 */
const MEMBERS = 15
/** 초기 관측 오차 (℃). 관측망이 아무리 촘촘해도 0 이 되지 않는다. */
const INIT_ERROR = 0.06
/** 그 오차가 두 배로 자라는 데 걸리는 날 수 — 대기의 성질(리아푸노프 시간) */
const DOUBLING_DAYS = 2.2
/** 일평균기온이 평년 주변에서 자연히 오가는 폭(±℃). 퍼짐이 여기 닿으면 예보의 정보량은 0 이다. */
const CLIMATE_BAND = 4.2
const HORIZON_DAYS = 15

/** 리드타임 d일에서 앙상블이 벌어진 폭 — 지수 성장하다 기후 변동폭에서 포화한다 */
const spreadAt = (d: number) => CLIMATE_BAND * Math.tanh((INIT_ERROR * 2 ** (d / DOUBLING_DAYS)) / CLIMATE_BAND)

/**
 * 앙상블 멤버 궤적.
 *
 * 난수를 쓰지 않는다 — 새로고침마다 그림이 달라지면 발표에서 같은 화면을 두 번
 * 보여줄 수 없고, "이건 데이터가 아니라 연출"이라는 인상만 남는다. 결정론적인
 * 사인 합으로 흔들되, 폭은 위 `spreadAt` 이 정한다.
 */
function ensembleMembers(): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = []
  for (let i = 0; i < MEMBERS; i++) {
    const base = (i / (MEMBERS - 1)) * 2 - 1 // −1 … +1
    const track: Array<[number, number]> = []
    for (let d = 0; d <= HORIZON_DAYS; d += 0.5) {
      const wobble = 0.3 * Math.sin(d * 0.8 + i * 2.4) + 0.18 * Math.sin(d * 1.9 + i * 1.1)
      track.push([d, spreadAt(d) * (base + wobble * 0.55)])
    }
    out.push(track)
  }
  return out
}

export function Scene({
  tone,
  kicker,
  title,
  figure,
  children,
  footnote,
}: {
  tone: string
  kicker: string
  title: ReactNode
  figure: ReactNode
  children: ReactNode
  footnote?: ReactNode
}) {
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em]" style={{ color: tone }}>
          {kicker}
        </div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">{figure}</div>
        <div className="flex flex-col gap-3.5">{children}</div>
      </div>

      {footnote && <div className="border-t border-white/8 pt-2.5">{footnote}</div>}
    </section>
  )
}

/** 오른쪽 설명 한 항목 — 번호가 읽는 순서를 못 박는다 */
export function Item({
  n,
  tone,
  title,
  children,
}: {
  n: number
  tone: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className="tnum mt-[2px] flex h-[1.15rem] w-[1.15rem] shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold"
        style={{ background: `color-mix(in oklab, ${tone} 24%, transparent)`, color: tone }}
      >
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-ink-1">{title}</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2">{children}</p>
      </div>
    </div>
  )
}

/* ─────────────────────────  ① 기상 — 값을 맞히는 일  ───────────────────────── */

const WX_W = 620
const WX_H = 300
const WX_M = { top: 20, right: 18, bottom: 34, left: 42 }
const TONE_WX = 'var(--color-act-1)'

export function SceneWeather({ meanDailyError, earned }: { meanDailyError: number | null; earned: number }) {
  const members = useMemo(ensembleMembers, [])

  const x = linearScale([0, HORIZON_DAYS], [WX_M.left, WX_W - WX_M.right])
  const y = linearScale([-5.5, 5.5], [WX_H - WX_M.bottom, WX_M.top])

  const paths = members.map((m) => smoothPath(m.map(([d, v]) => [x(d), y(v)] as [number, number])))
  /** 실제로 일어난 날씨 — 멤버 하나일 뿐, 나머지도 똑같이 그럴듯했다 */
  const truth = paths[Math.floor(MEMBERS * 0.62)]

  return (
    <Scene
      tone={TONE_WX}
      kicker="① 기상 예측 · 결정론"
      title={
        <>
          기상 예측은 <span style={{ color: TONE_WX }}>‘값’</span>을 맞히는 일입니다
        </>
      }
      figure={
        <ChartFrame
          width={WX_W}
          height={WX_H}
          margins={WX_M}
          x={x}
          y={y}
          xTicks={[0, 3, 7, 10, 14]}
          yTicks={[-4, -2, 0, 2, 4]}
          xTickFormat={(v) => (v === 0 ? '오늘' : `${v}일`)}
          yTickFormat={(v) => `${v > 0 ? '+' : ''}${v}`}
          yUnit="℃"
        >
          {/* 기후 변동폭 — 예보가 이 폭을 다 채우면 "평년입니다"와 같은 말이 된다 */}
          <rect
            x={WX_M.left}
            y={y(CLIMATE_BAND)}
            width={WX_W - WX_M.right - WX_M.left}
            height={y(-CLIMATE_BAND) - y(CLIMATE_BAND)}
            fill="var(--color-ink-3)"
            opacity={0.07}
          />
          <text x={WX_W - WX_M.right - 4} y={y(CLIMATE_BAND) + 12} textAnchor="end" fontSize={10} fill="var(--color-ink-3)">
            평년의 자연 변동폭
          </text>

          {/* 앙상블 — 거의 같은 오늘에서 출발한 15개의 미래 */}
          {paths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={TONE_WX} strokeWidth={1} opacity={0.34} />
          ))}
          <path d={truth} fill="none" stroke="var(--color-ink-1)" strokeWidth={2} strokeLinecap="round" />

          <line
            x1={x(14)}
            x2={x(14)}
            y1={WX_M.top}
            y2={WX_H - WX_M.bottom}
            stroke="var(--color-bad)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
          />
          <text x={x(14) - 6} y={WX_M.top + 11} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--color-bad)">
            예측 가능성의 벽
          </text>

          {/* 출발점 — 여기서는 15개가 한 점이다 */}
          <circle cx={x(0)} cy={y(0)} r={3.5} fill="var(--color-ink-1)" />
          <text x={x(0) + 8} y={y(0) - 9} fontSize={10} fill="var(--color-ink-3)">
            오차 {INIT_ERROR}℃
          </text>

          {meanDailyError !== null && (
            <g>
              <circle cx={x(1)} cy={y(spreadAt(1))} r={4.5} fill={TONE_WX} stroke="var(--color-space-1)" strokeWidth={1.5} />
              <text x={x(1) + 8} y={y(spreadAt(1)) - 8} fontSize={10.5} fontWeight={600} fill={TONE_WX} className="tnum">
                당신이 선 자리 · 하루 뒤
              </text>
            </g>
          )}
        </ChartFrame>
      }
      footnote={
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          굵은 흰 선이 <span className="text-ink-2">실제로 일어난 날씨</span>입니다. 나머지 14개도 똑같이 그럴듯했어요 —
          무엇이 실현될지 고를 방법이 없다는 것, 그게 <span className="text-ink-2">카오스(초기 조건 민감성)</span>이고
          기상 예측이 어려운 진짜 이유입니다. 예보관의 실력 문제도, 컴퓨터 성능 문제도 아닙니다.
        </p>
      }
    >
      <Item n={1} tone={TONE_WX} title="묻는 것">
        “모레 최고기온은 몇 ℃인가.” 답은 <span className="text-ink-1">하나의 값</span>이고, 하루 뒤면 맞았는지 틀렸는지
        바로 채점됩니다.
      </Item>
      <Item n={2} tone={TONE_WX} title="왜 어려운가">
        선 15개는 서로 <span className="tnum text-ink-1">{INIT_ERROR}℃</span> 차이의 “거의 똑같은 오늘”에서 출발했습니다.
        관측망을 아무리 촘촘히 깔아도 이 정도는 남아요. 대기는 그 차이를 약{' '}
        <span className="tnum text-ink-1">{DOUBLING_DAYS}일마다 두 배</span>로 키웁니다.
      </Item>
      <Item n={3} tone={TONE_WX} title="그래서 2주가 벽입니다">
        사흘 뒤는 아직 비슷한데, 2주 뒤에는 선들이 평년 변동폭 전체에 흩어집니다. 그 지점에서 예보는{' '}
        <span className="text-ink-1">“평년입니다”와 같은 말</span>이 되고, 정보량이 0이 돼요.
      </Item>

      {meanDailyError !== null && (
        <div className="mt-auto rounded-xl border px-3 py-2.5" style={{ borderColor: `color-mix(in oklab, ${TONE_WX} 40%, transparent)` }}>
          <div className="text-[10.5px] text-ink-3">1단계에서 당신이 선 자리</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="tnum text-[20px] leading-none font-semibold" style={{ color: TONE_WX }}>
              {meanDailyError.toFixed(1)}℃
            </span>
            <span className="tnum text-[11.5px] text-ink-2">평균 오차 · {earned}/{S1_MAX}점</span>
          </div>
        </div>
      )}
    </Scene>
  )
}

/* ─────────────────────────  ② 기후 — 분포를 맞히는 일  ───────────────────────── */

const CL_W = 620
const CL_H = 268
const CL_M = { top: 20, right: 18, bottom: 34, left: 24 }
const TONE_CL = 'var(--color-act-2)'

export function SceneClimate({
  sigma,
  future,
  label,
  yearGuess,
}: {
  sigma: number
  future: { label: string; color: string; shift: number }
  label: string
  yearGuess: { year: number; errorVsActual: number; earned: number } | null
}) {
  const sigmaF = sigma * SIGMA_WIDEN
  const xDomain: [number, number] = [-3 * sigma, future.shift + 3.2 * sigmaF]
  const x = linearScale(xDomain, [CL_M.left, CL_W - CL_M.right])
  const peak = normPdf(0, 0, sigma)
  const y = linearScale([0, peak * 1.18], [CL_H - CL_M.bottom, CL_M.top])

  const curve = (mu: number, sd: number) => {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 90; i++) {
      const v = xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / 90
      pts.push([x(v), y(normPdf(v, mu, sd))])
    }
    return pts
  }
  const area = (pts: Array<[number, number]>) =>
    `${smoothPath(pts)} L${pts[pts.length - 1][0]} ${y(0)} L${pts[0][0]} ${y(0)} Z`

  const nowPts = curve(0, sigma)
  const futPts = curve(future.shift, sigmaF)

  // 지금 분포를 셋으로 가른 경계 — 기후 전망은 이 세 칸의 확률로 발표된다
  const loEdge = -TERCILE_Z * sigma
  const hiEdge = TERCILE_Z * sigma
  const pHigh = 1 - normCdf(hiEdge, future.shift, sigmaF)
  const pMid = normCdf(hiEdge, future.shift, sigmaF) - normCdf(loEdge, future.shift, sigmaF)
  const pLow = normCdf(loEdge, future.shift, sigmaF)

  return (
    <Scene
      tone={TONE_CL}
      kicker="② 기후 전망 · 확률"
      title={
        <>
          기후 전망은 <span style={{ color: TONE_CL }}>‘분포’</span>를 맞히는 일입니다
        </>
      }
      figure={
        <div className="flex flex-col gap-2">
          <ChartFrame
            width={CL_W}
            height={CL_H}
            margins={CL_M}
            x={x}
            y={y}
            xTicks={[0, 1, 2, 3, 4, 5].filter((v) => v >= xDomain[0] && v <= xDomain[1])}
            yTicks={[]}
            xTickFormat={(v) => (v === 0 ? '지금 평년' : `+${v}℃`)}
          >
            <rect
              x={x(loEdge)}
              y={CL_M.top}
              width={x(hiEdge) - x(loEdge)}
              height={CL_H - CL_M.bottom - CL_M.top}
              fill="var(--color-ink-3)"
              opacity={0.08}
            />
            <text x={(x(loEdge) + x(hiEdge)) / 2} y={CL_M.top + 10} textAnchor="middle" fontSize={9.5} fill="var(--color-ink-3)">
              평년과 비슷
            </text>

            <path d={area(nowPts)} fill="var(--color-series-obs)" opacity={0.12} />
            <path d={smoothPath(nowPts)} fill="none" stroke="var(--color-series-obs)" strokeWidth={1.6} />
            <text x={x(0)} y={y(peak) - 7} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-2)">
              지금 (2020년대)
            </text>

            <path d={area(futPts)} fill={future.color} opacity={0.2} />
            <path d={smoothPath(futPts)} fill="none" stroke={future.color} strokeWidth={2.2} />
            <text
              x={Math.min(CL_W - CL_M.right - 40, x(future.shift))}
              y={y(normPdf(future.shift, future.shift, sigmaF)) - 7}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={600}
              fill={future.color}
            >
              2100년 · {future.label}
            </text>

            {/* 분포가 통째로 옮겨간다는 것이 이 그림의 전부다 */}
            <g opacity={0.8}>
              <line
                x1={x(0)}
                x2={x(future.shift) - 6}
                y1={y(peak * 0.3)}
                y2={y(peak * 0.3)}
                stroke={future.color}
                strokeWidth={1.4}
                strokeDasharray="3 3"
              />
              <path d={`M${x(future.shift)} ${y(peak * 0.3)} l-7 -3.5 l0 7 Z`} fill={future.color} />
              <text
                x={(x(0) + x(future.shift)) / 2}
                y={y(peak * 0.3) - 6}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={600}
                fill={future.color}
                className="tnum"
              >
                +{future.shift.toFixed(1)}℃
              </text>
            </g>
          </ChartFrame>

          {/*
            기후 전망이 실제로 발표되는 형식 — 세 칸의 확률.
            지금 것을 함께 놓는 이유: 미래 막대만 두면 "높음 100%" 가 어디서 왔는지
            알 수 없다. 지금이 33/33/33 이라는 정의를 옆에 놓아야 형식이 읽힌다.
          */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-[3.6rem] shrink-0 text-[10.5px] text-ink-3">지금</span>
              <div className="flex h-6 flex-1 overflow-hidden rounded-md">
                <Tercile pct={1 / 3} label="낮음" color="var(--color-act-1)" />
                <Tercile pct={1 / 3} label="비슷" color="var(--color-ink-3)" />
                <Tercile pct={1 / 3} label="높음" color="var(--color-warn)" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[3.6rem] shrink-0 text-[10.5px] text-ink-2">2100년</span>
              <div className="flex h-6 flex-1 overflow-hidden rounded-md">
                <Tercile pct={pLow} label="낮음" color="var(--color-act-1)" />
                <Tercile pct={pMid} label="비슷" color="var(--color-ink-3)" />
                <Tercile pct={pHigh} label="높음" color={future.color} />
              </div>
            </div>
          </div>
        </div>
      }
      footnote={
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          종 모양의 너비 <span className="tnum text-ink-2">±{sigma.toFixed(2)}℃</span> 는 {label} 40년 관측에서 추세를 뺀
          실제 변동폭입니다 — 기후가 그대로여도 해마다 이만큼은 튄다는 뜻이에요.
          {yearGuess && (
            <>
              {' '}
              2단계에서 {yearGuess.year}년을 <span className="tnum text-ink-2">{yearGuess.errorVsActual.toFixed(2)}℃</span>{' '}
              오차로 맞히셨죠 — 그 오차가 바로 이 좁은 폭 안에서 일어난 일입니다.
            </>
          )}
        </p>
      }
    >
      <Item n={1} tone={TONE_CL} title="묻는 것">
        “2100년의 한 해가 평년보다 높을까, 낮을까.” 답은 값이 아니라{' '}
        <span className="text-ink-1">확률</span>입니다 — 기상청 3개월 전망도 이 형식이에요.
      </Item>
      <Item n={2} tone={TONE_CL} title="개별 값은 여전히 못 맞힙니다">
        ‘2100년 8월 3일이 몇 도’는 아무도 모릅니다. 계산할 수 있는 건 종 모양이 통째로 어디로 옮겨가는가뿐이에요 —
        지금 <span className="tnum">33%</span>인 ‘평년보다 높음’이{' '}
        <span className="tnum font-semibold text-ink-1">{(pHigh * 100).toFixed(0)}%</span>가 됩니다.
      </Item>
      <Item n={3} tone={TONE_CL} title="갈라지는 건 ‘얼마나’입니다">
        어느 경로를 골라도 저 막대는 거의 100%예요. <span className="text-ink-1">더워지느냐는 이미 정해졌고</span>, 남은
        질문은 얼마나입니다 — 미래의 <span className="text-ink-1">평범한 해</span>가 지금의 가장 더웠던 해보다 덥습니다.
      </Item>

      {yearGuess && (
        <div className="mt-auto rounded-xl border px-3 py-2.5" style={{ borderColor: `color-mix(in oklab, ${TONE_CL} 40%, transparent)` }}>
          <div className="text-[10.5px] text-ink-3">2단계에서 당신이 선 자리</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="tnum text-[20px] leading-none font-semibold" style={{ color: TONE_CL }}>
              {yearGuess.errorVsActual.toFixed(2)}℃
            </span>
            <span className="tnum text-[11.5px] text-ink-2">
              {yearGuess.year}년 오차 · {yearGuess.earned}/{S4_MAX}점
            </span>
          </div>
        </div>
      )}
    </Scene>
  )
}

function Tercile({ pct, label, color }: { pct: number; label: string; color: string }) {
  const w = Math.max(0, pct * 100)
  return (
    <div
      className="flex items-center justify-center overflow-hidden whitespace-nowrap transition-[flex-basis] duration-500"
      style={{ flexBasis: `${w}%`, background: `color-mix(in oklab, ${color} 55%, transparent)` }}
    >
      {w > 13 && (
        <span className="tnum text-[10.5px] font-semibold text-ink-1">
          {label} {w.toFixed(0)}%
        </span>
      )}
    </div>
  )
}


/* ───────────────────  2단계를 닫는 세 화면  ─────────────────── */

/**
 * 기상 → 기후 → 정리.
 *
 * 2단계가 끝나는 자리에서 한 묶음으로 지난다. 여정 맨 끝에 두었을 때는 세 화면이
 * "이미 아는 이야기"로 읽혔다 — 기상과 기후를 **막 겪고 나온 직후**여야 각 장면이
 * 방금 자기가 한 일의 해설이 된다.
 *
 * 필요한 값(예보 오차·연평균 변동폭·시나리오)은 이 컴포넌트가 직접 읽는다. 부르는
 * 쪽(S5Future)이 계산해 넘기게 하면 같은 계산이 두 곳에 생긴다.
 */
export function ActTwoSummary({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { rounds, yearGuess } = useJourney()
  const climate = useClimate()
  const [step, setStep] = useState(0)

  const s1Earned = rounds.reduce((s, r) => s + r.earned, 0)
  const meanDailyError =
    rounds.length > 0 ? rounds.reduce((s, r) => s + r.tmaxError, 0) / rounds.length : null

  /**
   * 연평균기온의 자연 변동 폭 σ — 고른 지역의 실제 시계열에서 뽑는다.
   * 추세를 뺀 나머지의 표준편차이고, 그것이 곧 기후 장면 종 모양의 너비가 된다.
   */
  const sigma = useMemo(() => {
    const s = climate.yearly
    if (s.length < 10) return 0.55
    const t = trendOf(s)
    const resid = s.map((r) => r.tavg - (t.slope * r.year + t.intercept))
    return Math.max(0.25, Math.sqrt(resid.reduce((a, v) => a + v * v, 0) / (resid.length - 1)))
  }, [climate.yearly])

  /** 가운데 경로(SSP2-4.5)를 기준으로 둔다 — 지금 궤도의 연장선에 가장 가깝다 */
  const future = useMemo(() => {
    const s = scenarios[Math.min(1, scenarios.length - 1)]
    const first = s.points[0]
    const last = s.points[s.points.length - 1]
    return { label: s.label, color: s.color, shift: last.anomaly - first.anomaly }
  }, [])

  const TABS = ['기상', '기후', '정리']
  const NEXT = ['그럼 30년 뒤는 어떨까요', '두 예측은 어떻게 다를까요', '그런데 이 기후를 움직이는 건 무엇일까요']

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3.5">
      {/* 세 화면이 한 묶음이라는 것이 보여야 한다 — 몇 번째인지, 몇 개인지 */}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-medium tracking-[0.14em] text-ink-3">2단계 정리</span>
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setStep(i)}
            aria-current={i === step}
            className="rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
            style={{
              borderColor: i === step ? 'rgb(255 255 255 / 0.3)' : 'rgb(255 255 255 / 0.1)',
              color: i === step ? 'var(--color-ink-1)' : 'var(--color-ink-3)',
              background: i === step ? 'rgb(255 255 255 / 0.06)' : 'transparent',
            }}
          >
            {i + 1} {t}
          </button>
        ))}
      </div>

      {step === 0 && <SceneWeather meanDailyError={meanDailyError} earned={s1Earned} />}
      {step === 1 && (
        <SceneClimate sigma={sigma} future={future} label={climate.label} yearGuess={yearGuess} />
      )}
      {step === 2 && <WeatherVsClimate />}

      <div className="flex items-center justify-between gap-6">
        <button
          type="button"
          className="text-[12px] text-ink-3 transition-colors hover:text-ink-1"
          onClick={() => (step === 0 ? onBack() : setStep((n) => n - 1))}
        >
          ← {step === 0 ? '그래프로 돌아가기' : '이전'}
        </button>
        <button
          type="button"
          className="btn btn-primary px-6"
          onClick={() => (step === TABS.length - 1 ? onDone() : setStep((n) => n + 1))}
        >
          {NEXT[step]}
        </button>
      </div>
    </div>
  )
}
