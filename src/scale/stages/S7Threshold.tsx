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
import { useFitZoom } from '../components/useFitZoom'
import { StageIntro, StageIntroBar, type IntroStep } from '../components/StageIntro'
import { THRESHOLDS } from '../lib/earthState'
import { clamp } from '../lib/scales'
import { surfaceFromThresholds } from '../lib/surfaceState'
import { diagnose, overallSeverity, SEVERITY_COLOR } from '../lib/thresholdEngine'
import { ORBIT_MISSION_MAX, useJourney } from '../state/journey'
import { useWorld } from '../state/world'

/**
 * 난이도.
 *
 * 처음에는 90초에 유지 1.5초였는데, 안전 구간이 트랙에 그려져 있으니 다이얼 두 개를
 * 끌어다 놓고 잠깐 기다리면 끝나 "너무 쉽다"는 지적을 받았다. 세 곳을 조인다.
 *   ① 시간을 60초로 줄인다 (기획안 §6 의 90초에서 조정).
 *   ② 유지 시간을 4초로 늘린다 — 스쳐 지나간 안정은 복구가 아니다.
 *   ③ 위기가 세 다이얼을 **모두** 흔들어 놓는다 (아래 CRISES).
 *
 * 그래도 쉬웠다. 안전 구간이 트랙에 그려져 있으니 세 번 끌어다 놓고 기다리면 끝나서,
 * 손이 할 일이 10초면 다 끝났다. 그래서 위기마다 **다이얼 하나가 계속 밀린다**:
 *   ④ 압박(drift) — 태양풍·궤도 공명·달의 토크처럼 그 값을 원래 위기 쪽으로 되돌리는
 *      힘이 실제로 있다. 손을 떼면 되돌아가므로, 안전 구간 안쪽 깊숙이 밀어 두고
 *      유지하는 동안 계속 붙들어야 한다. "복구에는 힘이 든다"가 조작으로 들어온다.
 *   ⑤ 임계를 넘을 때마다 시간 −3초, 그리고 필요한 유지 시간이 1.5초 늘어난다 —
 *      되돌리는 문이 넘을 때마다 좁아지는 것(히스테리시스)을 규칙으로 옮긴 것이다.
 *
 * ⚠️ 압박의 시간 규모는 실제와 다르다(실제로는 수천~수만 년). 화면에 그렇게 적는다.
 */
const TIME_LIMIT = 60
/** 안전 판정을 이만큼 유지해야 성공 — 스쳐 지나간 것을 성공으로 치지 않는다 */
const HOLD_MS = 4000
/** 임계(위험 판정)로 넘어갈 때마다 잃는 시간(초) */
const BREACH_PENALTY = 3
/** 임계를 넘을 때마다 늘어나는 유지 시간(ms) — 되돌리는 문이 좁아진다 */
const BREACH_HOLD_EXTRA = 1500
/** 압박을 계산하는 주기(ms). 손이 닿아 있는 동안에는 밀지 않는다. */
const DRIFT_TICK = 150
const DRIFT_GRACE = 450

type CrisisState = { magneticField: number; eccentricity: number; obliquity: number }

/** 손을 떼면 값을 위기 쪽으로 되돌리는 힘 */
type Drift = {
  key: keyof CrisisState
  /** 다이얼 이름 (배지에 쓴다) */
  dial: string
  /** 초당 변화량 — 부호가 곧 방향이다 */
  perSec: number
  /** 무엇이 밀고 있는가 */
  mechanism: string
}

type Crisis = {
  id: string
  title: string
  brief: string
  apply: () => Partial<CrisisState>
  drift: Drift
}

/**
 * 위기 시나리오.
 *
 * 세 다이얼이 모두 안전 구간 밖에서 시작한다 — 두 개만 흔들려 있으면 나머지 하나를
 * 건드리지 않아도 되니 "무엇이 문제인지 진단을 읽는" 일이 생략된다.
 */
const CRISES: Crisis[] = [
  {
    id: 'shield',
    title: '자기권 붕괴',
    brief: '지자기가 9%로 무너졌습니다. 태양풍이 대기를 그대로 때리는 중이고, 궤도(0.052)와 자전축(24.4°)도 흔들렸어요.',
    apply: () => ({ magneticField: 9, eccentricity: 0.052, obliquity: 24.4 }),
    drift: {
      key: 'magneticField',
      dial: '지자기 세기',
      perSec: -12,
      mechanism: '태양풍 폭풍이 자기권을 계속 압박합니다 — 손을 떼면 다시 무너져요.',
    },
  },
  {
    id: 'orbit',
    title: '궤도 극단화',
    brief: '이심률이 0.058까지 벌어졌습니다. 원일점의 겨울이 감당할 수 없이 길어집니다 — 지자기도 34%로 약해졌어요.',
    apply: () => ({ eccentricity: 0.058, obliquity: 24.35, magneticField: 34 }),
    drift: {
      key: 'eccentricity',
      dial: '궤도 이심률',
      perSec: 0.008,
      mechanism: '목성·금성과의 궤도 공명이 이심률을 계속 밀어 올립니다 — 실제로 이심률을 흔드는 그 힘입니다.',
    },
  },
  {
    id: 'double',
    title: '이중 임계',
    brief: '자기권이 12%로 무너진 상태에서 궤도까지 0.056으로 벌어졌습니다. 자전축은 22.2°로 누웠어요.',
    apply: () => ({ magneticField: 12, eccentricity: 0.056, obliquity: 22.2 }),
    drift: {
      key: 'magneticField',
      dial: '지자기 세기',
      perSec: -14,
      mechanism: '이중 임계 상태라 자기권이 더 빠르게 밀립니다 — 손을 떼면 곧 무너져요.',
    },
  },
  {
    id: 'tilt',
    title: '자전축 이탈',
    brief: '자전축이 22.15°까지 누웠습니다 — 고위도의 여름이 서늘해져 눈이 녹지 않습니다. 지자기 28%, 이심률 0.047.',
    apply: () => ({ obliquity: 22.15, magneticField: 28, eccentricity: 0.047 }),
    drift: {
      key: 'obliquity',
      dial: '자전축 기울기',
      perSec: -0.5,
      mechanism: '달과 태양이 자전축에 거는 토크가 계속 눕힙니다 — 실제로 기울기를 흔드는 그 힘입니다.',
    },
  },
]

/**
 * 본 화면에 앞서 한 마디씩 거치는 도입 (→ [components/StageIntro]).
 * 3열 띠로 한꺼번에 깔면 한 줄이 화면 폭만큼 늘어나 읽히지 않는다. 제한 시간은
 * 사용자가 다이얼을 처음 만질 때 시작하므로, 도입을 읽는 동안 시간이 흐르지 않는다.
 */
const INTRO: IntroStep[] = [
  {
    label: '지금 할 일',
    body: (
      <>
        위기 상태로 시작합니다. 세 다이얼을 <span className="text-act-3">안전 구간</span>으로 되돌리되, 위험 쪽으로
        넘겨보는 것도 실험이에요.
      </>
    ),
  },
  {
    label: '여기서 배우는 개념',
    body: (
      <>
        <span className="text-act-3">임계점(Tipping point)</span> — 어떤 값은 조금씩 변하다가 어느 선을 넘는 순간
        시스템이 다른 상태로 통째로 넘어가고, 그 뒤로는 원인을 되돌려도 결과가 돌아오지 않습니다.
      </>
    ),
    chip: '임계점 — 선을 넘으면 원인을 되돌려도 결과가 안 돌아온다',
  },
  {
    label: '이 개념이 쓰이는 곳',
    body: (
      <>
        빙상 붕괴·해양 순환·아마존 열대우림처럼 되돌릴 수 없는 지점을 미리 계산해 두는 일 —{' '}
        <span className="text-act-3">1.5℃·2℃</span> 같은 목표선이 그래서 존재합니다.
      </>
    ),
  },
]

export function S7Threshold({ onNext }: { onNext: () => void }) {
  const { setOrbitResult } = useJourney()
  const { orbit, magneticField, setOrbit, setMagneticField, alerts } = useWorld()
  const { setMagnetosphere, setMagneticField: setGlobeField, setSurface } = useGlobe()

  const [crisis] = useState(() => CRISES[Math.floor(Math.random() * CRISES.length)])
  const [introDone, setIntroDone] = useState(false)
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState(TIME_LIMIT)
  const [hold, setHold] = useState(0)
  const [outcome, setOutcome] = useState<'success' | 'timeout' | null>(null)
  const [breaches, setBreaches] = useState(0)
  const holdStart = useRef<number | null>(null)
  /** 직전 프레임이 임계였는지 — 넘는 '순간'만 세기 위해 (첫 실행은 null) */
  const wasCritical = useRef<boolean | null>(null)

  const diagnoses = useMemo(() => diagnose({ ...orbit, magneticField }), [orbit, magneticField])
  const severity = overallSeverity(diagnoses)
  const safe = severity === 'stable'

  /** 임계를 넘을수록 길어지는 유지 시간 — 되돌리는 문이 좁아진다 */
  const holdNeed = HOLD_MS + breaches * BREACH_HOLD_EXTRA

  /*
   * 압박(drift).
   *
   * 값을 위기 쪽으로 계속 되돌린다. 안전 구간에 한 번 놓고 기다리는 것으로는 유지가
   * 안 되고, 구간 안쪽 깊숙이 밀어 두거나 유지하는 동안 계속 붙들어야 한다.
   *
   * 손이 닿아 있는 동안(마지막 조작 후 DRIFT_GRACE)에는 밀지 않는다 — 드래그하는
   * 중에 값이 손과 반대로 움직이면 슬라이더가 고장 난 것처럼 느껴진다.
   * 현재 값은 ref 로 읽는다. 상태를 의존성에 넣으면 타이머가 매 프레임 재생성된다.
   */
  const live = useRef({ magneticField, orbit })
  live.current = { magneticField, orbit }
  const lastTouch = useRef(0)
  const lastTick = useRef(0)

  useEffect(() => {
    if (!started || outcome) return
    const { key, perSec } = crisis.drift
    lastTick.current = performance.now()
    const id = window.setInterval(() => {
      /*
       * 지난 틱과의 실제 간격으로 적분한다.
       *
       * 틱마다 고정량을 더하면 압박의 세기가 그 기기의 프레임 사정에 좌우된다 —
       * 3D 지구를 돌리느라 타이머가 밀리는 기기에서는 압박이 절반으로 약해져 과제가
       * 저절로 쉬워졌다. 초당 몇 %p 인지가 규칙이므로 시간으로 곱해야 맞다.
       * 탭이 백그라운드로 갔던 구간은 0.5초까지만 인정한다(돌아오자마자 실패 방지).
       */
      const t = performance.now()
      const dt = Math.min(0.5, (t - lastTick.current) / 1000)
      lastTick.current = t
      if (t - lastTouch.current < DRIFT_GRACE) return
      const step = perSec * dt
      const now = live.current
      if (key === 'magneticField') {
        setMagneticField(clamp(now.magneticField + step, 0, 100))
      } else if (key === 'eccentricity') {
        setOrbit({ eccentricity: Number(clamp(now.orbit.eccentricity + step, 0.005, 0.06).toFixed(4)) })
      } else {
        setOrbit({ obliquity: Number(clamp(now.orbit.obliquity + step, 22.1, 24.5).toFixed(2)) })
      }
    }, DRIFT_TICK)
    return () => window.clearInterval(id)
  }, [started, outcome, crisis, setMagneticField, setOrbit])

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

  /*
   * 임계 재돌파 페널티.
   *
   * 이 화면의 논지가 "선을 넘으면 대가가 있다"인데, 정작 슬라이더는 몇 번이고 공짜로
   * 넘나들 수 있었다. 실험은 계속 자유롭게 두되(그게 학습이다) 넘는 순간마다 시간을
   * 잃게 한다 — 되돌리는 데는 비용이 든다는 것까지가 임계점의 내용이다.
   */
  useEffect(() => {
    const isCritical = severity === 'critical'
    const prev = wasCritical.current
    wasCritical.current = isCritical
    if (prev === null || !started || outcome) return
    if (isCritical && !prev) {
      setBreaches((n) => n + 1)
      setRemaining((r) => Math.max(0.1, Number((r - BREACH_PENALTY).toFixed(1))))
    }
  }, [severity, started, outcome])

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
      setRemaining((r) => Math.max(0, Number((r - 0.1).toFixed(1))))
    }, 100)
    return () => window.clearInterval(id)
  }, [started, outcome])

  /*
   * 시간 초과 판정.
   *
   * 원래는 위 업데이터 안에서 finish('timeout') 을 불렀는데, React 가 업데이터를 렌더
   * 단계에서 실행하므로 그 안의 상태 변경이 유실될 수 있다 — 실제로 타이머가 0.0 에
   * 멈춘 채 판정이 나지 않았다(제한 시간이 사실상 없었다는 뜻이다). 값을 보고 나서
   * 판정한다.
   */
  useEffect(() => {
    if (started && !outcome && remaining <= 0) finish('timeout', 0)
  }, [started, outcome, remaining, finish])

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
      const t = Math.min(1, (performance.now() - holdStart.current) / holdNeed)
      setHold(t)
      if (t >= 1) return finish('success', remaining)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [safe, started, outcome, remaining, finish, holdNeed])

  const touch = () => {
    lastTouch.current = performance.now()
    if (!started && !outcome) setStarted(true)
  }

  /* 창이 낮으면 칸을 스크롤하는 대신 판 전체를 줄인다 (→ [components/useFitZoom]).
     진단 개수는 상태에 따라 3~4개로 변하므로 그때마다 다시 잰다. */
  const { fitRef, fitStyle } = useFitZoom([introDone, diagnoses.length, !!outcome])

  // 훅은 모두 위에서 부른 뒤에 갈라진다 (조건부 훅 금지)
  if (!introDone) {
    return (
      <StageIntro
        eyebrow="3단계 · 임계"
        steps={INTRO}
        tone="var(--color-act-3)"
        onDone={() => setIntroDone(true)}
      />
    )
  }

  return (
    <div
      ref={fitRef}
      style={fitStyle}
      className="pointer-events-none relative flex min-h-[460px] w-full flex-col gap-2 lg:h-[var(--fit-h)]"
    >
      <div className="flex items-end justify-between">
        <div className="pointer-events-auto">
          <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">3단계 · 임계</div>
          <h1 className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            지구를 지켜라 · {crisis.title}
          </h1>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-0.5">
          <Timer remaining={remaining} started={started} outcome={outcome} />
          {breaches > 0 && (
            <span className="text-[10.5px] font-medium" style={{ color: 'var(--color-bad)' }}>
              임계 돌파 {breaches}회 · −{breaches * BREACH_PENALTY}초
            </span>
          )}
        </div>
      </div>

      <StageIntroBar
        chip={INTRO[1].chip!}
        tone="var(--color-act-3)"
        overGlobe
        onReplay={() => setIntroDone(false)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[332px_minmax(0,1fr)_356px] lg:overflow-visible">
        {/* 조종석 */}
        {/* 설명을 물음표 뒤로 접은 뒤로는 조종석이 짧다 — 늘려 세워 두면 아래쪽이
            텅 빈 판으로 남으므로 내용 높이만 차지하게 한다. */}
        <section
          data-fit-col
          className="panel pointer-events-auto flex max-h-full flex-col gap-3 self-start overflow-y-auto p-4 backdrop-blur-md"
        >
          <p className="text-[12px] leading-relaxed text-ink-2">{crisis.brief}</p>
          {/* 무엇이 계속 밀고 있는지 — 이걸 모르면 값이 저절로 움직이는 게 고장으로 읽힌다 */}
          <p
            className="rounded-lg px-2.5 py-1.5 text-[11px] leading-snug"
            style={{
              background: 'color-mix(in oklab, var(--color-warn) 12%, transparent)',
              color: 'var(--color-ink-2)',
            }}
          >
            <span className="font-semibold" style={{ color: 'var(--color-warn)' }}>
              압박 중
            </span>{' '}
            {crisis.drift.mechanism}
            <span className="text-ink-3"> (실제로는 수천~수만 년에 걸친 변화를 게임 속도로 압축했습니다.)</span>
          </p>

          <Dial
            label="지자기 세기"
            pressure={crisis.drift.key === 'magneticField' ? crisis.drift : undefined}
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
            pressure={crisis.drift.key === 'eccentricity' ? crisis.drift : undefined}
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
            pressure={crisis.drift.key === 'obliquity' ? crisis.drift : undefined}
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
              <span className="tnum text-ink-3">
                {safe
                  ? `안정 유지 ${((hold * holdNeed) / 1000).toFixed(1)} / ${(holdNeed / 1000).toFixed(1)}초`
                  : '아직 위험 구간'}
              </span>
            </div>
          )}
        </section>

        {/* 우주 — 자기권은 캔버스가 그린다 */}
        <div className="relative" />

        {/* 예측 엔진 보고서 */}
        <div data-fit-col className="pointer-events-auto flex min-h-0 flex-col gap-2 overflow-y-auto">
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
              <div key={d.id} className="panel-quiet px-3 py-1.5">
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
                <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{d.impact}</p>
              </div>
            ))}
            <p className="text-[10px] leading-snug text-ink-3">
              규칙 기반 교육용 진단 — 지구시스템 모델의 계산 결과가 아닙니다.
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
            <p className="text-[11px] leading-snug text-ink-2">
              조금씩 움직이는 동안에는 아무 일도 없다가 어느 선을 넘는 순간 화면 전체가 바뀌죠. 그게{' '}
              <span className="text-ink-1">임계점</span>입니다 — 넘기 전까지는 조용합니다. 그리고 실제 임계점은 이
              시뮬레이터와 달리 <span className="text-ink-1">한 방향으로만 열립니다</span>: 빙상이 무너진 뒤 기온을
              되돌려도 빙상은 돌아오지 않아요.
            </p>
            <p className="border-t border-white/8 pt-1.5 text-[11px] leading-snug text-ink-3">
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
              ? `다이얼을 움직이면 ${TIME_LIMIT}초가 시작됩니다. 세 진단이 모두 초록이 되도록 되돌리고 ${HOLD_MS / 1000}초간 유지하세요. ${crisis.drift.dial}은(는) 계속 밀리니 안쪽 깊숙이 두세요 — 임계를 넘으면 ${BREACH_PENALTY}초를 잃고 유지 시간이 ${BREACH_HOLD_EXTRA / 1000}초 늘어납니다.`
              : safe
                ? `안정 구간입니다. ${(holdNeed / 1000).toFixed(1)}초를 버티면 복구 성공 — ${crisis.drift.dial}이(가) 밀리고 있으니 눈을 떼지 마세요.`
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
  pressure,
  onChange,
  disabled,
}: {
  label: string
  note: string
  /** 이 값이 대체 무엇인지 — 조작만으로는 알 수 없는 것 */
  concept: string
  /** 이 다이얼이 위기 쪽으로 계속 밀리고 있다면 그 힘 */
  pressure?: { perSec: number; mechanism: string }
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
  const [openConcept, setOpenConcept] = useState(false)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-medium">{label}</span>
          {/* 설명 세 단락을 늘 펼쳐 두면 조종석이 화면을 넘긴다. 이 값이 대체
              무엇이냐는 물음은 한 번만 생기므로, 물을 때만 답한다. */}
          <button
            type="button"
            onClick={() => setOpenConcept((v) => !v)}
            aria-expanded={openConcept}
            aria-label={`${label}이 무엇인지 보기`}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9.5px] leading-none transition-colors"
            style={{
              borderColor: openConcept ? 'var(--color-act-3)' : 'rgb(255 255 255 / 0.2)',
              color: openConcept ? 'var(--color-act-3)' : 'var(--color-ink-3)',
            }}
          >
            ?
          </button>
        </span>
        <span className="flex items-center gap-1.5">
          {pressure && (
            <span
              className="rounded-full px-1.5 py-px text-[9.5px] font-semibold whitespace-nowrap"
              style={{
                background: 'color-mix(in oklab, var(--color-warn) 20%, transparent)',
                color: 'var(--color-warn)',
              }}
            >
              계속 밀림 {pressure.perSec < 0 ? '↓' : '↑'}
            </span>
          )}
          <span className="tnum text-[13px] font-semibold" style={{ color: danger ? 'var(--color-bad)' : undefined }}>
            {format(value)}
          </span>
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
      {openConcept && <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{concept}</p>}
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
