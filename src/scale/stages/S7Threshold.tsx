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
import { ScenarioFocus } from '../components/ScenarioReadout'
import { CLOSEUP_SECONDS, CollapseLayer, useCollapse } from '../components/CollapseSequence'
import { atmosphereLossOf, collapseFor } from '../lib/collapse'
import { PRESENT } from '../lib/milankovitch'
import { useFitZoom } from '../components/useFitZoom'
import { StageIntro, StageIntroBar, type IntroStep } from '../components/StageIntro'
import { THRESHOLDS } from '../lib/earthState'
import { clamp } from '../lib/scales'
import { surfaceFromThresholds } from '../lib/surfaceState'
import { activeScenarios, diagnose, overallSeverity, SEVERITY_COLOR } from '../lib/thresholdEngine'
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
    /*
     * 3단계는 두 파트다. 앞 파트(→ S5Orbital)와 무엇이 다른지 먼저 말하지 않으면,
     * 사용자는 "또 슬라이더네" 하고 차이를 모른 채 만지게 된다.
     */
    label: '앞 파트와 무엇이 다른가',
    body: (
      <>
        방금은 손잡이를 돌려 <span className="text-ink-1">무슨 일이 일어나는지</span> 봤습니다. 이번엔 반대예요 —
        이미 <span className="text-act-3">위험 쪽으로 넘어가 있는</span> 지구를 받아서, 제한 시간 안에 되돌립니다.
      </>
    ),
  },
  {
    label: '지금 할 일 · 3단계 ②',
    body: (
      <>
        세 다이얼을 <span className="text-act-3">안전 구간</span>으로 되돌리세요. 다만 위험 쪽으로 더 넘겨보는 것도
        실험입니다 — <span className="text-ink-1">넘어가 보는 것이 이 화면의 핵심</span>이니까요.
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
  const { setMagnetosphere, setMagneticField: setGlobeField, setSurface, pulseAlert, setAtmosphereStripped, cinematicCloseup } = useGlobe()

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


  /*
   * 돌아올 수 없는 지점.
   *
   * 선을 넘으면 6초를 센다. 그 안에 다이얼을 물리면 없던 일이 되고, 넘기면 지구가
   * 실제로 그 상태로 넘어간다 — 지표는 죽고 대기는 벗겨진다. 무엇이 일어나고
   * 무엇이 일어나지 않는지는 [lib/collapse] 가 정한다 (지구는 폭발하지 않는다).
   */
  const collapse = useMemo(
    () => collapseFor({ magneticField, eccentricity: orbit.eccentricity }),
    [magneticField, orbit.eccentricity],
  )
  const { warning, remaining: graceLeft, done, reset: resetCollapse } = useCollapse(collapse)

  useEffect(() => {
    if (!done) {
      setAtmosphereStripped(0)
      return
    }
    // 결말 — 지표를 죽이고 대기를 벗긴다. 값이 아니라 상태다.
    setSurface(done.surface)
    setAtmosphereStripped(atmosphereLossOf(done.kind))
    pulseAlert(done.kind === 'mars' ? 0xff5a3c : 0xffb454)
    // 글보다 행성을 먼저 — 카메라가 지구 앞까지 밀고 들어간다
    cinematicCloseup(CLOSEUP_SECONDS - 0.4)
  }, [done, setSurface, setAtmosphereStripped, pulseAlert, cinematicCloseup])

  /** 규칙 엔진 매칭 — 화면(ScenarioFocus)과 충격파가 같은 목록을 본다 */
  const scenarios = useMemo(() => activeScenarios({ ...orbit, magneticField }), [orbit, magneticField])

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
        /*
         * 압박은 1% 까지만 민다 — 0 은 "돌아올 수 없는 지점"이라(→ lib/collapse),
         * 거기까지 밀어버리면 사용자가 아무것도 안 했는데 지구가 끝난다. 이 위기의
         * 압박은 초당 −12%p 라 시작값 9% 에서 1초도 안 걸렸다.
         *
         * ⚠️ 그렇다고 하한을 상수 1 로 두면 안 된다. 사용자가 직접 0 으로 내린 순간
         * 다음 틱이 그 값을 1 로 **끌어올린다** — 압박이 반대 방향으로 미는 셈이고,
         * 실제로 "0 으로 내려도 자꾸 1 로 올라간다"가 됐다.
         * 하한은 현재값과 1 중 작은 쪽이다. 압박은 자기 방향으로만 민다.
         */
        const floor = Math.min(now.magneticField, 1)
        setMagneticField(clamp(now.magneticField + step, floor, 100))
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
    // 결말에 들어간 뒤에는 손대지 않는다 — 여기서 다시 쓰면 죽은 지구가 되살아난다
    if (done) return
    setSurface(surfaceFromThresholds(orbit.eccentricity, magneticField, orbit.obliquity))
  }, [orbit.eccentricity, magneticField, orbit.obliquity, setSurface, done])

  /*
   * 새 시나리오가 걸리는 **그 프레임**에 지구본을 한 번 터뜨린다.
   *
   * 지표(빙상·건조·바다 후퇴)는 값을 따라 서서히 변하기 때문에, 정작 선을 넘는
   * 순간이 화면에서 사라진다. 임계점은 과정이 아니라 사건이라 그 순간이 보여야 한다.
   * 이미 걸려 있던 시나리오는 다시 터뜨리지 않는다 — 값을 흔드는 동안 계속 번쩍이면
   * 그건 경고가 아니라 노이즈다.
   */
  const seenScenarios = useRef<Set<string>>(new Set())
  useEffect(() => {
    const fresh = scenarios.filter((s) => !seenScenarios.current.has(s.id))
    if (fresh.length > 0) {
      // 여럿이 한꺼번에 걸리면 가장 심각한 색으로 한 번만
      pulseAlert(fresh.some((f) => f.severity === 'critical') ? 0xff2d2d : 0xffb454)
    }
    seenScenarios.current = new Set(scenarios.map((s) => s.id))
  }, [scenarios, pulseAlert])

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
        eyebrow="3단계 ② · 임계 · 넘으면 못 돌아오는 선"
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
          <div className="hud-title" style={{ color: 'var(--color-act-3)' }}>
            3단계 ② · 임계
          </div>
          <h1 className="mt-1 text-[19px] leading-tight font-semibold tracking-[0.01em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            지구를 지켜라 · {crisis.title}
          </h1>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1">
          <Timer remaining={remaining} started={started} outcome={outcome} />
          {breaches > 0 && (
            <span className="hud-badge" style={{ color: 'var(--color-bad)', borderColor: 'color-mix(in oklab, var(--color-bad) 40%, transparent)', background: 'color-mix(in oklab, var(--color-bad) 10%, transparent)' }}>
              임계 돌파 {breaches}회 · −{breaches * BREACH_PENALTY}s
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
          className="hud-panel pointer-events-auto flex max-h-full flex-col gap-3 self-start overflow-y-auto p-3.5"
        >
          <div className="hud-title">궤도 · 자기장 제어</div>
          <p className="text-[12px] leading-relaxed text-ink-2">{crisis.brief}</p>
          {/* 무엇이 계속 밀고 있는지 — 이걸 모르면 값이 저절로 움직이는 게 고장으로 읽힌다 */}
          <p
            className="rounded-md border px-2.5 py-2 text-[11px] leading-snug"
            style={{
              background: 'color-mix(in oklab, var(--color-warn) 8%, transparent)',
              borderColor: 'color-mix(in oklab, var(--color-warn) 32%, transparent)',
              color: 'var(--color-ink-2)',
            }}
          >
            <span
              className="hud-badge mr-1.5 align-[1px]"
              style={{
                color: 'var(--color-warn)',
                borderColor: 'color-mix(in oklab, var(--color-warn) 38%, transparent)',
                background: 'color-mix(in oklab, var(--color-warn) 10%, transparent)',
              }}
            >
              압박 중
            </span>
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
          {/* 짧은 결론이 맨 위 — 아래 '지구 시스템 진단'이 같은 내용을 길게 푼다 */}
          <ScenarioFocus scenarios={scenarios} />

          <div className="hud-panel flex flex-col gap-2.5 p-3.5">
            <div className="flex items-center justify-between">
              <h3 className="hud-title">지구 시스템 진단</h3>
              <span
                className="hud-badge"
                style={{
                  color: SEVERITY_COLOR[severity],
                  borderColor: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 42%, transparent)`,
                  background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 12%, transparent)`,
                }}
              >
                {severity === 'stable' ? '안정' : severity === 'warning' ? '주의' : '위험'}
              </span>
            </div>
            {/* 한 줄짜리 상태등 세 개. 판을 나누지 않고 왼쪽 색띠로만 구분해
                진단 셋이 '하나의 계기'로 읽히게 한다. */}
            <div className="hud-tiles" style={{ gridTemplateColumns: '1fr' }}>
              {diagnoses.map((d) => (
                <div
                  key={d.id}
                  className="hud-tile border-l-2"
                  style={{ borderLeftColor: SEVERITY_COLOR[d.severity] }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: SEVERITY_COLOR[d.severity],
                        boxShadow: `0 0 8px ${SEVERITY_COLOR[d.severity]}`,
                      }}
                    />
                    <span className="text-[11.5px] font-medium text-ink-1">{d.subject}</span>
                    <span
                      className="hud-title ml-auto"
                      style={{ color: SEVERITY_COLOR[d.severity] }}
                    >
                      {d.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-ink-2">{d.impact}</p>
                </div>
              ))}
            </div>
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
            className="hud-panel flex flex-col gap-2 p-3.5"
            style={{ borderColor: 'color-mix(in oklab, var(--color-act-3) 40%, transparent)' }}
          >
            <h3 className="hud-title" style={{ color: 'var(--color-act-3)' }}>
              임계점이란 무엇인가
            </h3>
            <p className="text-[11px] leading-snug text-ink-2">
              조금씩 움직이는 동안에는 아무 일도 없다가 어느 선을 넘는 순간 화면 전체가 바뀌죠. 그게{' '}
              <span className="text-ink-1">임계점</span>입니다 — 넘기 전까지는 조용합니다. 그리고 실제 임계점은 이
              시뮬레이터와 달리 <span className="text-ink-1">한 방향으로만 열립니다</span>: 빙상이 무너진 뒤 기온을
              되돌려도 빙상은 돌아오지 않아요.
            </p>
            <p className="hud-rule-above pt-2 text-[11px] leading-snug text-ink-3">
              방금 만진 세 다이얼은 <span className="text-ink-2">사람이 만질 수 없는 것</span>들입니다. 자기장도 궤도도
              우리 소관이 아니에요. 그런데 사람이 실제로 손에 쥔 다이얼이 딱 하나 있습니다 —{' '}
              <span className="text-ink-1">대기 중 이산화탄소</span>. 다음 화면이 그 하나를 놓고 벌어지는 이야기입니다.
            </p>
          </div>
        </div>
      </div>

      <CollapseLayer
        collapse={warning}
        remaining={graceLeft}
        done={done}
        onReset={() => {
          resetCollapse()
          /*
           * 위기 상태로 되감는다 — 안전한 값으로 돌려주면 "되돌리기 버튼이 있다"는
           * 이 화면의 아이러니가 공짜 정답이 되어 버린다. 넘기 직전으로만 돌린다.
           *
           * ⚠️ 세 값을 **모두** 되돌려야 한다. patch 에 있는 것만 쓰면, 궤도 위기에서
           * 자기장을 0 으로 만들어 붕괴시킨 경우 patch.magneticField 가 없어서 0 이
           * 그대로 남고, 되돌리자마자 다시 붕괴한다. 실제로 그렇게 갇혔다.
           */
          const patch = crisis.apply()
          setMagneticField(patch.magneticField ?? 100)
          setOrbit({
            eccentricity: patch.eccentricity ?? PRESENT.eccentricity,
            obliquity: patch.obliquity ?? PRESENT.obliquity,
          })
          setAtmosphereStripped(0)
        }}
      />

      {!outcome ? (
        <div className="hud-panel pointer-events-auto flex items-baseline justify-between gap-6 px-4 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            {!started
              ? `다이얼을 움직이면 ${TIME_LIMIT}초가 시작됩니다. 세 진단이 모두 초록이 되도록 되돌리고 ${HOLD_MS / 1000}초간 유지하세요. ${crisis.drift.dial}은(는) 계속 밀리니 안쪽 깊숙이 두세요 — 임계를 넘으면 ${BREACH_PENALTY}초를 잃고 유지 시간이 ${BREACH_HOLD_EXTRA / 1000}초 늘어납니다.`
              : safe
                ? `안정 구간입니다. ${(holdNeed / 1000).toFixed(1)}초를 버티면 복구 성공 — ${crisis.drift.dial}이(가) 밀리고 있으니 눈을 떼지 마세요.`
                : '아직 붉은 항목이 있습니다. 오른쪽 진단이 무엇이 문제인지 말해줍니다.'}
          </p>
          <span className="hud-title shrink-0">빠르게 복구할수록 시간 보너스</span>
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
  const tone = outcome === 'success' ? 'var(--color-good)' : urgent ? 'var(--color-bad)' : 'var(--color-act-3)'
  return (
    <div className="flex items-center gap-3">
      {/* 상태는 배지로 따로 세운다 — 숫자 옆에 붙이면 '대기 60.0' 이 한 값으로 읽힌다 */}
      {!started && !outcome && <span className="hud-badge">대기</span>}
      {/* 남은 시간이 이 화면의 유일한 히어로 수치다 — 다른 어떤 숫자보다 크게 둔다 */}
      <div className="flex flex-col items-end gap-1.5">
        <div className="h-[3px] w-44 overflow-hidden rounded-full bg-white/12">
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${pct}%`, background: tone, boxShadow: `0 0 10px ${tone}` }}
          />
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className="hud-num text-[26px] leading-none font-semibold"
            style={{ color: urgent ? 'var(--color-bad)' : 'var(--color-ink-1)' }}
          >
            {remaining.toFixed(1)}
          </span>
          <span className="text-[11px] font-medium text-ink-3">s</span>
        </div>
      </div>
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
  /*
   * 값이 위험하면 트랙 채움색도 함께 붉어진다. 숫자 하나만 빨개지는 것보다
   * 손이 잡고 있는 물건 자체가 변하는 쪽이 먼저 눈에 들어온다.
   */
  const accent = danger ? 'var(--color-bad)' : 'var(--color-act-3)'
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
              borderColor: openConcept ? 'var(--color-act-3)' : 'rgb(255 255 255 / 0.22)',
              color: openConcept ? 'var(--color-act-3)' : 'var(--color-ink-3)',
            }}
          >
            ?
          </button>
        </span>
        <span className="flex items-center gap-1.5">
          {pressure && (
            <span
              className="hud-badge"
              style={{
                color: 'var(--color-warn)',
                borderColor: 'color-mix(in oklab, var(--color-warn) 38%, transparent)',
                background: 'color-mix(in oklab, var(--color-warn) 10%, transparent)',
              }}
            >
              밀림 {pressure.perSec < 0 ? '↓' : '↑'}
            </span>
          )}
          <span
            className="hud-num text-[17px] font-semibold"
            style={{ color: danger ? 'var(--color-bad)' : undefined }}
          >
            {format(value)}
          </span>
        </span>
      </div>
      <div className="text-[10.5px] leading-snug text-ink-3">{note}</div>
      <div className="relative mt-1.5">
        {/*
          안전 구간 띠는 트랙 '아래'에 긋는다. 트랙 위에 깔면 채움색이 그 위를 덮어
          — 값이 안전 구간보다 오른쪽에 있을 때 초록이 통째로 사라진다. 실제로 그랬다.
          트랙은 22px 높이 input 안에서 top 9~13px 이고 썸이 4~18px 을 차지하므로,
          19px 부터가 무엇에도 가리지 않는 유일한 띠 자리다.
        */}
        <div
          className="pointer-events-none absolute top-[19px] h-[2px] rounded-full"
          style={{
            left: `${pct(safeFrom)}%`,
            width: `${pct(safeTo) - pct(safeFrom)}%`,
            background: 'var(--color-good)',
          }}
        />
        <input
          className="slider-hud relative"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          style={
            {
              '--hud-fill': `${pct(value)}%`,
              '--hud-accent': accent,
            } as React.CSSProperties
          }
        />
      </div>
      <div className="hud-scale mt-1.5">
        <span>{format(min)}</span>
        <span style={{ color: 'color-mix(in oklab, var(--color-good) 80%, white 20%)' }}>
          안전 {format(safeFrom)}–{format(safeTo)}
        </span>
        <span>{format(max)}</span>
      </div>
      {openConcept && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{concept}</p>}
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
    <div
      className="hud-panel rise pointer-events-auto flex items-start justify-between gap-6 px-5 py-3.5"
      style={{
        borderColor: `color-mix(in oklab, ${success ? 'var(--color-good)' : 'var(--color-warn)'} 40%, transparent)`,
      }}
    >
      <div>
        <div className="flex items-baseline gap-2">
          <span
            className="hud-badge"
            style={{
              color: success ? 'var(--color-good)' : 'var(--color-warn)',
              borderColor: `color-mix(in oklab, ${success ? 'var(--color-good)' : 'var(--color-warn)'} 45%, transparent)`,
              background: `color-mix(in oklab, ${success ? 'var(--color-good)' : 'var(--color-warn)'} 12%, transparent)`,
            }}
          >
            {success ? '복구 성공' : '시간 종료'}
          </span>
          <span className="text-[14px] font-semibold text-ink-1">
            {success ? (
              <>
                <span className="hud-num">{remaining.toFixed(1)}</span>
                <span className="text-[11px] text-ink-3">s</span> 남김
              </>
            ) : (
              '실패도 발견입니다'
            )}
          </span>
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
