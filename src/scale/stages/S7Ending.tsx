/**
 * S7 · 엔딩 — S0의 질문을 회수한다.
 *
 * ⚠️ 두 번의 개편을 거쳤다. 둘 다 심사·동료 피드백이 원인이고, 순서대로 읽어야
 * 지금 구조가 왜 이렇게 생겼는지 이해된다.
 *
 * (1) U자 곡선 하나 → 그래프 둘.
 *   원래는 하루부터 수만 년까지를 가로축 하나에 놓고 세로축을 '예측 가능성'이라는
 *   한 가지 양으로 그린 U자였다. 지적:
 *     "기상 예측은 정확한 값이므로, 기후 예측은 경향이나 앙상블로 확률적인 정보로써
 *      평년보다 높고 낮은 정도의 예측만 가능하다. 같은 곡선으로 표현하기엔 개념의
 *      차이가 존재한다."
 *   맞는 말이다. 두 예측은 **정확도가 다른 같은 일**이 아니라 **애초에 다른 일**이다.
 *     기상 — 초기 조건 문제. 하나의 값을 답으로 낸다. 하루 뒤면 채점된다.
 *     기후 — 경계 조건 문제. 확률 분포를 답으로 낸다. 개별 해는 영원히 못 맞힌다.
 *   세로축의 의미가 다른 두 양을 한 곡선으로 이으면 그 이음매가 곧 거짓말이 된다.
 *   그래서 쪼갰고, **이어지지 않는다는 사실 자체**를 이 화면의 결론으로 삼았다.
 *
 * (2) 한 화면에 다 쌓기 → 네 장면으로 진행.
 *   쪼갠 결과 그래프 2 + 대조표 + 요약카드 3 + 액션 + 점수, 블록 여섯이 같은 무게로
 *   쌓였다. 지적: "그래프가 메인처럼 보이고 그 위아래로 글이 붙어 루즈하다, 시선이
 *   분산돼 난잡하다, 일방향으로 흐르게 해달라."
 *   그래서 **한 장면에 초점 하나**로 다시 짰다.
 *     ① 기상 — 값을 맞히는 일      ② 기후 — 분포를 맞히는 일
 *     ③ 두 예측의 차이 (대조표)     ④ 선택 — 사람이 잡은 다이얼
 *   장면 안에서도 방향은 하나다: 왼쪽 그림 → 오른쪽 번호 붙은 설명 → 아래 다음 버튼.
 *   중복이던 요약 카드 3장과 점수 스트립은 없앴다 — 각 장면이 자기 몫의 점수를
 *   그 자리에서 회수하는 편이 짧고, 같은 말을 두 번 하지 않는다.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChartFrame } from '../components/ChartFrame'
import { scenarios } from '../data/loader'
import { linearScale, smoothPath } from '../lib/scales'
import { S1_MAX, S4_MAX, ORBIT_MISSION_MAX, useJourney } from '../state/journey'
import { trendOf, useClimate } from '../state/climate'

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
const normPdf = (x: number, mu: number, sigma: number) =>
  Math.exp(-(((x - mu) / sigma) ** 2) / 2) / (sigma * Math.sqrt(2 * Math.PI))

/** 표준정규분포의 삼분위 경계 z값 — 상·하위 1/3 을 가르는 지점 */
const TERCILE_Z = 0.4307273
/** 미래의 변동폭은 지금보다 조금 넓다 — 모델 간 이견과 경로 안의 폭이 더해진다 */
const SIGMA_WIDEN = 1.15

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

/* ─────────────────────────────  장면 진행  ───────────────────────────── */

type SceneDef = { key: string; tab: string; tone: string }

const SCENES: SceneDef[] = [
  { key: 'weather', tab: '기상', tone: 'var(--color-act-1)' },
  { key: 'climate', tab: '기후', tone: 'var(--color-act-2)' },
  { key: 'journey', tab: '여정', tone: 'var(--color-ink-2)' },
  { key: 'choice', tab: '선택', tone: 'var(--color-act-3)' },
]

export function S7Ending() {
  const { rounds, yearGuess, orbitResult, dragged2100, totals, restart } = useJourney()
  const climate = useClimate()
  const [scene, setScene] = useState(0)

  const s1Earned = rounds.reduce((s, r) => s + r.earned, 0)
  const meanDailyError = rounds.length > 0 ? rounds.reduce((s, r) => s + r.tmaxError, 0) / rounds.length : null

  /**
   * 연평균기온의 자연 변동 폭 σ — 사용자가 고른 지역의 실제 시계열에서 뽑는다.
   *
   * 추세를 뺀 나머지의 표준편차다. 이 값이 곧 "기후가 그대로여도 해마다 이만큼은
   * 튄다"는 폭이고, 기후 장면의 종 모양 너비가 된다. 상수로 박아두면 지역을
   * 바꿔도 같은 그림이 나와 거짓이 된다.
   */
  const sigma = useMemo(() => {
    const s = climate.yearly
    if (s.length < 10) return 0.55
    const t = trendOf(s)
    const resid = s.map((r) => r.tavg - (t.slope * r.year + t.intercept))
    return Math.max(0.25, Math.sqrt(resid.reduce((acc, v) => acc + v * v, 0) / (resid.length - 1)))
  }, [climate.yearly])

  /** SSP 세 경로가 2100년에 데려가는 곳 — 기준은 '지금(2025)' 이다 */
  const futures = useMemo(
    () =>
      scenarios.map((s) => {
        const first = s.points[0]
        const last = s.points[s.points.length - 1]
        return { id: s.id, label: s.label, color: s.color, shift: last.anomaly - first.anomaly }
      }),
    [],
  )
  // 기본 선택은 가운데 경로 — 지금 궤도의 연장선에 가장 가깝다
  const [pick, setPick] = useState(() => Math.min(1, futures.length - 1))

  const def = SCENES[scene]
  const last = scene === SCENES.length - 1

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3.5">
      <SceneRail scene={scene} onPick={setScene} totals={totals} />

      {/*
        mode="wait" — 앞 장면이 완전히 빠진 뒤 다음 장면이 들어온다.
        두 장면이 한 순간이라도 겹치면 "한 번에 하나만 본다"는 이 화면의 약속이 깨진다.
      */}
      <AnimatePresence mode="wait">
        <motion.div
          key={def.key}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        >
          {scene === 0 && <SceneWeather meanDailyError={meanDailyError} earned={s1Earned} />}
          {scene === 1 && (
            <SceneClimate
              sigma={sigma}
              future={futures[pick]}
              label={climate.label}
              yearGuess={yearGuess}
            />
          )}
          {scene === 2 && <SceneJourney totals={totals} />}
          {scene === 3 && (
            <SceneChoice
              sigma={sigma}
              futures={futures}
              pick={pick}
              onPick={setPick}
              dragged2100={dragged2100}
              orbitResult={orbitResult}
              totals={totals}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-6">
        <button
          type="button"
          className="text-[12px] text-ink-3 transition-colors hover:text-ink-1 disabled:opacity-0"
          onClick={() => setScene((n) => n - 1)}
          disabled={scene === 0}
        >
          ← 이전
        </button>
        {last ? (
          <button type="button" className="btn btn-primary px-6" onClick={restart}>
            다시 도전하기
          </button>
        ) : (
          <button type="button" className="btn btn-primary px-6" onClick={() => setScene((n) => n + 1)}>
            {NEXT_LABEL[scene]}
          </button>
        )}
      </div>
    </div>
  )
}

/** 다음 장면으로 넘기는 버튼의 문구 — 다음 장면이 답할 질문을 미리 던진다 */
const NEXT_LABEL = [
  '그럼 30년 뒤는 어떨까요',
  '여기까지 어디를 지나왔을까요',
  '그럼 미래는 누가 정하나요',
]

/* ─────────────────────────────  공통 껍데기  ───────────────────────────── */

function SceneRail({
  scene,
  onPick,
  totals,
}: {
  scene: number
  onPick: (i: number) => void
  totals: { earned: number; max: number }
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        <div className="text-[11px] font-medium tracking-[0.14em] text-ink-3">
          여정의 끝 · 처음의 질문 —{' '}
          <span className="text-ink-2">“당신은 며칠 앞을 맞힐 수 있을까요?”</span>
        </div>
        {/* 발표 중 되짚어야 할 때가 있으므로 눌러서 되돌아갈 수 있게 둔다 */}
        <div className="mt-1.5 flex items-center gap-1">
          {SCENES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && <span className="h-px w-4" style={{ background: 'rgb(255 255 255 / 0.16)' }} />}
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === scene}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  borderColor: i === scene ? s.tone : 'rgb(255 255 255 / 0.12)',
                  background: i === scene ? `color-mix(in oklab, ${s.tone} 18%, transparent)` : 'transparent',
                  color: i === scene ? 'var(--color-ink-1)' : i < scene ? 'var(--color-ink-2)' : 'var(--color-ink-3)',
                }}
              >
                <span className="tnum font-semibold" style={{ color: i <= scene ? s.tone : undefined }}>
                  {i + 1}
                </span>
                {s.tab}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tnum text-[26px] leading-none font-semibold">
          {totals.earned}
          <span className="text-[13px] text-ink-3"> / {totals.max}</span>
        </div>
        <div className="text-[10.5px] text-ink-3">총점</div>
      </div>
    </div>
  )
}

/** 장면 하나 — 제목 한 줄, 왼쪽 그림, 오른쪽 번호 붙은 설명. 방향은 항상 이 하나. */
function Scene({
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
function Item({
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

function SceneWeather({ meanDailyError, earned }: { meanDailyError: number | null; earned: number }) {
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

function SceneClimate({
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

/* ─────────────────────────  ③ 두 예측의 차이  ───────────────────────── */

/**
 * 경로별 대응방안.
 *
 * 심사에서 가장 잘 전달됐다고 꼽힌 지점("우리 행위에 따라 미래가 달라진다")을
 * 더 살려 달라는 요청을 받았다. 살리는 방법으로 훈계 문장을 늘리지 않는다 —
 * 마지막 장면에서 버튼을 누르면 옆의 종 모양이 그 자리에서 움직이게 했다.
 * 문장이 아니라 화면이 인과를 보여주는 쪽이다.
 */
const LEVERS: Record<string, { headline: string; body: string; acts: string[] }> = {
  ssp126: {
    headline: '이 길로 가려면, 2050년 무렵 배출 총량이 0 이어야 합니다',
    body: '이미 배출한 몫 때문에 당분간은 계속 더워집니다. 그래도 세기 후반에 곡선이 눕는 유일한 경로예요.',
    acts: [
      '발전을 재생에너지·원자력 등 무탄소 전원으로 교체',
      '건물 단열·수송 전동화로 에너지 수요 자체를 줄이기',
      '숲·갯벌 흡수원 복원과 탄소 포집·저장',
    ],
  },
  ssp245: {
    headline: '지금 발표된 각국 감축 목표를 그대로 지키면 대략 여기입니다',
    body: '선언은 있고 이행은 절반쯤인 세상. 지금 궤도의 연장선에 가장 가까운 경로입니다.',
    acts: [
      '감축 목표를 선언에서 이행으로 — 점검·공시 체계',
      '폭염·집중호우에 맞춘 도시 인프라 재설계',
      '농업 품종 전환과 물 관리 적응 계획',
    ],
  },
  ssp585: {
    headline: '화석연료로 성장을 계속 밀어붙이면 도달하는 곳입니다',
    body: '적응으로 감당할 수 있는 범위를 여러 지역에서 넘어섭니다. 되돌리는 다이얼은 없습니다.',
    acts: [
      '이 경로는 대응이 아니라 회피의 대상입니다',
      '적응만으로 감당할 수 없는 지역이 나옵니다',
      '넘고 나서 고치는 비용이 넘지 않는 비용보다 훨씬 큽니다',
    ],
  },
}

/* ─────────────────────────  ③ 여정 — 하루에서 수만 년까지  ───────────────────────── */

/**
 * 지나온 시간 규모를 한 화면에 되짚는다.
 *
 * 왜 필요한가. 이 콘텐츠는 규모를 계속 넓혀가는 여정인데, 정작 **넓혀왔다는 사실
 * 자체를 정리해주는 자리가 없었다.** 마지막에 와서도 사용자는 마지막 화면(궤도)만
 * 기억한 채로 끝난다. 여기서 다섯 칸을 한 줄에 세워 "내가 이만큼 물러났다"를
 * 눈으로 확인시키고, 그 다음 장면(④ 선택)으로 넘긴다.
 *
 * 마지막 줄은 이 여정 전체의 논지다 — 자연은 만 년이 걸리는 일을 하고, 우리는
 * 같은 크기를 수백 년에 하고 있다. 속도가 다르다는 것이 결론이다.
 */
const JOURNEY: Array<{ scale: string; what: string; kind: string; tone: string; body: string }> = [
  {
    scale: '하루~며칠',
    what: '내일의 기온·비',
    kind: '날씨',
    tone: 'var(--color-act-1)',
    body: '값 하나를 맞히는 일. 잘 맞지만 2주에서 벽을 만납니다.',
  },
  {
    scale: '한 해',
    what: '365일을 누른 평균 하나',
    kind: '날씨 → 기후',
    tone: 'var(--color-act-1)',
    body: '묻는 대상을 하루에서 1년으로 바꾼 자리. 여기서 기후가 시작됩니다.',
  },
  {
    scale: '수십 년',
    what: '40년 추세선',
    kind: '기후',
    tone: 'var(--color-act-2)',
    body: '개별 연도는 튀어도 방향은 남습니다. 값이 아니라 방향을 읽습니다.',
  },
  {
    scale: '100년',
    what: 'SSP 세 갈래',
    kind: '기후',
    tone: 'var(--color-act-2)',
    body: '하나의 예측이 아니라 부채꼴. 어느 갈래로 갈지는 배출 선택이 정합니다.',
  },
  {
    scale: '수만 년',
    what: '궤도·자전축',
    kind: '천체역학',
    tone: 'var(--color-act-3)',
    body: '가장 잘 예측되는 규모. 지구가 스스로 돌리는, 사람이 못 만지는 손잡이.',
  },
]

function SceneJourney({ totals }: { totals: { earned: number; max: number } }) {
  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em] text-ink-3">③ 여정 · 지나온 시간 규모</div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          하루에서 시작해 <span className="text-ink-1">수만 년까지</span> 물러났습니다
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          카메라를 한 칸씩 뒤로 빼면서, 같은 지구를 다섯 번 다른 자로 재봤어요. 규모가 바뀌면 답할 수 있는 질문도
          바뀝니다 — 그게 이 여정이 보여주려던 것입니다.
        </p>
      </div>

      {/* 다섯 칸을 한 줄로. 왼쪽이 가깝고 오른쪽이 멀다 — 자의 방향과 같다. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-5">
        {JOURNEY.map((j, i) => (
          <div key={j.scale} className="flex flex-col gap-1.5 bg-space-1 px-3 py-3">
            <div className="flex items-baseline gap-1.5">
              <span className="tnum text-[10px] font-semibold" style={{ color: j.tone }}>
                {i + 1}
              </span>
              <span className="text-[12.5px] font-semibold text-ink-1">{j.scale}</span>
            </div>
            <span
              className="self-start rounded-full px-1.5 py-px text-[9.5px] font-semibold"
              style={{ background: `color-mix(in oklab, ${j.tone} 20%, transparent)`, color: j.tone }}
            >
              {j.kind}
            </span>
            <div className="text-[11.5px] font-medium text-ink-2">{j.what}</div>
            <p className="text-[11px] leading-relaxed text-ink-3">{j.body}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div
          className="rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-act-3) 38%, transparent)',
            background: 'color-mix(in oklab, var(--color-act-3) 8%, transparent)',
          }}
        >
          <h3 className="text-[13px] font-semibold text-ink-1">
            자연은 느리고, 지금은 빠릅니다
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
            궤도가 빙하기를 켜고 끄는 데는 <span className="text-ink-1">수만 년</span>이 걸립니다. 방금 다이얼을
            돌려보셨죠. 그런데 산업화 이후 <span className="text-ink-1">약 270년</span> 만에 우리는 그와 비슷한 크기의
            변화를 만들었습니다. 크기가 아니라 <span className="text-act-3">속도</span>가 다른 겁니다.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
            그리고 이 다섯 칸 중 <span className="text-ink-1">사람이 손을 댈 수 있는 칸은 하나뿐</span>입니다 —
            100년 규모의 부채꼴. 다음 화면이 그 이야기예요.
          </p>
        </div>

        <div className="panel-quiet flex flex-col justify-center gap-1 px-4 py-3">
          <div className="text-[10.5px] text-ink-3">여기까지 얻은 점수</div>
          <div className="flex items-baseline gap-1">
            <span className="tnum text-[30px] leading-none font-semibold text-ink-1">{totals.earned}</span>
            <span className="text-[13px] text-ink-3">/ {totals.max}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            맞고 틀린 것보다, 어느 규모에서 맞았는지가 이 여정의 답입니다.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────  ④ 선택 — 사람이 잡은 다이얼  ───────────────────────── */

const MINI_W = 380
const MINI_H = 176
const MINI_M = { top: 16, right: 14, bottom: 28, left: 14 }
const TONE_CH = 'var(--color-act-3)'

function SceneChoice({
  sigma,
  futures,
  pick,
  onPick,
  dragged2100,
  orbitResult,
  totals,
}: {
  sigma: number
  futures: Array<{ id: string; label: string; color: string; shift: number }>
  pick: number
  onPick: (i: number) => void
  dragged2100: number | null
  orbitResult: { success: boolean; earned: number } | null
  totals: { earned: number; max: number }
}) {
  const future = futures[pick]
  const lever = LEVERS[future.id]

  return (
    <section className="panel flex flex-col gap-3 p-5" style={{ borderColor: `color-mix(in oklab, ${future.color} 40%, transparent)` }}>
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em]" style={{ color: TONE_CH }}>
          ④ 선택 · 사람이 잡은 다이얼
        </div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          못 바꾸는 것과, <span style={{ color: TONE_CH }}>아직 바꿀 수 있는 것</span>
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          기상의 2주 벽은 <span className="text-ink-1">물리가 정한 것</span>이라 사람이 옮길 수 없습니다. 관측 위성을 몇
          대 더 띄워도 2주는 2주예요. 궤도가 정하는 수만 년의 자연 곡선도 마찬가지고요. 그런데 방금 본 종 모양이 어디까지
          미끄러질지는 <span className="text-ink-1">아직 정해지지 않았습니다.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* 왼쪽 — 버튼이 주인공이다. 누르면 오른쪽 종 모양이 그 자리에서 움직인다. */}
        <div className="flex min-w-0 flex-col gap-2">
          {futures.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(i)}
              aria-pressed={i === pick}
              className="rounded-xl border px-3.5 py-2.5 text-left transition-colors"
              style={{
                borderColor: i === pick ? f.color : 'rgb(255 255 255 / 0.12)',
                background: i === pick ? `color-mix(in oklab, ${f.color} 14%, transparent)` : 'transparent',
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold" style={{ color: f.color }}>
                  {f.label}
                </span>
                <span className="tnum text-[13px] font-semibold text-ink-1">지금보다 +{f.shift.toFixed(1)}℃</span>
              </div>
              {/* 확률은 세 경로 모두 100% 로 포화한다. 갈라지는 것은 '얼마나' 이므로,
                  자연 변동폭(σ)의 몇 배인지로 적는다 — 자연으로는 설명되지 않는 크기다. */}
              <div className="tnum mt-0.5 text-[10.5px] text-ink-3">
                해마다 튀는 폭의 <span className="text-ink-2">{(f.shift / sigma).toFixed(1)}배</span>
              </div>
            </button>
          ))}

          <div className="mt-1 rounded-xl border border-white/10 px-3.5 py-2.5">
            <h3 className="text-[12.5px] font-semibold" style={{ color: future.color }}>
              {lever.headline}
            </h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{lever.body}</p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {lever.acts.map((a) => (
                <li key={a} className="text-[11.5px] leading-relaxed text-ink-3">
                  · {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 오른쪽 — 버튼을 누르면 여기가 움직인다. 그게 이 장면의 인과다. */}
        <div className="flex flex-col gap-2.5">
          <MiniShift sigma={sigma} future={future} />
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            {dragged2100 !== null && (
              <>
                아까 2100년을 <span className="tnum text-ink-1">{dragged2100.toFixed(2)}℃</span>로 직접 끌어보셨습니다.{' '}
              </>
            )}
            버튼을 옮기면 종 모양이 그만큼 덜, 또는 더 미끄러집니다 —{' '}
            <span className="text-ink-1">그 버튼이 실제로는 우리가 지금 하는 선택입니다.</span>
          </p>

          {orbitResult && (
            <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `color-mix(in oklab, ${TONE_CH} 40%, transparent)` }}>
              <div className="text-[10.5px] text-ink-3">3단계 · 임계점 복구</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[15px] font-semibold" style={{ color: orbitResult.success ? 'var(--color-good)' : 'var(--color-warn)' }}>
                  {orbitResult.success ? '복구 성공' : '복구 실패'}
                </span>
                <span className="tnum text-[11.5px] text-ink-2">
                  {orbitResult.earned}/{ORBIT_MISSION_MAX}점
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                거기선 다이얼이 양방향으로 돌았지만, 실제 임계점은 한 방향으로만 열립니다.
              </p>
            </div>
          )}

          <div className="mt-auto rounded-xl border border-white/10 px-3.5 py-3 text-center">
            <div className="text-[10.5px] text-ink-3">최종 점수</div>
            <div className="tnum mt-0.5 text-[30px] leading-none font-semibold">
              {totals.earned}
              <span className="text-[15px] text-ink-3"> / {totals.max}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** 선택한 경로에서 분포가 얼마나 밀리는지 — ② 장면의 그림을 작게 되풀이한다 */
function MiniShift({
  sigma,
  future,
}: {
  sigma: number
  future: { label: string; color: string; shift: number }
}) {
  const sigmaF = sigma * SIGMA_WIDEN
  /* 축은 세 경로에 대해 **고정**이다. 선택에 따라 축이 늘었다 줄면 종 모양이 옮겨간 건지
     자가 바뀐 건지 알 수 없어, 이 장면이 보여주려는 인과가 그대로 사라진다.
     가장 먼 경로(SSP5)의 종 모양 오른쪽 끝까지 담을 폭으로 잡는다. */
  const xDomain: [number, number] = [-3 * sigma, 5.5 + 3 * sigmaF]
  const x = linearScale(xDomain, [MINI_M.left, MINI_W - MINI_M.right])
  const peak = normPdf(0, 0, sigma)
  const y = linearScale([0, peak * 1.2], [MINI_H - MINI_M.bottom, MINI_M.top])

  const curve = (mu: number, sd: number) => {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 80; i++) {
      const v = xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / 80
      pts.push([x(v), y(normPdf(v, mu, sd))])
    }
    return pts
  }
  const area = (pts: Array<[number, number]>) =>
    `${smoothPath(pts)} L${pts[pts.length - 1][0]} ${y(0)} L${pts[0][0]} ${y(0)} Z`

  return (
    <div>
      <ChartFrame
        width={MINI_W}
        height={MINI_H}
        margins={MINI_M}
        x={x}
        y={y}
        xTicks={[0, 2, 4, 6]}
        yTicks={[]}
        xTickFormat={(v) => (v === 0 ? '지금' : `+${v}℃`)}
      >
        <path d={area(curve(0, sigma))} fill="var(--color-series-obs)" opacity={0.1} />
        <path d={smoothPath(curve(0, sigma))} fill="none" stroke="var(--color-series-obs)" strokeWidth={1.4} />
        {/* 색과 위치가 동시에 바뀐다 — 버튼을 누른 결과가 한눈에 보여야 한다 */}
        <path d={area(curve(future.shift, sigmaF))} fill={future.color} opacity={0.22} />
        <path d={smoothPath(curve(future.shift, sigmaF))} fill="none" stroke={future.color} strokeWidth={2.2} />
        <text
          x={Math.min(MINI_W - MINI_M.right - 26, x(future.shift))}
          y={y(normPdf(future.shift, future.shift, sigmaF)) - 6}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          fill={future.color}
        >
          {future.label}
        </text>
      </ChartFrame>
      <div className="-mt-1 text-center text-[10.5px] text-ink-3">2100년 연평균기온의 분포</div>
    </div>
  )
}
