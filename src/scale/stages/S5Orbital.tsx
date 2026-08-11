/**
 * S5 · 반전 — "지구는 원래 추워져야 한다".
 *
 * 기획안 §3 S5 는 점수도 제한 시간도 없는 탐색으로 두라고 하지만, 목표가 없으면
 * 다이얼을 몇 번 흔들고 지나가버린다 — 실제로 심심했다. 그래서 **무득점 과제**를
 * 하나 얹었다: 빙하기를 유발하거나 끝내라. 총점 320 은 건드리지 않고(§6 확정),
 * 대신 목표·게이지·다이얼별 힌트가 붙어 손이 계속 움직일 이유를 만든다.
 *
 * 지구와 궤도는 앱 전체가 공유하는 3D 지구([components/GlobeLayer])가 그린다.
 * 슬라이더 값은 [state/world] 로 흘러가 대시보드·지구·이 화면이 같은 값을 본다.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChartFrame } from '../components/ChartFrame'
import { GlobeViewToggle } from '../components/GlobeViewToggle'
import { useGlobe } from '../components/GlobeLayer'
import {
  NATURAL_HORIZON_YEARS,
  naturalCurve,
  naturalEndDelta,
  orbitalWarmth,
} from '../lib/longTermClimate'
import {
  DIAL_BOUNDS,
  MISSIONS,
  PRESENT,
  PRESENT_SUMMER,
  contribution,
  isMissionMet,
  summerInsolation,
  type MissionId,
} from '../lib/milankovitch'
import { linearScale, niceTicks, smoothPath } from '../lib/scales'
import { surfaceFromAnomaly } from '../lib/surfaceState'
import { useWorld } from '../state/world'

/**
 * 다이얼 범위.
 *
 * `real` 은 기획안 §6 의 확정 범위이자 지질시대 동안 지구가 **실제로 오간** 폭이다.
 * 그 바깥은 실험 구간 — 지구가 겪은 적 없는 값이라 트랙에 따로 표시하고, 넘어가면
 * 화면이 그렇게 말한다. 두 구간을 색으로 구분하지 않으면 사용자가 방금 만든 것이
 * 사실인지 상상인지 알 수 없다.
 */
const RANGE = {
  obliquity: { min: 0, max: 90, step: 0.5, real: [22.1, 24.5] as const },
  eccentricity: { min: 0, max: 0.9, step: 0.005, real: [0.005, 0.06] as const },
} as const

const inReal = (v: number, r: readonly [number, number]) => v >= r[0] && v <= r[1]

const W = 344
const H = 208
const M = { top: 18, right: 16, bottom: 30, left: 40 }

export function S5Orbital({ onNext }: { onNext: () => void }) {
  const { orbit, setOrbit, resetWorld } = useWorld()
  const { setSurface, setSurfaceAuto, setOrbitPark, telemetry } = useGlobe()
  const [parked, setParked] = useState(false)
  const [missionId] = useState<MissionId>(() => (Math.random() < 0.5 ? 'glaciate' : 'deglaciate'))
  const mission = MISSIONS[missionId]
  const summerNow = summerInsolation(orbit)
  const met = isMissionMet(mission, summerNow)

  useEffect(() => {
    setOrbitPark(parked)
  }, [parked, setOrbitPark])

  const curve = useMemo(() => naturalCurve(orbit), [orbit])
  const endDelta = naturalEndDelta(orbit)

  /** 지구가 실제로 오간 범위 안인가 */
  const real =
    inReal(orbit.obliquity, RANGE.obliquity.real) &&
    inReal(orbit.eccentricity, RANGE.eccentricity.real)

  /*
   * 지표를 무엇이 그릴지는 어느 구간이냐에 달려 있다.
   *
   *  실제 구간 — 궤도가 이 정도 움직여도 지금 당장 달라지는 건 없다. 의미가 있는
   *              건 수만 년 뒤의 도착점이므로, 장기 곡선의 끝값으로 그린다.
   *  실험 구간 — 근일점이 실제로 가까워지면 일사량이 제곱으로 는다. 그건 만 년을
   *              기다릴 일이 아니라 지금 당장의 평형이므로, 엔진의 에너지 균형
   *              모델이 직접 그리게 둔다.
   */
  useEffect(() => {
    setSurfaceAuto(!real)
    if (real) setSurface(surfaceFromAnomaly(endDelta))
  }, [real, endDelta, setSurface, setSurfaceAuto])
  const warmth = orbitalWarmth(orbit)
  const summer = summerInsolation(orbit)

  return (
    /* 컨테이너는 pointer-events-none — 패널이 없는 자리를 끌면 그대로 궤도가 돈다 */
    <div className="pointer-events-none relative flex min-h-[460px] lg:h-[calc(100vh-12.5rem)] w-full flex-col gap-2">
      <div className="pointer-events-auto">
        <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">3단계 · 수만 년</div>
        <h1 className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          지구의 기후는 원래 만 년 단위로 움직입니다
        </h1>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[332px_minmax(0,1fr)_344px] lg:overflow-visible">
        {/* 조종석 */}
        <section className="panel pointer-events-auto flex flex-col gap-4 overflow-y-auto p-4 backdrop-blur-md">
          <div>
            <div className="text-[10.5px] tracking-[0.1em] text-act-3">과제 · 점수 없음</div>
            <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight">{mission.title}</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{mission.goal}</p>
          </div>

          <Slider
            label="자전축 기울기"
            note="연교차의 진폭을 정합니다"
            cycle="약 4.1만 년 주기"
            value={orbit.obliquity}
            {...RANGE.obliquity}
            present={PRESENT.obliquity}
            format={(v) => `${v.toFixed(1)}°`}
            helpful={contribution(mission, orbit, 'obliquity', 0.5)}
            onChange={(v) => setOrbit({ obliquity: v })}
          />
          <Slider
            label="궤도 이심률"
            note="궤도가 원에서 얼마나 찌그러졌는지"
            cycle="약 10만 년 주기"
            value={orbit.eccentricity}
            {...RANGE.eccentricity}
            present={PRESENT.eccentricity}
            format={(v) => v.toFixed(3)}
            helpful={contribution(mission, orbit, 'eccentricity', 0.005)}
            onChange={(v) => setOrbit({ eccentricity: v })}
          />

          {telemetry && (
            <div
              className="panel-quiet px-3 py-2.5"
              style={
                real
                  ? undefined
                  : { borderColor: 'color-mix(in oklab, var(--color-bad) 50%, transparent)' }
              }
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] text-ink-3">지금 · 표면 평형 온도</span>
                {!real && (
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--color-bad)' }}>
                    실험 구간
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="tnum text-[24px] leading-none font-semibold"
                  style={{ color: telemetry.Teq > 60 ? 'var(--color-bad)' : telemetry.Teq < -20 ? 'var(--color-act-1)' : undefined }}
                >
                  {telemetry.Teq.toFixed(0)}
                </span>
                <span className="text-[11px] text-ink-3">℃ · {telemetry.au.toFixed(2)} AU</span>
              </div>
              <div className="tnum mt-1 text-[10.5px] text-ink-3">
                일사량 {Math.round(telemetry.S).toLocaleString()} W/m²
                <br />
                근일점 {telemetry.auPeri.toFixed(2)} AU 에서{' '}
                <span style={{ color: telemetry.Tperi > 100 ? 'var(--color-bad)' : undefined }}>
                  {telemetry.Tperi.toFixed(0)}℃
                </span>{' '}
                · 원일점 {telemetry.auApo.toFixed(2)} AU
              </div>
            </div>
          )}

          <div
            className="panel-quiet px-3 py-2.5"
            style={met ? { borderColor: 'color-mix(in oklab, var(--color-good) 55%, transparent)' } : undefined}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] text-ink-3">북위 65° 하지 일사량</span>
              {met && (
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-good)' }}>
                  목표 달성
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="tnum text-[24px] leading-none font-semibold"
                style={{ color: met ? 'var(--color-good)' : undefined }}
              >
                {summer.toFixed(0)}
              </span>
              <span className="text-[11px] text-ink-3">W/m² (현재 지구 {summerInsolation(PRESENT).toFixed(0)})</span>
            </div>

            {/* 목표 게이지 — 지금 어디에 있고 어디로 가야 하는지 */}
            <div className="relative mt-2 h-2.5 rounded-full bg-white/8">
              <div
                className="absolute inset-y-0 rounded-full transition-[width] duration-150"
                style={{
                  width: `${Math.max(0, Math.min(100, ((summerNow - DIAL_BOUNDS.min) / (DIAL_BOUNDS.max - DIAL_BOUNDS.min)) * 100))}%`,
                  background: met ? 'var(--color-good)' : 'var(--color-act-3)',
                }}
              />
              <div
                className="absolute -top-1 h-4.5 w-px bg-white/70"
                style={{ left: `${((mission.threshold - DIAL_BOUNDS.min) / (DIAL_BOUNDS.max - DIAL_BOUNDS.min)) * 100}%` }}
                title="목표"
              />
              <div
                className="absolute -bottom-1 h-4.5 w-px bg-act-2/70"
                style={{ left: `${((PRESENT_SUMMER - DIAL_BOUNDS.min) / (DIAL_BOUNDS.max - DIAL_BOUNDS.min) ) * 100}%` }}
                title="현재 지구"
              />
            </div>
            <div className="tnum mt-1.5 flex justify-between text-[10px] text-ink-3">
              <span>{DIAL_BOUNDS.min.toFixed(0)}</span>
              <span>목표 {mission.threshold.toFixed(0)}</span>
              <span>{DIAL_BOUNDS.max.toFixed(0)}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
              고위도의 여름이 서늘하면 겨울 눈이 녹지 않고 쌓입니다. 빙하기의 방아쇠는 추운 겨울이 아니라{' '}
              <span className="text-ink-2">서늘한 여름</span>이에요.
            </p>
            {/* 이심률을 키웠는데 오히려 서늘해지는 건 버그가 아니라 지금 지구의 사정이다.
                설명이 없으면 슬라이더가 고장 난 것처럼 읽힌다. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
              지금 지구는 <span className="text-ink-2">1월 초에 태양과 가장 가깝습니다.</span> 그래서 이심률을 키우면
              북반구의 여름은 태양에서 더 멀어져요 — 궤도를 찌그러뜨릴수록 여름이 서늘해집니다.
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            {/* 근일점은 스쳐 지나간다 — 케플러 2법칙이라 그게 맞다. 시간을 왜곡해
                느리게 만드는 대신 거기에 세워 두고 보게 한다. */}
            <button
              type="button"
              onClick={() => setParked((v) => !v)}
              aria-pressed={parked}
              className="rounded-full border px-3 py-2 text-[12px] transition-colors"
              style={{
                borderColor: parked
                  ? 'color-mix(in oklab, var(--color-act-3) 65%, transparent)'
                  : 'rgb(255 255 255 / 0.14)',
                background: parked ? 'color-mix(in oklab, var(--color-act-3) 18%, transparent)' : 'transparent',
                color: parked ? 'var(--color-ink-1)' : 'var(--color-ink-2)',
              }}
            >
              {parked ? '● 근일점에 세워둠 — 다시 돌리기' : '근일점에 세우기'}
            </button>
            <button type="button" className="btn btn-ghost py-2 text-[12px]" onClick={resetWorld}>
              현재 지구로 되돌리기
            </button>
          </div>
        </section>

        {/* 우주 — 캔버스는 앱 전체가 공유한다. 여기엔 시점 토글만. */}
        <div className="relative">
          <GlobeViewToggle />
        </div>

        {/* 자연 곡선 */}
        <div className="pointer-events-auto flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="panel p-3 backdrop-blur-md">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[12.5px] font-semibold">자연 변수만의 장기 기온</h3>
              <span className="text-[10px] text-ink-3">향후 5만 년</span>
            </div>
            <NaturalChart curve={curve} />
            <p className="mt-1 text-[10px] leading-snug text-ink-3">
              궤도 두 값을 입력으로 하는 <span className="text-ink-2">교육용 단순화 모델</span>입니다. 실제 밀란코비치
              수치 계산이 아니며, 시간 규모는 만 년 단위입니다.
            </p>
          </div>

          <div
            className="panel flex flex-col gap-2 p-4 text-[11.5px] leading-relaxed backdrop-blur-md"
            style={{ borderColor: 'color-mix(in oklab, var(--color-act-3) 40%, transparent)' }}
          >
            <h3 className="text-[13px] font-semibold text-ink-1">
              {real ? '얼마나, 그리고 얼마 만에' : '여기서부터는 지구가 아닙니다'}
            </h3>
            {!real && telemetry && (
              <p className="text-ink-2">
                근일점이 <span className="tnum text-ink-1">{telemetry.auPeri.toFixed(2)} AU</span> 까지 들어왔습니다.
                일사량은 거리의 제곱에 반비례하므로 근일점을 지날 때 표면 평형 온도가{' '}
                <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                  {telemetry.Tperi.toFixed(0)}℃
                </span>{' '}
                까지 오릅니다 — {telemetry.Tperi > 100 ? '바다가 끓고, ' : ''}
                {telemetry.Tperi > 260 ? '지각이 달아오릅니다.' : '지구가 견딜 수 있는 값이 아닙니다.'}
                <br />
                지구가 궤도를 한 바퀴 돌 때마다 달아올랐다 식습니다 — 근일점은 순식간에 지나가거든요.
                <br />
                <span className="text-ink-3">
                  이 계산은 진짜입니다(슈테판–볼츠만). 다만 지구의 궤도는 이런 값을 가진 적이 없습니다 — 초록 띠
                  안쪽이 실제로 오간 범위예요.
                </span>
              </p>
            )}
            <p className="text-ink-2" style={real ? undefined : { display: 'none' }}>
              지금 설정에서 5만 년 뒤 자연 기온은{' '}
              <span className="tnum font-semibold" style={{ color: 'var(--color-act-3)' }}>
                {endDelta > 0 ? '+' : ''}
                {endDelta.toFixed(1)}℃
              </span>{' '}
              입니다. 다이얼을 끝에서 끝까지 밀어도 <span className="text-ink-1">−2.6 ~ +1.3℃</span> 사이예요.
            </p>
            <p className="text-ink-3">
              {warmth > 0.75
                ? '고위도의 여름을 뜨겁게 만든 배치입니다 — 빙하가 물러나는 방향이에요.'
                : warmth < 0.3
                  ? '서늘한 배치입니다. 고위도의 눈이 여름을 버티기 시작하는 조건이에요.'
                  : '현재 지구와 비슷한 배치입니다.'}{' '}
              중요한 건 부호가 아니라 <span className="text-ink-2">도착 시간</span>입니다 — 저 폭은 전부{' '}
              <span className="text-ink-1">만 년 단위</span>에 걸쳐 옵니다.
            </p>
          </div>
        </div>
      </div>

      <div className="panel pointer-events-auto flex items-center justify-between gap-6 px-5 py-3 backdrop-blur-md">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          {met && (
            <>
              <span className="font-semibold" style={{ color: 'var(--color-good)' }}>
                {mission.success}
              </span>{' '}
            </>
          )}
          내일의 비는 못 맞혀도 <span className="text-ink-1">10만 년 뒤 여름의 햇빛 양은 계산할 수 있습니다.</span>{' '}
          천체역학은 시계니까요. 그런데 지구는 지금, 이 시계가 만 년에 걸쳐 하는 일을{' '}
          <span className="text-ink-1">수백 년 만에</span> 겪고 있습니다.
        </p>
        <button type="button" className="btn btn-primary shrink-0" onClick={onNext}>
          이 시계를 직접 만져보기
        </button>
      </div>
    </div>
  )
}

function NaturalChart({ curve }: { curve: { year: number; delta: number }[] }) {
  const x = linearScale([0, NATURAL_HORIZON_YEARS], [M.left, W - M.right])
  // 곡선은 −2.6 … +1.3℃ 를 오간다. 위쪽을 0.5 로 막아두면 따뜻한 배치에서 잘린다.
  const y = linearScale([-3.2, 2], [H - M.bottom, M.top])
  const pts = curve.map((p) => [x(p.year), y(p.delta)] as [number, number])

  return (
    <ChartFrame
      width={W}
      height={H}
      margins={M}
      x={x}
      y={y}
      xTicks={[0, 10_000, 20_000, 30_000, 40_000, 50_000]}
      yTicks={niceTicks(-3, 2, 5)}
      xTickFormat={(v) => (v === 0 ? '지금' : `${v / 10_000}만`)}
      yTickFormat={(v) => `${v}`}
      yUnit="℃"
    >
      {/* 현 수준 기준선 — 곡선이 이 선을 넘지 않는 것이 이 화면의 논지다 */}
      <line
        x1={M.left}
        x2={W - M.right}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--color-ink-3)"
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      <path d={smoothPath(pts)} fill="none" stroke="var(--color-act-3)" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} fill="var(--color-act-3)" />
    </ChartFrame>
  )
}

function Slider({
  label,
  note,
  cycle,
  value,
  min,
  max,
  step,
  real,
  present,
  format,
  helpful,
  onChange,
}: {
  label: string
  note: string
  cycle: string
  value: number
  min: number
  max: number
  step: number
  /** 지구가 실제로 오간 범위 */
  real: readonly [number, number]
  present: number
  format: (v: number) => string
  /** 이 방향이 과제 목표에 도움이 되는지 (양수면 가까워짐) */
  helpful?: number
  onChange: (v: number) => void
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const outside = !inReal(value, real)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span
          className="tnum text-[13px] font-semibold"
          style={outside ? { color: 'var(--color-bad)' } : undefined}
        >
          {format(value)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-ink-3">
        <span>{note}</span>
        <span>
          {helpful !== undefined && Math.abs(helpful) >= 0.4 ? (
            <span style={{ color: helpful > 0 ? 'var(--color-good)' : 'var(--color-ink-3)' }}>
              {helpful > 0 ? '↑ 목표에 가까워짐' : '↓ 멀어짐'}
            </span>
          ) : (
            cycle
          )}
        </span>
      </div>
      <div className="relative">
        {/* 지구가 실제로 오간 범위 — 이 띠 밖은 상상이다 */}
        <div
          className="pointer-events-none absolute top-[16px] h-1.5 rounded-full"
          style={{
            left: `${pct(real[0])}%`,
            width: `${Math.max(1.2, pct(real[1]) - pct(real[0]))}%`,
            background: 'color-mix(in oklab, var(--color-good) 55%, transparent)',
          }}
        />
        <input
          className="slider relative"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        {/* 현재 지구의 값 */}
        <div className="pointer-events-none absolute top-[13px] h-3 w-px bg-act-2/80" style={{ left: `${pct(present)}%` }} />
      </div>
      <div className="tnum flex justify-between text-[9.5px] text-ink-3">
        <span>{format(min)}</span>
        <span style={{ color: 'var(--color-good)' }}>지구가 실제로 오간 범위</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}
