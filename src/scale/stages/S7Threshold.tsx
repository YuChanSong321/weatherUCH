/**
 * S7 · 임계점 샌드박스 — "지구를 지켜라" (120점, 90초).
 *
 * 기획안 §3 S7. 랜덤한 위기 상태로 시작해, 제한 시간 안에 세 다이얼을 안전
 * 범위로 되돌리면 득점한다. 임계치를 **넘겨보는 것**이 학습의 핵심이라 슬라이더는
 * 위험 구간까지 열려 있고, 넘는 순간 자기권이 무너지고 대기가 붉어진다.
 *
 * 연출은 [src/sim/terra-engine.js] 의 자기권 레이어가, 판정 문구는
 * [lib/thresholdEngine] 의 규칙 엔진이 맡는다. 이 파일은 미션 로직만 담는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGlobe } from '../components/GlobeLayer'
import { StageBrief } from '../components/StageBrief'
import { THRESHOLDS } from '../lib/earthState'
import { surfaceFromThresholds } from '../lib/surfaceState'
import { diagnose, overallSeverity, SEVERITY_COLOR } from '../lib/thresholdEngine'
import { ORBIT_MISSION_MAX, useJourney } from '../state/journey'
import { useWorld } from '../state/world'

/** 기획안 §6 확정값 */
const TIME_LIMIT = 90
/** 안전 판정을 이만큼 유지해야 성공 — 스쳐 지나간 것을 성공으로 치지 않는다 */
const HOLD_MS = 1500

type Crisis = { id: string; title: string; brief: string; apply: () => Partial<CrisisState> }
type CrisisState = { magneticField: number; eccentricity: number; obliquity: number }

const CRISES: Crisis[] = [
  {
    id: 'shield',
    title: '자기권 붕괴',
    brief: '지자기가 15%까지 떨어졌습니다. 태양풍이 대기를 그대로 때리고 있어요.',
    apply: () => ({ magneticField: 15 }),
  },
  {
    id: 'orbit',
    title: '궤도 극단화',
    brief: '이심률이 0.056까지 벌어졌습니다. 원일점의 겨울이 감당할 수 없이 길어집니다.',
    apply: () => ({ eccentricity: 0.056 }),
  },
  {
    id: 'double',
    title: '이중 임계',
    brief: '자기권이 12%로 무너진 상태에서 궤도까지 0.054로 벌어졌습니다.',
    apply: () => ({ magneticField: 12, eccentricity: 0.054 }),
  },
]

export function S7Threshold({ onNext }: { onNext: () => void }) {
  const { setOrbitResult } = useJourney()
  const { orbit, magneticField, setOrbit, setMagneticField, alerts } = useWorld()
  const { setMagnetosphere, setMagneticField: setGlobeField, setSurface } = useGlobe()

  const [crisis] = useState(() => CRISES[Math.floor(Math.random() * CRISES.length)])
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState(TIME_LIMIT)
  const [hold, setHold] = useState(0)
  const [outcome, setOutcome] = useState<'success' | 'timeout' | null>(null)
  const holdStart = useRef<number | null>(null)

  const diagnoses = useMemo(() => diagnose({ ...orbit, magneticField }), [orbit, magneticField])
  const severity = overallSeverity(diagnoses)
  const safe = severity === 'stable'

  // 자기권 레이어를 켜고, 위기 상태를 세팅한 뒤 시작한다
  useEffect(() => {
    setMagnetosphere(true)
    const patch = crisis.apply()
    if (patch.magneticField !== undefined) setMagneticField(patch.magneticField)
    if (patch.eccentricity !== undefined) setOrbit({ eccentricity: patch.eccentricity })
    if (patch.obliquity !== undefined) setOrbit({ obliquity: patch.obliquity })
    return () => setMagnetosphere(false)
    // 진입 시 한 번만 — 이후엔 사용자가 값을 만진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 자기장 값 → 엔진 (궤도 값은 GlobeLayer 가 이미 흘려보낸다)
  useEffect(() => {
    setGlobeField(magneticField)
  }, [magneticField, setGlobeField])

  // 임계를 넘긴 만큼만 지표가 변한다 — 넘기 전에는 아무 일도 일어나지 않아야
  // '임계점'이라는 말이 성립한다
  useEffect(() => {
    setSurface(surfaceFromThresholds(orbit.eccentricity, magneticField))
  }, [orbit.eccentricity, magneticField, setSurface])

  const finish = useCallback(
    (result: 'success' | 'timeout', secondsLeft: number) => {
      setOutcome(result)
      // 복구 정확도(안전 진입)와 속도(남은 시간)로 배점 — 기획안 §3 S7
      const timeBonus = Math.round((secondsLeft / TIME_LIMIT) * 30)
      const earned = result === 'success' ? 90 + timeBonus : 0
      setOrbitResult({
        missionId: crisis.id,
        success: result === 'success',
        secondsLeft,
        earned,
        max: ORBIT_MISSION_MAX,
      })
    },
    [crisis.id, setOrbitResult],
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

  // 안전 상태 유지 판정
  useEffect(() => {
    if (!started || outcome) return
    if (!safe) {
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
      if (t >= 1) return finish('success', remaining)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [safe, started, outcome, remaining, finish])

  const touch = () => {
    if (!started && !outcome) setStarted(true)
  }

  return (
    <div className="pointer-events-none relative flex min-h-[460px] lg:h-[calc(100vh-12.5rem)] w-full flex-col gap-2">
      <div className="flex items-end justify-between">
        <div className="pointer-events-auto">
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">3단계 · 임계</div>
          <h1 className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            지구를 지켜라 · {crisis.title}
          </h1>
        </div>
        <div className="pointer-events-auto">
          <Timer remaining={remaining} started={started} outcome={outcome} />
        </div>
      </div>

      <div className="pointer-events-auto">
        <StageBrief
          tone="var(--color-act-3)"
          overGlobe
          doing="위기 상태로 시작합니다. 세 다이얼을 안전 구간으로 되돌리되, 위험 쪽으로 넘겨보는 것도 실험이에요."
          learning={
            <>
              <span className="text-ink-1">임계점(Tipping point)</span> — 어떤 값은 조금씩 변하다가 어느 선을 넘는 순간
              시스템이 다른 상태로 통째로 넘어가고, 그 뒤로는 원인을 되돌려도 결과가 돌아오지 않는다.
            </>
          }
          using="빙상 붕괴·해양 순환·아마존 열대우림처럼 되돌릴 수 없는 지점을 미리 계산해 두는 일 — 1.5℃·2℃ 같은 목표선이 그래서 존재합니다."
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[332px_minmax(0,1fr)_356px] lg:overflow-visible">
        {/* 조종석 */}
        <section className="panel pointer-events-auto flex flex-col gap-3.5 overflow-y-auto p-4 backdrop-blur-md">
          <p className="text-[12px] leading-relaxed text-ink-2">{crisis.brief}</p>

          <Dial
            label="지자기 세기"
            note={`${THRESHOLDS.magneticCollapse}% 이하에서 차폐 상실`}
            concept="지구 바깥핵의 액체 철이 흐르며 만드는 자기장입니다. 태양풍과 우주선을 휘어 보내 대기와 오존층을 지켜요. 나침반이 북쪽을 가리키는 이유이기도 합니다."
            value={magneticField}
            min={0}
            max={100}
            step={1}
            danger={magneticField <= THRESHOLDS.magneticCollapse}
            format={(v) => `${v.toFixed(0)}%`}
            safeFrom={60}
            safeTo={100}
            onChange={(v) => {
              touch()
              setMagneticField(v)
            }}
            disabled={!!outcome}
          />
          <Dial
            label="궤도 이심률"
            note={`${THRESHOLDS.eccentricityExtreme} 이상에서 궤도 극단화`}
            concept="공전 궤도가 원에서 얼마나 찌그러졌는지. 0이면 완전한 원이라 1년 내내 태양과의 거리가 같고, 커질수록 근일점과 원일점의 차이가 벌어집니다."
            value={orbit.eccentricity}
            min={0.005}
            max={0.06}
            step={0.001}
            danger={alerts.eccentricity}
            format={(v) => v.toFixed(3)}
            safeFrom={0.005}
            safeTo={0.03}
            onChange={(v) => {
              touch()
              setOrbit({ eccentricity: v })
            }}
            disabled={!!outcome}
          />
          <Dial
            label="자전축 기울기"
            note="22.5°–24.0° 가 온화한 구간"
            concept="자전축이 공전면에 대해 기울어진 각도. 계절이 생기는 이유이고, 클수록 여름과 겨울의 차이가 커집니다. 0°면 계절이 사라져요."
            value={orbit.obliquity}
            min={22.1}
            max={24.5}
            step={0.05}
            danger={false}
            format={(v) => `${v.toFixed(2)}°`}
            safeFrom={22.5}
            safeTo={24.0}
            onChange={(v) => {
              touch()
              setOrbit({ obliquity: v })
            }}
            disabled={!!outcome}
          />

          {started && !outcome && (
            <div className="mt-auto flex items-center gap-2 text-[11px]">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full" style={{ width: `${hold * 100}%`, background: 'var(--color-good)' }} />
              </div>
              <span className="text-ink-3">{safe ? '안정 유지 중…' : '아직 위험 구간'}</span>
            </div>
          )}
        </section>

        {/* 우주 — 자기권은 캔버스가 그린다 */}
        <div className="relative" />

        {/* 예측 엔진 보고서 */}
        <div className="pointer-events-auto flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div className="panel flex flex-col gap-2 p-3.5 backdrop-blur-md">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[12.5px] font-semibold">지구 시스템 진단</h3>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 22%, transparent)`,
                  color: SEVERITY_COLOR[severity],
                }}
              >
                {severity === 'stable' ? '안정' : severity === 'warning' ? '주의' : '위험'}
              </span>
            </div>
            {diagnoses.map((d) => (
              <div key={d.id} className="panel-quiet px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: SEVERITY_COLOR[d.severity] }}
                  />
                  <span className="text-[11.5px] font-medium">{d.subject}</span>
                  <span className="text-[11px]" style={{ color: SEVERITY_COLOR[d.severity] }}>
                    {d.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{d.impact}</p>
              </div>
            ))}
            <p className="text-[10px] leading-snug text-ink-3">
              규칙 기반 진단입니다 — 널리 알려진 인과관계를 교육용으로 정리한 것이며, 지구시스템 모델의 계산 결과가
              아닙니다.
            </p>
          </div>

          {/*
            이 화면이 다음 화면으로 넘어가는 논리적 다리.
            여기까지 사용자는 '사람이 만질 수 없는 다이얼' 세 개를 만져봤다. 그 경험이
            의미를 갖는 건, 사람이 실제로 잡고 있는 다이얼이 딱 하나 있다는 사실과
            맞붙었을 때다. 이 문단이 없으면 이 단계는 그냥 재미있는 미니게임으로 끝난다.
          */}
          <div
            className="panel flex flex-col gap-1.5 p-3.5 backdrop-blur-md"
            style={{ borderColor: 'color-mix(in oklab, var(--color-act-3) 40%, transparent)' }}
          >
            <h3 className="text-[12.5px] font-semibold">임계점이란 무엇인가</h3>
            <p className="text-[11px] leading-relaxed text-ink-2">
              다이얼을 조금씩 움직이는 동안에는 아무 일도 일어나지 않다가, 어느 선을 넘는 순간 화면 전체가 바뀌는 걸
              보셨을 거예요. 그게 <span className="text-ink-1">임계점</span>입니다. 변화가 비례해서 오지 않고,{' '}
              <span className="text-ink-1">넘기 전까지는 조용합니다.</span>
            </p>
            <p className="text-[11px] leading-relaxed text-ink-3">
              그리고 실제 임계점은 이 시뮬레이터와 달리 <span className="text-ink-2">한 방향으로만 열립니다</span> —
              빙상이 무너진 뒤 기온을 되돌려도 빙상은 돌아오지 않아요. 되돌리는 다이얼이 아예 없는 겁니다.
            </p>
            <p className="border-t border-white/8 pt-1.5 text-[11px] leading-relaxed text-ink-3">
              방금 만진 세 다이얼은 <span className="text-ink-2">사람이 만질 수 없는 것</span>들입니다. 자기장도 궤도도
              우리 소관이 아니에요. 그런데 사람이 실제로 손에 쥔 다이얼이 딱 하나 있습니다 —{' '}
              <span className="text-ink-1">대기 중 이산화탄소</span>. 다음 화면이 그 하나를 놓고 벌어지는 이야기입니다.
            </p>
          </div>
        </div>
      </div>

      {!outcome ? (
        <div className="pointer-events-auto flex items-baseline justify-between gap-6 rounded-xl bg-black/45 px-4 py-2 backdrop-blur-sm">
          <p className="text-[12px] leading-relaxed text-ink-2">
            {!started
              ? '다이얼을 움직이면 제한 시간이 시작됩니다. 세 진단이 모두 초록이 되도록 되돌리세요 — 위험 구간까지 밀어보는 것도 실험입니다.'
              : safe
                ? '안정 구간에 들어왔습니다. 잠깐만 유지하세요.'
                : '아직 붉은 항목이 있습니다. 오른쪽 진단이 무엇이 문제인지 말해줍니다.'}
          </p>
          <span className="shrink-0 text-[11px] text-ink-3">빠르게 복구할수록 시간 보너스</span>
        </div>
      ) : (
        <ResultBar
          success={outcome === 'success'}
          remaining={remaining}
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
  const urgent = remaining <= 15 && !outcome
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

/** 안전 구간이 트랙 위에 표시되는 슬라이더 — 어디로 되돌려야 하는지가 보여야 한다 */
function Dial({
  label,
  note,
  concept,
  value,
  min,
  max,
  step,
  danger,
  format,
  safeFrom,
  safeTo,
  onChange,
  disabled,
}: {
  label: string
  note: string
  /** 이 값이 대체 무엇인지 — 조작만으로는 알 수 없는 것 */
  concept: string
  value: number
  min: number
  max: number
  step: number
  danger: boolean
  format: (v: number) => string
  safeFrom: number
  safeTo: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span
          className="tnum text-[13px] font-semibold"
          style={{ color: danger ? 'var(--color-bad)' : undefined }}
        >
          {format(value)}
        </span>
      </div>
      <div className="text-[10.5px] text-ink-3">{note}</div>
      <div className="relative">
        {/* 안전 구간 띠 */}
        <div
          className="pointer-events-none absolute top-[16px] h-1.5 rounded-full"
          style={{
            left: `${pct(safeFrom)}%`,
            width: `${pct(safeTo) - pct(safeFrom)}%`,
            background: 'color-mix(in oklab, var(--color-good) 45%, transparent)',
          }}
        />
        <input
          className="slider relative"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      </div>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-3">{concept}</p>
    </div>
  )
}

function ResultBar({
  success,
  remaining,
  onNext,
}: {
  success: boolean
  remaining: number
  onNext: () => void
}) {
  return (
    <div className="panel rise pointer-events-auto flex items-start justify-between gap-6 px-5 py-3 backdrop-blur-md">
      <div>
        <div
          className="text-[14px] font-semibold"
          style={{ color: success ? 'var(--color-good)' : 'var(--color-warn)' }}
        >
          {success ? `복구 성공 · ${remaining.toFixed(1)}초 남김` : '시간 종료 — 실패도 발견입니다'}
        </div>
        <p className="mt-1 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          {success ? (
            <>
              되돌려 놓으셨습니다. 다만 이건 시뮬레이터라 다이얼이 양방향으로 돕니다 —{' '}
              <span className="text-ink-1">실제 임계점은 한 방향으로만 열립니다.</span> 넘고 나면 되돌리는 다이얼이
              없어요.
            </>
          ) : (
            <>
              임계점을 넘긴 상태로 시간이 끝났습니다. 실제 지구에서도 마찬가지입니다 —{' '}
              <span className="text-ink-1">넘고 나서 고치는 것보다 넘지 않는 편이 훨씬 쉽습니다.</span>
            </>
          )}
        </p>
      </div>
      <button type="button" className="btn btn-primary shrink-0" onClick={onNext}>
        두 시계를 겹쳐보기
      </button>
    </div>
  )
}
