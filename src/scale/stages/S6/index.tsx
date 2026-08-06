/**
 * S6 · 3단계 — 밀란코비치 미션. 사용자 권한이 '조종자'로 올라간다.
 * 궤도 3요소를 직접 돌려 목표 기후 조건(빙하기 유발/해제)을 시간제한 안에 만든다.
 * 데이터 파일이 아니라 물리식으로 실시간 계산한다 (lib/milankovitch.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { InsolationChart } from './InsolationChart'
import { OrbitDiagram } from './OrbitDiagram'
import {
  MISSIONS,
  PRESENT,
  PRESENT_SUMMER,
  RANGES,
  SUMMER_BOUNDS,
  annualAmplitude,
  contribution,
  isMissionMet,
  summerInsolation,
  type MissionId,
  type OrbitParams,
} from '../../lib/milankovitch'
import { S6_MAX, useJourney } from '../../state/journey'

const TIME_LIMIT = 45 // 초
const HOLD_MS = 1000 // 목표 상태를 이만큼 유지해야 성공

const pickMission = (): MissionId => (Math.random() < 0.5 ? 'glaciate' : 'deglaciate')

export function S6Orbital({ onNext }: { onNext: () => void }) {
  const { setOrbitResult } = useJourney()
  const [missionId] = useState(pickMission)
  const mission = MISSIONS[missionId]

  const [params, setParams] = useState<OrbitParams>(PRESENT)
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState(TIME_LIMIT)
  const [hold, setHold] = useState(0) // 0~1
  const [outcome, setOutcome] = useState<'success' | 'timeout' | null>(null)
  const [attempt, setAttempt] = useState(1)
  const holdStart = useRef<number | null>(null)

  const summer = summerInsolation(params)
  const amplitude = annualAmplitude(params)
  const met = isMissionMet(mission, summer)

  const finish = useCallback(
    (result: 'success' | 'timeout', secondsLeft: number) => {
      setOutcome(result)
      const timeBonus = Math.round((secondsLeft / TIME_LIMIT) * 30)
      const earned = result === 'success' ? (attempt === 1 ? 90 + timeBonus : 60) : 0
      setOrbitResult({ missionId, success: result === 'success', secondsLeft, earned, max: S6_MAX })
    },
    [attempt, missionId, setOrbitResult],
  )

  // 타이머
  useEffect(() => {
    if (!started || outcome) return
    const id = window.setInterval(() => {
      setRemaining((r) => {
        const next = Number((r - 0.1).toFixed(1))
        if (next <= 0) {
          finish('timeout', 0)
          return 0
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [started, outcome, finish])

  // 목표 유지 판정
  useEffect(() => {
    if (!started || outcome) return
    if (!met) {
      holdStart.current = null
      setHold(0)
      return
    }
    if (holdStart.current === null) holdStart.current = performance.now()
    let raf = 0
    const tick = () => {
      if (holdStart.current === null) return
      const t = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS)
      setHold(t)
      if (t >= 1) {
        finish('success', remaining)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [met, started, outcome, remaining, finish])

  const update = (key: keyof OrbitParams, value: number) => {
    if (outcome) return
    if (!started) setStarted(true)
    setParams((p) => ({ ...p, [key]: value }))
  }

  const retry = () => {
    setParams(PRESENT)
    setAttempt((a) => a + 1)
    setRemaining(TIME_LIMIT)
    setHold(0)
    holdStart.current = null
    setOutcome(null)
    setStarted(false)
  }

  const gaugePct = ((summer - SUMMER_BOUNDS.min) / (SUMMER_BOUNDS.max - SUMMER_BOUNDS.min)) * 100
  const targetPct = ((mission.threshold - SUMMER_BOUNDS.min) / (SUMMER_BOUNDS.max - SUMMER_BOUNDS.min)) * 100
  const presentPct = ((PRESENT_SUMMER - SUMMER_BOUNDS.min) / (SUMMER_BOUNDS.max - SUMMER_BOUNDS.min)) * 100

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">3단계 · 수만 년</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            미션 · {mission.title}
          </h1>
        </div>
        <Timer remaining={remaining} started={started} outcome={outcome} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)] items-start gap-3">
        {/* 조종석 */}
        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <div className="text-[12px] leading-relaxed text-ink-2">{mission.goal}</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="tnum text-[30px] leading-none font-semibold" style={{ color: met ? 'var(--color-good)' : 'var(--color-ink-1)' }}>
                {summer.toFixed(0)}
              </span>
              <span className="text-[12px] text-ink-3">W/m² · 북위 65° 하지</span>
            </div>

            {/* 게이지 */}
            <div className="relative mt-2 h-2.5 rounded-full bg-white/8">
              <div
                className="absolute inset-y-0 rounded-full transition-[width] duration-150"
                style={{
                  width: `${Math.max(0, Math.min(100, gaugePct))}%`,
                  background: met ? 'var(--color-good)' : 'var(--color-act-3)',
                }}
              />
              <div
                className="absolute -top-1 h-4.5 w-px bg-white/60"
                style={{ left: `${targetPct}%` }}
                title="목표"
              />
              <div className="absolute -bottom-1 h-4.5 w-px bg-act-2/70" style={{ left: `${presentPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink-3">
              <span className="tnum">{SUMMER_BOUNDS.min.toFixed(0)}</span>
              <span>
                현재 지구 <span className="tnum">{PRESENT_SUMMER.toFixed(0)}</span> · 목표{' '}
                <span className="tnum">{mission.threshold.toFixed(0)}</span>
              </span>
              <span className="tnum">{SUMMER_BOUNDS.max.toFixed(0)}</span>
            </div>

            {/* 유지 게이지 */}
            {started && !outcome && (
              <div className="mt-3 flex items-center gap-2 text-[11px]">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${hold * 100}%`, background: 'var(--color-good)' }}
                  />
                </div>
                <span className="text-ink-3">{met ? '유지 중…' : '목표 미달'}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/8 pt-3">
            <Slider
              label="자전축 기울기"
              note="연교차의 진폭을 정한다"
              cycle={RANGES.obliquity.cycle}
              value={params.obliquity}
              min={RANGES.obliquity.min}
              max={RANGES.obliquity.max}
              step={RANGES.obliquity.step}
              format={(v) => `${v.toFixed(2)}°`}
              present={PRESENT.obliquity}
              helpful={contribution(mission, params, 'obliquity', 0.3)}
              onChange={(v) => update('obliquity', v)}
              disabled={!!outcome}
            />
            <Slider
              label="세차 (근일점 경도)"
              note="어느 계절에 태양과 가까워지는지를 정한다"
              cycle={RANGES.precession.cycle}
              value={params.precession}
              min={RANGES.precession.min}
              max={RANGES.precession.max}
              step={RANGES.precession.step}
              format={(v) => `${v.toFixed(0)}°`}
              present={PRESENT.precession}
              helpful={contribution(mission, params, 'precession', 10)}
              onChange={(v) => update('precession', v)}
              disabled={!!outcome}
            />
            <Slider
              label="궤도 이심률"
              note="세차의 효과를 증폭한다 (혼자서는 힘이 약하다)"
              cycle={RANGES.eccentricity.cycle}
              value={params.eccentricity}
              min={RANGES.eccentricity.min}
              max={RANGES.eccentricity.max}
              step={RANGES.eccentricity.step}
              format={(v) => v.toFixed(3)}
              present={PRESENT.eccentricity}
              helpful={contribution(mission, params, 'eccentricity', 0.008)}
              onChange={(v) => update('eccentricity', v)}
              disabled={!!outcome}
            />
          </div>

          <div className="panel-quiet px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
            <span className="text-ink-3">부산(북위 35°) 연교차 진폭 </span>
            <span className="tnum font-semibold">{amplitude.toFixed(0)} W/m²</span>
            <span className="text-ink-3"> (현재 지구 {annualAmplitude(PRESENT).toFixed(0)})</span>
            <br />
            1단계에서 하루의 기온 폭을 정한 건 구름이었다. 1년의 기온 폭을 정하는 건 자전축의 기울기다.
          </div>
        </section>

        {/* 계기판 */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[292px_minmax(0,1fr)] items-start gap-3">
            <OrbitDiagram params={params} />
            <div className="panel flex h-full flex-col justify-between gap-2 p-4 text-[12px] leading-relaxed text-ink-2">
              <div>
                <h3 className="text-[13px] font-semibold text-ink-1">시계로서의 지구</h3>
                <p className="mt-1.5">
                  이 세 값은 지구가 마음대로 정하는 것이 아니다. 다른 행성들의 중력이 만드는{' '}
                  <span className="text-ink-1">천체역학의 결과</span>다. 그래서 10만 년 뒤의 궤도는 계산할 수 있다.
                </p>
              </div>
              <ul className="flex flex-col gap-1 text-[11.5px] text-ink-3">
                <li>· 이심률 — {RANGES.eccentricity.cycle} 주기</li>
                <li>· 자전축 기울기 — {RANGES.obliquity.cycle} 주기</li>
                <li>· 세차 — {RANGES.precession.cycle} 주기</li>
              </ul>
              <p className="text-[11.5px]">
                내일의 비는 못 맞히지만, <span className="text-ink-1">10만 년 뒤 여름의 햇빛 양은 맞힐 수 있다.</span>
              </p>
            </div>
          </div>
          <InsolationChart params={params} mission={mission} summer={summer} met={met} />
        </div>
      </div>

      {/* 하단: 안내 / 결과 */}
      {!outcome ? (
        <div className="flex items-start justify-between gap-6">
          <p className="max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
            {/* 처음부터 답을 주지 않는다 — 절반쯤 지나면 힌트를 연다 */}
            {!started
              ? '슬라이더를 움직이면 제한 시간이 시작된다. 세 다이얼이 여름 햇빛의 양을 어떻게 바꾸는지는 직접 만져보며 찾아라.'
              : remaining > TIME_LIMIT * 0.55
                ? '각 슬라이더 옆에 목표에 가까워지는지 멀어지는지가 표시된다.'
                : mission.hint}
          </p>
          <span className="shrink-0 text-[11px] text-ink-3">
            {attempt > 1 ? `${attempt}번째 시도` : '한 번에 성공하면 시간 보너스'}
          </span>
        </div>
      ) : (
        <ResultBar
          success={outcome === 'success'}
          message={outcome === 'success' ? mission.success : mission.hint}
          attempt={attempt}
          onRetry={retry}
          onNext={onNext}
        />
      )}
    </div>
  )
}

function Timer({
  remaining,
  started,
  outcome,
}: {
  remaining: number
  started: boolean
  outcome: 'success' | 'timeout' | null
}) {
  const pct = (remaining / TIME_LIMIT) * 100
  const urgent = remaining <= 10 && !outcome
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${pct}%`,
            background: outcome === 'success' ? 'var(--color-good)' : urgent ? 'var(--color-bad)' : 'var(--color-act-3)',
          }}
        />
      </div>
      <span
        className="tnum w-14 text-right text-[15px] font-semibold"
        style={{ color: urgent ? 'var(--color-bad)' : 'var(--color-ink-1)' }}
      >
        {remaining.toFixed(1)}s
      </span>
      {!started && !outcome && <span className="text-[11px] text-ink-3">대기</span>}
    </div>
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
  format,
  present,
  helpful,
  onChange,
  disabled,
}: {
  label: string
  note: string
  cycle: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  present: number
  helpful: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const presentPct = ((present - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="tnum text-[13px] font-semibold">{format(value)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-ink-3">
        <span>{note}</span>
        <span>{cycle}</span>
      </div>
      <div className="relative">
        <input
          className="slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        {/* 현재 지구의 값 */}
        <div className="pointer-events-none absolute top-[13px] h-3 w-px bg-act-2/80" style={{ left: `${presentPct}%` }} />
        {/* 이 방향이 목표에 도움이 되는지 */}
        <div className="pointer-events-none absolute top-0 right-0 text-[10px] text-ink-3">
          {Math.abs(helpful) < 0.4 ? '' : helpful > 0 ? '↑ 목표에 가까워짐' : '↓ 목표에서 멀어짐'}
        </div>
      </div>
    </div>
  )
}

function ResultBar({
  success,
  message,
  attempt,
  onRetry,
  onNext,
}: {
  success: boolean
  message: string
  attempt: number
  onRetry: () => void
  onNext: () => void
}) {
  return (
    <div className="panel flex items-start justify-between gap-6 px-5 py-3 rise">
      <div>
        <div
          className="text-[14px] font-semibold"
          style={{ color: success ? 'var(--color-good)' : 'var(--color-warn)' }}
        >
          {success ? '미션 성공' : '시간 종료 — 실패도 발견이다'}
        </div>
        <p className="mt-1 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          {message}{' '}
          {success ? (
            <span className="text-ink-1">
              지구가 수만 년에 걸쳐 실제로 하는 일이고, 시계처럼 계산 가능하다.
            </span>
          ) : (
            <span className="text-ink-1">
              세차를 바꾸지 않으면 이심률은 거의 아무 일도 하지 않는다 — 그 결합이 밀란코비치 이론의 핵심이다.
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!success && attempt < 3 && (
          <button type="button" className="btn btn-ghost" onClick={onRetry}>
            다시 시도
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onNext}>
          여정의 끝으로
        </button>
      </div>
    </div>
  )
}
