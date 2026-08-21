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
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChartFrame } from '../components/ChartFrame'
import { CoolingParadox } from '../components/CoolingParadox'
import { GlobeViewToggle } from '../components/GlobeViewToggle'
import { ScenarioFocus } from '../components/ScenarioReadout'
import { CLOSEUP_SECONDS, CollapseLayer, useCollapse } from '../components/CollapseSequence'
import { atmosphereLossOf, collapseFor } from '../lib/collapse'
import { useGlobe } from '../components/GlobeLayer'
import { StageIntro, StageIntroBar, type IntroStep } from '../components/StageIntro'
import { useFitZoom } from '../components/useFitZoom'
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
  type Mission,
  type MissionId,
} from '../lib/milankovitch'
import { linearScale, niceTicks, smoothPath } from '../lib/scales'
import { surfaceFromAnomaly } from '../lib/surfaceState'
import { activeScenarios } from '../lib/thresholdEngine'
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
  obliquity: { min: 0, max: 90, step: 0.05, real: [22.1, 24.5] as const },
  eccentricity: { min: 0, max: 0.9, step: 0.001, real: [0.005, 0.06] as const },
} as const

const inReal = (v: number, r: readonly [number, number]) => v >= r[0] && v <= r[1]

/**
 * 트랙에서 초록 띠(실제로 오간 범위)가 차지하는 몫.
 *
 * 왜 필요한가. 자전축의 실제 범위는 22.1–24.5° 로 2.4° 인데 다이얼은 0–90° 다.
 * 선형으로 깔면 **띠가 트랙의 2.7%** — 300px 짜리 슬라이더에서 8px 다. 과제는 그 띠
 * 안에 들어가야 인정되므로, 사실상 조준이 불가능했다("민감도가 너무 높다").
 *
 * 그렇다고 최대값을 줄이면 이 화면의 나머지 절반인 "지구가 아닌 값을 만들어보는
 * 실험"이 사라진다. 그래서 범위를 줄이는 대신 **자를 비선형으로 접는다**:
 * 가운데 절반을 초록 띠에 주고, 바깥 실험 구간을 양쪽 25%씩에 압축한다.
 * 0–90° 는 그대로 닿으면서, 띠 안에서는 손가락 하나가 0.01° 를 고른다.
 */
const REAL_SHARE = 0.5
const LOW_SHARE = (1 - REAL_SHARE) / 2

/** 트랙 위치 t(0~1) → 실제 값 */
function posToValue(t: number, min: number, max: number, real: readonly [number, number]): number {
  if (t <= LOW_SHARE) return min + (t / LOW_SHARE) * (real[0] - min)
  if (t >= 1 - LOW_SHARE) return real[1] + ((t - (1 - LOW_SHARE)) / LOW_SHARE) * (max - real[1])
  return real[0] + ((t - LOW_SHARE) / REAL_SHARE) * (real[1] - real[0])
}

/** 실제 값 → 트랙 위치 t(0~1). posToValue 의 역함수 — 눈금·표식도 이걸로 놓는다. */
function valueToPos(v: number, min: number, max: number, real: readonly [number, number]): number {
  if (v <= real[0]) return real[0] === min ? 0 : ((v - min) / (real[0] - min)) * LOW_SHARE
  if (v >= real[1]) return max === real[1] ? 1 : 1 - LOW_SHARE + ((v - real[1]) / (max - real[1])) * LOW_SHARE
  return LOW_SHARE + ((v - real[0]) / (real[1] - real[0])) * REAL_SHARE
}

/**
 * 본 화면에 앞서 한 마디씩 거치는 도입 (→ [components/StageIntro]).
 *
 * 원래는 같은 내용을 헤더 아래 3열 띠로 한꺼번에 깔았는데, 가로로 너무 길어 한 줄이
 * 화면 폭만큼 늘어나 읽히지 않았다. 한 번에 한 마디만 띄우고, 지난 뒤에는 한 줄로
 * 접어 둔다.
 */
const introFor = (mission: Mission): IntroStep[] => [
  {
    /*
     * 바로 앞 화면(→ components/WeatherVsClimate)이 기상과 기후의 차이를 표로 정리했다.
     * 여기서 그 표를 되풀이하면 같은 말을 두 번 읽히는 셈이다. 대신 그 정리의
     * **결론 한 줄만** 받아서 3단계로 넘어가는 발판으로 쓴다.
     */
    label: '여기까지',
    body: (
      <>
        2100년의 기후가 어디로 갈지는 결국{' '}
        <span className="text-ink-1">사람이 탄소를 얼마나 내놓느냐</span>에 달려 있었습니다. 사람이 쥔 다이얼의
        이야기였죠.
      </>
    ),
  },
  {
    label: '그런데 · 사람 말고 다른 손',
    body: (
      <>
        사람이 등장하기 <span className="text-ink-1">훨씬 전부터</span> 기후를 움직여온 것이 따로 있습니다. 탄소보다
        느리지만 훨씬 거대한 손이에요 — 바로 <span className="text-act-3">지구 자신의 궤도와 자전축</span>입니다.
      </>
    ),
  },
  {
    label: '여기서 배우는 개념',
    body: (
      <>
        <span className="text-act-3">밀란코비치 주기</span> — 궤도의 모양과 자전축이 수만 년에 걸쳐 흔들리면 고위도
        여름에 닿는 햇빛의 양이 달라지고, 그것이 <span className="text-ink-1">빙하기를 켜고 끕니다.</span> 지구가
        스스로 돌려온 손잡이예요.
      </>
    ),
    chip: '밀란코비치 주기 — 궤도가 흔들려 고위도 여름의 햇빛을 바꾼다',
  },
  {
    /* 3단계는 두 파트다. 무엇을 왜 만지는지 한 줄로 못박지 않으면 사용자는 차이를
       모른 채 슬라이더만 흔들게 된다 (다음 파트는 → S7Threshold). */
    label: '지금 할 일 · 3단계 ①',
    body: (
      <>
        그 손잡이를 <span className="text-act-3">직접 돌려봅니다.</span> 왼쪽 다이얼 두 개로 궤도를 바꾸고, 위의
        일사량 숫자가 어디로 가는지 보세요.
        <span className="mt-3.5 block text-[13.5px] leading-relaxed text-ink-3">
          <span className="font-semibold text-ink-1">과제 · {mission.title}</span>
          <br />
          {mission.goal}
        </span>
      </>
    ),
  },
]

/**
 * 제한 시간.
 *
 * 기획안 §3 은 이 단계를 "점수도 제한 시간도 없는 탐색"으로 두라고 했고 그대로 만들었는데,
 * 과제(빙하기를 만들어라)를 얹은 뒤로는 앞뒤가 맞지 않게 됐다 — 옆 단계(S7)에는 타이머가
 * 도는데 여기는 목표만 있고 끝이 없어서, 다이얼을 흔들다 흐지부지 넘어갈 수 있었다.
 *
 * 그래서 같은 60초를 준다. 대신 두 가지가 S7 과 다르다.
 *   ① 점수가 없다 — 시간을 넘겨도 잃을 게 없고, 그 자리에서 다시 도전할 수 있다.
 *   ② 시간이 끝나도 다이얼은 잠기지 않는다. 이 화면의 나머지 절반은 "지구가 아닌 값"을
 *      만들어보는 실험이고, 그건 시간과 상관없이 계속 열려 있어야 한다.
 * 타이머는 첫 조작에서 시작한다 — 화면을 읽는 동안 시간이 흐르면 읽지 않게 된다.
 */
const TIME_LIMIT = 60

const W = 344
const H = 196
const M = { top: 18, right: 16, bottom: 30, left: 40 }

export function S5Orbital({ onNext }: { onNext: () => void }) {
  const { orbit, magneticField, setOrbit, resetWorld } = useWorld()
  /*
   * S7 과 같은 판을 여기에도 세운다.
   * 이 화면에서도 이심률을 0.05 너머로 밀면 시나리오가 걸리는데, 정작 화면에는
   * 아무 말이 없어 다음 단계에 가서야 그런 게 있는 줄 알게 됐다. 규칙 엔진이
   * 도는 화면이면 그 결과가 그 화면에 있어야 한다.
   * 자기장 다이얼은 여기 없으므로 현재값(기본 100%)이 그대로 들어간다.
   */
  const scenarios = useMemo(() => activeScenarios({ ...orbit, magneticField }), [orbit, magneticField])

  /*
   * 돌아올 수 없는 지점 — 여기서는 이심률 쪽으로만 닿는다.
   *
   * 이 화면에 자기장 다이얼은 없고(항상 100%), 대신 이심률을 0.9 까지 밀 수 있다.
   * 0.5 를 넘으면 연평균 일사량이 폭주 온실 문턱을 넘어 바다를 잃는다 — 실험 구간
   * 안에서 실제로 되돌릴 수 없는 선이 하나 있는 셈이다 (→ lib/collapse).
   */
  const collapse = useMemo(
    () => collapseFor({ magneticField, eccentricity: orbit.eccentricity }),
    [magneticField, orbit.eccentricity],
  )
  const { warning, remaining: graceLeft, done, reset: resetCollapse } = useCollapse(collapse)

  const { setSurface, setSurfaceAuto, setOrbitPark, telemetry, pulseAlert, setAtmosphereStripped, cinematicCloseup } = useGlobe()

  // 결말 — 지표를 죽이고 대기를 벗긴다. 값이 아니라 상태다.
  useEffect(() => {
    if (!done) {
      setAtmosphereStripped(0)
      return
    }
    /*
     * surfaceAuto 를 먼저 꺼야 한다.
     *
     * 실험 구간에서는 엔진이 자기 에너지 균형으로 지표를 직접 그린다(surfaceAuto).
     * 그 상태로 setSurface 만 부르면 다음 프레임에 엔진이 도로 덮어써서, 판은
     * "바다가 사라졌다"고 적혀 있는데 화면의 지구는 멀쩡한 파란 행성으로 남는다.
     * 실제로 그랬다.
     */
    setSurfaceAuto(false)
    setSurface(done.surface)
    setAtmosphereStripped(atmosphereLossOf(done.kind))
    pulseAlert(done.kind === 'mars' ? 0xff5a3c : 0xffb454)
    // 글보다 행성을 먼저 — 카메라가 지구 앞까지 밀고 들어간다
    cinematicCloseup(CLOSEUP_SECONDS - 0.4)
  }, [done, setSurface, setSurfaceAuto, setAtmosphereStripped, pulseAlert, cinematicCloseup])
  const [introDone, setIntroDone] = useState(false)
  /** 냉각 역설을 증명하는 화면을 지났는가 */
  const [paradoxDone, setParadoxDone] = useState(false)
  const [parked, setParked] = useState(false)
  const [missionId] = useState<MissionId>(() => (Math.random() < 0.5 ? 'glaciate' : 'deglaciate'))
  const mission = MISSIONS[missionId]
  const intro = useMemo(() => introFor(mission), [mission])
  const summerNow = summerInsolation(orbit)
  /** 일사량 조건만 본 것 — 성공 판정에는 '실제로 오간 범위 안'까지 필요하다 */
  const onTarget = isMissionMet(mission, summerNow)

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
   * 과제 성공에는 두 조건이 모두 필요하다.
   *
   * 예전에는 일사량 하나만 봤는데, 그러면 자전축을 0°(지구가 겪은 적 없는 값)까지
   * 밀어버리는 것으로 한 번에 끝나 "너무 쉽다"는 지적을 받았다. 실험 구간은 여전히
   * 열려 있지만 — 그게 이 화면의 절반이다 — 과제로 인정되지는 않는다. 자연이 실제로
   * 한 일을 자연의 폭 안에서 재현해야 하고, 그러려면 다이얼 둘을 함께 써야 한다.
   */
  const met = onTarget && real

  /*
   * 달성 순간의 피드백.
   *
   * 예전에는 작은 '목표 달성' 배지 하나와 아래 띠의 한 문장뿐이어서, 빙하기를
   * 만들어 놓고도 아무 일이 없는 것처럼 다음 단계로 넘어갔다. 과제를 준 화면은
   * 과제가 끝났다고 말해야 한다. 그래서 처음 달성하는 순간 결과 카드를 띄운다 —
   * 무엇을 만들었는지(숫자), 그것이 지구에 무슨 일인지(문장), 실제로 언제 있었던
   * 일인지(연대)를 한자리에서.
   *
   * 닫은 뒤에는 배지를 눌러 다시 열 수 있다. 조건을 벗어났다 다시 들어올 때마다
   * 카드가 튀어나오면 다이얼을 미는 손을 방해하므로, 자동으로 뜨는 건 처음 한 번뿐이다.
   */
  const [showSuccess, setShowSuccess] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  /** 'cleared' 는 시간 안에 못 해도(늦게 달성) 붙는다 — 아래 clearedAt 이 그걸 구분한다 */
  const [outcome, setOutcome] = useState<null | 'cleared' | 'timeout'>(null)
  /** 달성 시점에 남아 있던 시간(초). 시간을 넘긴 뒤 달성했으면 0 */
  const [clearedAt, setClearedAt] = useState(0)
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState(TIME_LIMIT)

  /** 다이얼에 손이 닿는 순간 시간이 흐르기 시작한다 */
  const touch = () => {
    if (!started && !outcome) setStarted(true)
  }

  useEffect(() => {
    if (!started || outcome) return
    const id = window.setInterval(() => {
      setRemaining((r) => Math.max(0, Number((r - 0.1).toFixed(1))))
    }, 100)
    return () => window.clearInterval(id)
  }, [started, outcome])

  /*
   * 시간이 다 됐다는 판정은 여기서 한다.
   *
   * 처음에는 위 setRemaining 업데이터 안에서 바로 setOutcome 을 불렀는데, 타이머가
   * 0.0 에 멈춘 채 아무 일도 일어나지 않았다. React 는 업데이터 함수를 렌더 단계에서
   * 실행하고, 그 안에서 다른 상태를 바꾸는 호출은 유실될 수 있다. 값이 0 이 된 것을
   * 보고 나서 판정하는 것이 맞다.
   */
  useEffect(() => {
    if (started && !outcome && remaining <= 0) {
      setOutcome('timeout')
      setShowTimeout(true)
    }
  }, [started, outcome, remaining])

  useEffect(() => {
    if (!met || outcome === 'cleared') return
    setOutcome('cleared')
    setClearedAt(remaining)
    setShowSuccess(true)
    setShowTimeout(false)
  }, [met, outcome, remaining])

  /** 다시 도전 — 시간과 궤도를 처음으로 되돌린다 (점수가 없으니 몇 번이든 괜찮다) */
  const retry = () => {
    resetWorld()
    setRemaining(TIME_LIMIT)
    setStarted(false)
    setOutcome(null)
    setClearedAt(0)
    setShowSuccess(false)
    setShowTimeout(false)
  }

  /*
   * ⚠️ 아래 지표 갱신은 결말(done)에 들어가면 멈춰야 한다 — 안 그러면 죽은 지구를
   * 매 프레임 되살린다. 각 갱신 앞에 done 가드를 둔다.
   *
   * 지표를 무엇이 그릴지는 어느 구간이냐에 달려 있다.
   *
   *  실제 구간 — 궤도가 이 정도 움직여도 지금 당장 달라지는 건 없다. 의미가 있는
   *              건 수만 년 뒤의 도착점이므로, 장기 곡선의 끝값으로 그린다.
   *  실험 구간 — 근일점이 실제로 가까워지면 일사량이 제곱으로 는다. 그건 만 년을
   *              기다릴 일이 아니라 지금 당장의 평형이므로, 엔진의 에너지 균형
   *              모델이 직접 그리게 둔다.
   */
  useEffect(() => {
    // 결말에 들어간 뒤에는 손대지 않는다 — 여기서 다시 쓰면 죽은 지구가 되살아난다
    if (done) return
    setSurfaceAuto(!real)
    if (real) setSurface(surfaceFromAnomaly(endDelta))
  }, [real, endDelta, setSurface, setSurfaceAuto, done])
  const warmth = orbitalWarmth(orbit)

  /* 창이 낮으면 칸을 스크롤하는 대신 판 전체를 줄인다 (→ [components/useFitZoom]).
     실제/실험 구간 전환은 일부러 넣지 않는다 — 다이얼을 미는 도중에 배율이 바뀌면
     화면이 덜컥한다. 그래서 오른쪽 해설 판은 두 상태가 같은 높이를 쓰도록 고정했다. */
  const { fitRef, fitStyle } = useFitZoom([introDone, !!telemetry])

  // 훅은 모두 위에서 부른 뒤에 갈라진다 (조건부 훅 금지)
  if (!introDone) {
    return (
      <StageIntro
        eyebrow="3단계 ① · 수만 년 · 지구가 돌리는 손잡이"
        steps={intro}
        tone="var(--color-act-3)"
        onDone={() => setIntroDone(true)}
      />
    )
  }

  /*
   * 다이얼을 만지기 전에 "지금 지구는 원래 식어야 한다"를 먼저 증명한다.
   * 이 순서가 뒤집히면 반전이 성립하지 않는다 — 사용자가 이미 손으로 궤도를
   * 흔들어 본 뒤에는 "원래 방향"이라는 말이 자기가 만든 결과처럼 들린다.
   */
  if (!paradoxDone) {
    return <CoolingParadox onNext={() => setParadoxDone(true)} />
  }

  return (
    /* 컨테이너는 pointer-events-none — 패널이 없는 자리를 끌면 그대로 궤도가 돈다 */
    <div
      ref={fitRef}
      style={fitStyle}
      className="pointer-events-none relative flex min-h-[460px] w-full flex-col gap-2 lg:h-[var(--fit-h)]"
    >
      <CollapseLayer
        collapse={warning}
        remaining={graceLeft}
        done={done}
        onReset={() => {
          resetCollapse()
          // 실험 구간의 끝에서 돌아온다 — 현재 지구 값으로
          setOrbit({ eccentricity: PRESENT.eccentricity, obliquity: PRESENT.obliquity })
          setAtmosphereStripped(0)
        }}
      />

      <div className="pointer-events-auto flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div>
            <div className="text-[11px] font-medium tracking-[0.14em] text-act-3">3단계 · 수만 년</div>
            <h1 className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              지구의 기후는 원래 만 년 단위로 움직입니다
            </h1>
          </div>
          <StageIntroBar
            chip={intro[1].chip!}
            tone="var(--color-act-3)"
            overGlobe
            onReplay={() => setIntroDone(false)}
          />
        </div>
        {/*
          카운트다운을 화면에서 걷어냈다.
          이 단계는 자유 탐색인데 초가 줄어드는 숫자가 떠 있으면 시험처럼 읽혀서,
          다이얼을 눌러보는 대신 서두르게 된다. 시간은 안에서만 돌고, 60초가 지나면
          그때 한 번 "계속 볼지 / 넘어갈지"를 묻는다 (→ TimeoutCard).
          결과 카드를 닫은 뒤 다시 열 길만 조용히 남겨 둔다.
        */}
        {outcome && (
          <button
            type="button"
            className="pointer-events-auto rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-ink-3 transition-colors hover:border-white/25 hover:text-ink-1"
            onClick={() => (outcome === 'cleared' ? setShowSuccess(true) : setShowTimeout(true))}
          >
            {outcome === 'cleared' ? '달성 카드 다시 보기' : '안내 다시 보기'}
          </button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[332px_minmax(0,1fr)_344px] lg:overflow-visible">
        {/* 조종석 */}
        <section
          data-fit-col
          className="panel pointer-events-auto flex flex-col overflow-y-auto backdrop-blur-md"
        >
          {/*
            계기판을 sticky 로 못 박아 둔다.
            원래는 과제 → 슬라이더 → 일사량 순서였는데, 일사량이 슬라이더 아래에 있어서
            **다이얼을 미는 동안 정작 그 결과 숫자가 화면 밖**이었다. 스크롤을 내리면
            이번엔 슬라이더가 안 보이고. 실시간 반응이 이 화면의 전부인데 인과의 양끝을
            동시에 볼 수 없었던 셈이다. 이제 위쪽에 붙어 따라다닌다.
          */}
          <div
            className="sticky top-0 z-10 flex flex-col gap-1.5 border-b border-white/10 px-4 pt-3.5 pb-2.5"
            style={{ background: 'color-mix(in oklab, var(--color-space-1) 93%, white 4%)' }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[10.5px] tracking-[0.1em] text-act-3">
                  과제 · 점수 없음 · 시간 제한 없음
                </div>
                <h2 className="mt-0.5 text-[14.5px] font-semibold tracking-tight">{mission.title}</h2>
              </div>
              {met && (
                <button
                  type="button"
                  onClick={() => setShowSuccess(true)}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors"
                  style={{
                    background: 'color-mix(in oklab, var(--color-good) 22%, transparent)',
                    color: 'var(--color-good)',
                  }}
                >
                  목표 달성 · 결과 보기
                </button>
              )}
            </div>
            <InsolationGauge
              summer={summerNow}
              threshold={mission.threshold}
              met={met}
              onTarget={onTarget}
              real={real}
            />

            {/* 조건은 둘 다 보여야 한다 — 하나만 켜진 상태에서 왜 달성이 아닌지가
                화면에 없으면 고장으로 읽힌다. */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <Condition ok={onTarget}>
                일사량 {mission.threshold.toFixed(0)} {mission.direction === 'below' ? '이하' : '이상'}
              </Condition>
              <Condition ok={real}>실제로 오간 범위 안</Condition>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 pt-3 pb-3.5">
            <Slider
              label="자전축 기울기"
              note="연교차의 진폭을 정합니다"
              cycle="약 4.1만 년 주기"
              value={orbit.obliquity}
              {...RANGE.obliquity}
              present={PRESENT.obliquity}
              format={(v) => `${v.toFixed(1)}°`}
              helpful={contribution(mission, orbit, 'obliquity', 0.5)}
              onChange={(v) => {
                touch()
                setOrbit({ obliquity: v })
              }}
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
              onChange={(v) => {
                touch()
                setOrbit({ eccentricity: v })
              }}
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
                  <span className="text-[11px] text-ink-3">지금 · 표면 평형 온도</span>
                  {!real && (
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--color-bad)' }}>
                      실험 구간
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span
                    className="tnum text-[24px] leading-none font-semibold"
                    style={{ color: telemetry.Teq > 60 ? 'var(--color-bad)' : telemetry.Teq < -20 ? 'var(--color-act-1)' : undefined }}
                  >
                    {telemetry.Teq.toFixed(0)}
                  </span>
                  <span className="text-[11.5px] text-ink-3">℃</span>
                  <span className="tnum ml-auto text-[11px] text-ink-3">
                    {telemetry.au.toFixed(2)} AU · {Math.round(telemetry.S).toLocaleString()} W/m²
                  </span>
                </div>
                {/* 근일·원일점은 한 줄로 붙여 둔다 — 조종석이 한 화면에 들어와야
                    다이얼을 미는 손과 결과 숫자를 동시에 볼 수 있다. */}
                <div className="tnum mt-1.5 border-t border-white/8 pt-1.5 text-[11px] text-ink-3">
                  근일점 {telemetry.auPeri.toFixed(2)} AU 에서{' '}
                  <span style={{ color: telemetry.Tperi > 100 ? 'var(--color-bad)' : 'var(--color-ink-2)' }}>
                    {telemetry.Tperi.toFixed(0)}℃
                  </span>{' '}
                  · 원일점 {telemetry.auApo.toFixed(2)} AU
                </div>
              </div>
            )}
          </div>
        </section>

        {/*
          우주 — 캔버스는 앱 전체가 공유한다. 여기엔 지구를 직접 만지는 버튼만.

          원래 이 두 버튼과 개념 노트는 조종석 안에 세로로 쌓여 있었다. 그러면 조종석
          한 칸이 화면보다 길어져서, 다이얼을 미는 동안 결과를 보려면 스크롤을 오가야
          했다 — 이 화면에서 제일 하면 안 되는 일이다. 둘 다 '지금 보이는 지구'를
          만지는 버튼이라 시점 토글 옆이 오히려 제 자리고, 노트는 오른쪽으로 옮겼다.
        */}
        <div className="relative min-h-[220px]">
          <GlobeViewToggle />
          <div className="pointer-events-none absolute inset-x-0 bottom-9 flex flex-wrap justify-center gap-1.5">
            {/* 근일점은 스쳐 지나간다 — 케플러 2법칙이라 그게 맞다. 시간을 왜곡해
                느리게 만드는 대신 거기에 세워 두고 보게 한다. */}
            <button
              type="button"
              onClick={() => setParked((v) => !v)}
              aria-pressed={parked}
              className="pointer-events-auto rounded-full border px-3 py-1 text-[11px] backdrop-blur-sm transition-colors"
              style={{
                borderColor: parked ? 'var(--color-act-3)' : 'rgb(255 255 255 / 0.14)',
                background: parked ? 'rgb(144 133 233 / 0.22)' : 'rgb(0 0 0 / 0.42)',
                color: parked ? 'var(--color-ink-1)' : 'var(--color-ink-2)',
              }}
            >
              {parked ? '● 근일점에 세워둠 — 다시 돌리기' : '근일점에 세우기'}
            </button>
            <button
              type="button"
              onClick={resetWorld}
              className="pointer-events-auto rounded-full border px-3 py-1 text-[11px] text-ink-2 backdrop-blur-sm transition-colors hover:text-ink-1"
              style={{ borderColor: 'rgb(255 255 255 / 0.14)', background: 'rgb(0 0 0 / 0.42)' }}
            >
              현재 지구로 되돌리기
            </button>
          </div>
        </div>

        {/* 자연 곡선 */}
        <div data-fit-col className="pointer-events-auto flex min-h-0 flex-col gap-2 overflow-y-auto">
          {/* S7 과 같은 판, 같은 자리 — 오른쪽 칸 맨 위 */}
          <ScenarioFocus scenarios={scenarios} />

          <div className="panel shrink-0 p-3 backdrop-blur-md">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[12.5px] font-semibold">자연 변수만의 장기 기온</h3>
              <span className="text-[10px] text-ink-3">향후 5만 년</span>
            </div>
            <NaturalChart curve={curve} />
            <p className="mt-1 text-[10.5px] leading-snug text-ink-3">
              궤도 두 값만으로 그린 <span className="text-ink-2">교육용 단순화 모델</span>입니다 — 실제 밀란코비치 수치
              계산은 아닙니다.
            </p>
          </div>

          <div
            className="panel flex min-h-[9.25rem] shrink-0 flex-col gap-1.5 px-4 py-3 text-[11.5px] leading-relaxed backdrop-blur-md"
            style={{ borderColor: 'color-mix(in oklab, var(--color-act-3) 40%, transparent)' }}
          >
            <h3 className="text-[13px] font-semibold text-ink-1">
              {real ? '얼마나, 그리고 얼마 만에' : '여기서부터는 지구가 아닙니다'}
            </h3>
            {!real && telemetry && (
              <p className="text-ink-2">
                일사량은 거리의 제곱에 반비례합니다. 근일점{' '}
                <span className="tnum text-ink-1">{telemetry.auPeri.toFixed(2)} AU</span> 에서 표면 온도가{' '}
                <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                  {telemetry.Tperi.toFixed(0)}℃
                </span>{' '}
                — {telemetry.Tperi > 100 ? '바다가 끓고, ' : ''}
                {telemetry.Tperi > 260 ? '지각이 달아오릅니다.' : '지구가 견딜 값이 아닙니다.'}
                <br />
                <span className="text-ink-3">
                  계산은 진짜입니다(슈테판–볼츠만) — 지구 궤도가 이런 값이었던 적이 없을 뿐이에요.
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
            {real && (
            <p className="text-ink-3">
              {warmth > 0.75
                ? '고위도의 여름을 뜨겁게 만든 배치입니다 — 빙하가 물러나는 방향이에요.'
                : warmth < 0.3
                  ? '서늘한 배치입니다. 고위도의 눈이 여름을 버티기 시작하는 조건이에요.'
                  : '현재 지구와 비슷한 배치입니다.'}{' '}
              중요한 건 부호가 아니라 <span className="text-ink-2">도착 시간</span>입니다 — 저 폭은 전부{' '}
              <span className="text-ink-1">만 년 단위</span>에 걸쳐 옵니다.
            </p>
            )}
          </div>

          <ConceptNotes />
        </div>
      </div>

      {/*
        맺음 한 마디.
        원래는 세 문장을 한 문단에 이어 붙였는데, 이 띠가 화면 폭 전체라 한 줄이
        100자를 넘어가 눈이 되돌아올 곳을 잃었다. 이제 핵심 한 문장을 크게 놓고
        부연을 아래 작은 줄로 내리고, 폭은 읽기 좋은 길이에서 끊는다.
      */}
      {showSuccess && (
        <MissionCleared
          mission={mission}
          summer={summerNow}
          endDelta={endDelta}
          orbit={orbit}
          clearedAt={clearedAt}
          onClose={() => setShowSuccess(false)}
          onNext={onNext}
        />
      )}

      {showTimeout && (
        <MissionTimedOut
          mission={mission}
          summer={summerNow}
          real={real}
          onRetry={retry}
          onClose={() => setShowTimeout(false)}
          onNext={onNext}
        />
      )}

      <div className="panel pointer-events-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3.5 backdrop-blur-md">
        <div className="flex min-w-0 max-w-[58ch] flex-col gap-1">
          {met && (
            <span className="text-[11.5px] font-semibold" style={{ color: 'var(--color-good)' }}>
              {mission.success}
            </span>
          )}
          <p className="text-[14.5px] leading-snug font-medium text-ink-1">
            내일의 비는 못 맞혀도, 10만 년 뒤 여름의 햇빛 양은 계산할 수 있습니다.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-3">
            천체역학은 시계니까요. 그런데 지구는 지금, 이 시계가 만 년에 걸쳐 하는 일을{' '}
            <span className="text-ink-2">수백 년 만에</span> 겪고 있습니다.
          </p>
        </div>
        {/*
          다음 단계로 가는 문은 과제가 끝난 뒤에만 열린다.
          예전에는 여기 '이 시계를 직접 만져보기' 버튼이 항상 있어서, 다이얼을 한 번도
          안 밀고 자기장 단계로 건너뛸 수 있었다 — 과제를 준 화면이 과제를 건너뛰는
          문을 같이 열어 두면 과제가 없는 것과 같다. 달성이든 시간 초과든 결말이 난
          뒤에 열린다(발표용 딥링크 #s7 은 그대로 남아 있다).
        */}
        {outcome ? (
          <button type="button" className="btn btn-primary shrink-0" onClick={onNext}>
            {outcome === 'cleared' ? '이 시계를 직접 만져보기' : '다음 단계로'}
          </button>
        ) : (
          <span className="shrink-0 text-[11.5px] text-ink-3">
            천천히 돌려보세요 — 과제를 달성하면 다음 단계가 열립니다
          </span>
        )}
      </div>
    </div>
  )
}


/**
 * 시간 초과 카드.
 *
 * 점수가 없으므로 벌은 없다. 대신 두 가지를 준다 — 지금 얼마나 모자랐는지(숫자)와,
 * 두 다이얼을 어떻게 함께 써야 하는지(힌트). 실패가 막다른 길이 아니라 다음 시도의
 * 정보가 되어야 한다.
 */
function MissionTimedOut({
  mission,
  summer,
  real,
  onRetry,
  onClose,
  onNext,
}: {
  mission: Mission
  summer: number
  real: boolean
  onRetry: () => void
  onClose: () => void
  onNext: () => void
}) {
  const cold = mission.id === 'glaciate'
  /*
   * 부호를 지켜 계산한다.
   *
   * 예전에는 |현재 − 목표| 를 그대로 "모자란 양"으로 썼는데, 실험 구간에서 목표를
   * 훌쩍 넘긴 사람에게 "21 W/m² 모자랍니다"라고 말해버렸다 — 이미 넘긴 사람에게
   * 모자라다고 하면 과제가 불가능한 것처럼 읽힌다. 남은 것은 일사량이 아니라
   * 궤도였고, 화면은 그걸 말해야 한다.
   */
  const short = cold ? summer - mission.threshold : mission.threshold - summer
  const insolationOk = short <= 0

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        className="panel rise flex w-full max-w-md flex-col gap-3 px-6 py-5"
        style={{ borderColor: 'color-mix(in oklab, var(--color-bad) 45%, transparent)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{ background: 'color-mix(in oklab, var(--color-bad) 22%, transparent)', color: 'var(--color-bad)' }}
          >
            안내
          </span>
          <span className="text-[10.5px] text-ink-3">{mission.title} · 점수는 없습니다</span>
        </div>

        <h2 className="text-[19px] leading-tight font-semibold tracking-tight">잠깐 — 계속 보실래요?</h2>

        <p className="text-[12.5px] leading-relaxed text-ink-2">
          지금 북위 65° 여름 일사량은 <span className="tnum text-ink-1">{summer.toFixed(0)} W/m²</span> (목표{' '}
          {mission.threshold.toFixed(0)} {cold ? '이하' : '이상'}).{' '}
          {insolationOk ? (
            <>
              <span style={{ color: 'var(--color-good)' }}>일사량 조건은 이미 넘겼습니다.</span> 남은 것은{' '}
              <span className="text-ink-1">궤도를 초록 띠 안으로</span> 들이는 일이에요 — 지구가 겪은 적 없는 값으로
              만든 일사량은 과제로 인정되지 않습니다.
            </>
          ) : (
            <>
              <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                {short.toFixed(0)} W/m²
              </span>{' '}
              모자랍니다{real ? '.' : ' — 게다가 지금 궤도는 실제 범위 밖이라 인정되지 않아요.'}
            </>
          )}
        </p>

        <div className="panel-quiet px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-2">
          <div className="text-[10.5px] font-medium tracking-[0.08em]" style={{ color: 'var(--color-act-3)' }}>
            힌트 · 다이얼 하나로는 닿지 않습니다
          </div>
          <p className="mt-1">
            {cold ? (
              <>
                자전축을 <span className="text-ink-1">22.5° 부근까지 낮추고</span>, 동시에 이심률을{' '}
                <span className="text-ink-1">0.05 이상으로 올리세요</span>. 둘 다 초록 띠 안이어야 합니다 — 지금 지구는
                1월에 태양과 가깝기 때문에, 궤도를 찌그러뜨릴수록 7월(북반구 여름)이 서늘해집니다.
              </>
            ) : (
              <>
                자전축을 <span className="text-ink-1">최대(24.5°)까지 세우고</span>, 이심률은{' '}
                <span className="text-ink-1">0.01 아래로 낮추세요</span>. 둘 다 초록 띠 안이어야 합니다 — 궤도가 원에
                가까워지면 북반구 여름이 태양에서 덜 멀어집니다.
              </>
            )}
          </p>
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          시간에 쫓길 일은 아닙니다 — 궤도는 <span className="text-ink-2">만 년 단위</span>로 움직이니까요. 점수도
          걸려 있지 않습니다. 여기서 멈출지 더 볼지만 고르시면 됩니다.
        </p>

        <div className="mt-1 flex items-center gap-2">
          <button type="button" className="btn btn-primary flex-1 py-2.5 text-[13px]" onClick={onClose}>
            계속 조작하기
          </button>
          <button type="button" className="btn btn-ghost px-4 py-2.5 text-[12.5px]" onClick={onNext}>
            다음으로 넘어가기
          </button>
          <button type="button" className="btn btn-ghost px-4 py-2.5 text-[12.5px]" onClick={onRetry}>
            처음부터
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 과제 달성 카드 — "빙하기를 만들었다"가 실제로 무슨 뜻인지 한자리에서.
 *
 * 점수는 없다(기획안 §6: S6 는 무득점 탐색). 그래서 보상은 숫자 점수가 아니라
 * **당신이 만든 지구의 제원**과 그것이 지질시대에 실제로 벌어졌던 시점이다.
 */
function MissionCleared({
  mission,
  summer,
  endDelta,
  orbit,
  clearedAt,
  onClose,
  onNext,
}: {
  mission: Mission
  summer: number
  endDelta: number
  orbit: { obliquity: number; eccentricity: number }
  /** 달성 시점에 남아 있던 시간(초). 0 이면 제한 시간을 넘긴 뒤 달성 */
  clearedAt: number
  onClose: () => void
  onNext: () => void
}) {
  const cold = mission.id === 'glaciate'
  const delta = summer - PRESENT_SUMMER

  return (
    /* 화면을 완전히 막지 않는다 — 뒤의 지구가 방금 만든 색으로 보여야 하므로 어둡게만 깐다 */
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        className="panel rise flex w-full max-w-md flex-col gap-3 px-6 py-5"
        style={{ borderColor: 'color-mix(in oklab, var(--color-good) 55%, transparent)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{
              background: 'color-mix(in oklab, var(--color-good) 24%, transparent)',
              color: 'var(--color-good)',
            }}
          >
            과제 달성
          </span>
          <span className="text-[10.5px] text-ink-3">
            {mission.title} ·{' '}
            {clearedAt > 0 ? `${clearedAt.toFixed(1)}초 남기고 달성` : '제한 시간을 넘긴 뒤 달성'}
          </span>
        </div>

        <h2 className="text-[19px] leading-tight font-semibold tracking-tight">
          {cold ? '빙하기의 방아쇠가 당겨졌습니다' : '간빙기가 시작됩니다'}
        </h2>
        <p className="text-[12.5px] leading-relaxed text-ink-2">{mission.success}</p>

        {/* 당신이 만든 지구의 제원 */}
        <div className="panel-quiet grid grid-cols-2 gap-x-4 gap-y-2 px-3.5 py-3">
          <Spec label="북위 65° 여름 일사량" value={`${summer.toFixed(0)} W/m²`} sub={`현재 지구 대비 ${delta > 0 ? '+' : ''}${delta.toFixed(0)}`} />
          <Spec
            label="5만 년 뒤 자연 기온"
            value={`${endDelta > 0 ? '+' : ''}${endDelta.toFixed(1)}℃`}
            sub="궤도만으로 도착하는 값"
          />
          <Spec label="자전축 기울기" value={`${orbit.obliquity.toFixed(1)}°`} sub="실제 범위 22.1–24.5°" />
          <Spec label="궤도 이심률" value={orbit.eccentricity.toFixed(3)} sub="실제 범위 0.005–0.06" />
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          {cold ? (
            <>
              실제로 약 <span className="text-ink-2">11만 년 전</span>, 이 일사량이 지금보다 낮아졌을 때 마지막 빙하기가
              시작됐습니다. 지구가 실제로 오간 범위 안에서 만드셨으니, 이건 상상이 아니라{' '}
              <span className="text-ink-2">지구가 실제로 하는 일</span>이에요.
            </>
          ) : (
            <>
              실제로 약 <span className="text-ink-2">1만 1천 년 전</span> 이 일사량이 정점을 지나며 마지막 빙하기가
              끝났습니다. 우리가 사는 간빙기가 그렇게 시작됐어요 — 상상이 아니라{' '}
              <span className="text-ink-2">지구가 실제로 한 일</span>입니다.
            </>
          )}
        </p>

        <p className="border-t border-white/8 pt-2.5 text-[11.5px] leading-relaxed text-ink-3">
          다만 방금 만든 변화는 <span className="text-ink-2">만 년 단위</span>로 도착합니다. 지금 지구가 겪는 +1.7℃ 는
          그 시계보다 백 배 빠르고, 그게 다음 화면의 주제예요.
        </p>

        <div className="mt-1 flex items-center gap-2">
          <button type="button" className="btn btn-primary flex-1 py-2.5 text-[13px]" onClick={onNext}>
            다음 단계로
          </button>
          <button type="button" className="btn btn-ghost px-4 py-2.5 text-[12.5px]" onClick={onClose}>
            계속 만져보기
          </button>
        </div>
      </div>
    </div>
  )
}

function Spec({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-ink-3">{label}</div>
      <div className="tnum text-[15px] font-semibold text-ink-1">{value}</div>
      <div className="tnum text-[10px] text-ink-3">{sub}</div>
    </div>
  )
}

/** 과제 조건 한 칸 — 켜짐/꺼짐이 색과 기호로 동시에 보여야 한다 */
function Condition({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className="flex items-center gap-1 whitespace-nowrap"
      style={{ color: ok ? 'var(--color-good)' : 'var(--color-warn)' }}
    >
      <span className="text-[10px]">{ok ? '✓' : '○'}</span>
      {children}
    </span>
  )
}

/**
 * 이 화면의 계기판 — 다이얼을 미는 동안 항상 화면에 붙어 있어야 하는 단 하나의 숫자.
 *
 * 현재 지구 대비 증감(Δ)을 같이 띄운다. 절대값 470 이 커진 건지 작아진 건지는
 * 기준을 모르면 읽을 수 없는데, 이 화면에서 가장 자주 하는 판단이 그거다.
 */
function InsolationGauge({
  summer,
  threshold,
  met,
  onTarget,
  real,
}: {
  summer: number
  threshold: number
  met: boolean
  /** 일사량 조건만 충족했는가 */
  onTarget: boolean
  /** 궤도가 지구가 실제로 오간 범위 안인가 */
  real: boolean
}) {
  /*
   * 숫자가 목표를 넘겼는데도 달성이 아닌 경우가 이 화면의 함정이다.
   *
   * 실험 구간까지 밀면 일사량은 얼마든지 올라간다 — 521 을 만들어 놓고 "조건을 다
   * 만족했는데 왜 성공이 아니냐"는 지적을 받았다. 숫자 옆에 인정되지 않는다는 사실을
   * 붙여 두지 않으면, 화면이 고장 난 것처럼 읽힌다.
   */
  const unqualified = onTarget && !real
  const delta = summer - PRESENT_SUMMER
  const pos = (v: number) =>
    Math.max(0, Math.min(100, ((v - DIAL_BOUNDS.min) / (DIAL_BOUNDS.max - DIAL_BOUNDS.min)) * 100))

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-ink-3">북위 65° 하지 일사량</span>
        <span
          className="tnum text-[11px] font-semibold"
          style={{ color: Math.abs(delta) < 0.5 ? 'var(--color-ink-3)' : delta > 0 ? 'var(--color-warn)' : 'var(--color-act-1)' }}
        >
          현재 지구 대비 {delta > 0 ? '+' : ''}
          {delta.toFixed(0)}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="tnum text-[26px] leading-none font-semibold transition-colors"
          style={{ color: met ? 'var(--color-good)' : unqualified ? 'var(--color-bad)' : undefined }}
        >
          {summer.toFixed(0)}
        </span>
        <span className="text-[11.5px] text-ink-3">W/m²</span>
        {unqualified && (
          <span
            className="ml-auto rounded-full px-1.5 py-px text-[9.5px] font-semibold whitespace-nowrap"
            style={{
              background: 'color-mix(in oklab, var(--color-bad) 20%, transparent)',
              color: 'var(--color-bad)',
            }}
          >
            목표는 넘겼지만 인정 안 됨
          </span>
        )}
      </div>

      {/* 목표 게이지 — 지금 어디에 있고 어디로 가야 하는지 */}
      <div className="relative mt-2 h-2.5 rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 rounded-full transition-[width] duration-150"
          style={{
            width: `${pos(summer)}%`,
            background: met ? 'var(--color-good)' : unqualified ? 'var(--color-bad)' : 'var(--color-act-3)',
          }}
        />
        <div className="absolute -top-1 h-4.5 w-px bg-white/70" style={{ left: `${pos(threshold)}%` }} title="목표" />
        <div
          className="absolute -bottom-1 h-4.5 w-px bg-act-2/70"
          style={{ left: `${pos(PRESENT_SUMMER)}%` }}
          title="현재 지구"
        />
      </div>
    </div>
  )
}

/**
 * 개념 노트 — 슬라이더를 미는 것만으로는 배울 수 없는 것들.
 *
 * 물리적 인과(다이얼 → 지구가 변한다)는 화면이 이미 보여준다. 여기 적는 것은
 * 그 인과에 붙은 **이름과 단위**다. 일사량이 무엇인지, 왜 하필 북위 65°인지,
 * 왜 이심률을 키웠는데 오히려 서늘해지는지 — 셋 다 모르면 숫자가 그냥 숫자다.
 *
 * 왜 접었나: 세 단락을 다 펼쳐 두면 조종석 세로가 화면을 넘겨, 다이얼을 미는 동안
 * 스크롤을 오가야 했다. 이 화면의 본체는 손과 숫자이고 노트는 **막힐 때 여는 것**이라,
 * 질문만 세 줄로 남기고 답은 누를 때 펼친다. 한 번에 하나만 열려 읽을 곳이 늘 하나다.
 */
const NOTES: { q: string; a: ReactNode }[] = [
  {
    q: '일사량(W/m²)이 뭔가요?',
    a: (
      <>
        1m² 넓이에 1초 동안 쏟아지는 태양 에너지의 양입니다. 태양이 더 밝아지는 게 아니라,{' '}
        <span className="text-ink-2">궤도와 자전축이 햇빛을 어느 위도·어느 계절에 몰아주느냐</span>가 바뀌는 거예요.
        지구 전체가 1년에 받는 총량은 거의 그대로입니다 — 배분만 달라집니다.
      </>
    ),
  },
  {
    q: '왜 하필 북위 65°의 여름인가요?',
    a: (
      <>
        대륙 빙상이 자라는 위도입니다. 고위도의 여름이 서늘하면 겨울 눈이 다 녹지 못하고 쌓여요. 빙하기의 방아쇠는
        추운 겨울이 아니라 <span className="text-ink-2">서늘한 여름</span>입니다. 쌓인 눈은 햇빛을 되쏘아 더 서늘하게
        만들고(얼음–반사율 되먹임), 그래서 작은 변화가 큰 결과가 됩니다.
      </>
    ),
  },
  {
    // 이심률을 키웠는데 오히려 서늘해지는 건 버그가 아니라 지금 지구의 사정이다.
    // 설명이 없으면 슬라이더가 고장 난 것처럼 읽힌다.
    q: '이심률을 키웠는데 왜 서늘해지죠?',
    a: (
      <>
        지금 지구는 <span className="text-ink-2">1월 초에 태양과 가장 가깝습니다.</span> 그래서 궤도를 찌그러뜨릴수록
        북반구의 여름(7월)은 태양에서 더 멀어져요. 고장이 아니라 지금 지구의 사정입니다 — 2만 6천 년 주기의
        세차운동이 이 관계를 뒤집으면 같은 조작이 반대로 작동합니다.
      </>
    ),
  },
]

function ConceptNotes() {
  const [open, setOpen] = useState<number | null>(null)
  const rows = useRef<(HTMLDivElement | null)[]>([])

  /** 펼친 답이 칸 아래로 밀려 잘리면 읽을 수 없다 — 펼치는 즉시 보이는 자리로 끌어온다 */
  useEffect(() => {
    if (open !== null) rows.current[open]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  return (
    <div className="panel-quiet flex shrink-0 flex-col overflow-hidden">
      <div className="px-3 pt-1.5 text-[10px] font-medium tracking-[0.12em] text-ink-3">
        막히면 여기 · 개념 세 가지
      </div>
      {NOTES.map((n, i) => {
        const isOpen = open === i
        return (
          <div
            key={n.q}
            ref={(el) => {
              rows.current[i] = el
            }}
            className="border-t border-white/6"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/4"
            >
              <span
                className="flex-1 text-[11.5px] leading-snug font-medium"
                style={{ color: isOpen ? 'var(--color-act-3)' : 'var(--color-ink-2)' }}
              >
                {n.q}
              </span>
              <span
                className="shrink-0 text-[13px] leading-none text-ink-3 transition-transform"
                style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}
                aria-hidden
              >
                +
              </span>
            </button>
            {isOpen && <p className="px-3 pb-2.5 text-[11.5px] leading-relaxed text-ink-3">{n.a}</p>}
          </div>
        )
      })}
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
  const pct = (v: number) => valueToPos(v, min, max, real) * 100
  const outside = !inReal(value, real)
  /*
   * 값을 step 배수로 정리한다. 트랙 위치는 연속이지만 표시값이 24.3719° 로 나오면
   * 계기가 아니라 노이즈로 읽힌다.
   */
  const snap = (v: number) => {
    const q = Math.round(v / step) * step
    const digits = Math.max(0, Math.ceil(-Math.log10(step)))
    return Number(Math.min(max, Math.max(min, q)).toFixed(digits))
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <span
          className="tnum text-[14px] font-semibold"
          style={outside ? { color: 'var(--color-bad)' } : undefined}
        >
          {format(value)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink-3">
        <span>{note}</span>
        <span>
          {outside ? (
            /* 실험 구간에서는 화살표가 거짓말이 된다 — 일사량은 목표에 가까워지지만
               과제로 인정되지 않으므로, 그 사실을 여기서 말해준다. */
            <span style={{ color: 'var(--color-bad)' }}>실제 범위 밖</span>
          ) : helpful !== undefined && Math.abs(helpful) >= 0.4 ? (
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
        {/* 트랙 위치(0~1)를 입력으로 받고 값으로 옮긴다 — 위의 posToValue 참고.
            aria 쪽은 위치가 아니라 사람이 읽는 실제 값을 말해야 한다. */}
        <input
          className="slider relative"
          type="range"
          min={0}
          max={1}
          step={0.0005}
          value={valueToPos(value, min, max, real)}
          onChange={(e) => onChange(snap(posToValue(Number(e.target.value), min, max, real)))}
          aria-label={label}
          aria-valuetext={format(value)}
        />
        {/* 현재 지구의 값 */}
        <div className="pointer-events-none absolute top-[13px] h-3 w-px bg-act-2/80" style={{ left: `${pct(present)}%` }} />
      </div>
      <div className="tnum flex justify-between text-[10.5px] text-ink-3">
        <span>{format(min)}</span>
        <span style={{ color: 'var(--color-good)' }}>실제로 오간 범위</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}
