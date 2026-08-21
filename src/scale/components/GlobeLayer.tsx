/**
 * 상시 3D 지구 — 기획안 §2 원칙 2: "3D 지구는 S0부터 S8까지 화면에서 사라지지 않는다."
 *
 * 엔진은 [src/sim/terra-engine.js] 를 그대로 쓴다. 이 파일은 엔진을 **앱 수명 내내 딱
 * 한 번** 만들어 두고, 단계 전환에 따라 카메라만 옮기는 껍데기다. 단계마다 새로
 * 만들면 WebGL 컨텍스트와 텍스처를 매번 다시 잡느라 전환이 끊긴다.
 *
 * 배치 규칙은 기존 S6 구현에서 그대로 가져왔다. 둘 다 실제로 겪은 문제라 옮겨 적는다.
 *
 *   · 페인팅 순서 — position:fixed 는 '위치 지정 요소'라, 위치 지정이 없는 HUD 패널보다
 *     무조건 위에 그려진다. 캔버스를 HUD 트리 안에 두면 지구본이 슬라이더를 덮어버린다.
 *     body 로 빼고 z-0 을 주면 z-10 인 무대 전체가 항상 위로 온다.
 *   · fixed 의 기준 — 조상에 transform 이 걸리면 fixed 는 뷰포트가 아니라 그 조상을
 *     기준으로 잡힌다. 단계 전환 애니메이션(framer-motion)이 바로 그 transform 을 건다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createTerraSim } from '../../sim/terra-engine.js'
import { useJourney, type Stage } from '../state/journey'
import { NEUTRAL_SURFACE, type SurfaceState } from '../lib/surfaceState'
import { usePlace } from '../state/place'
import { useWorld } from '../state/world'

type Sim = Awaited<ReturnType<typeof createTerraSim>>
type View = 'earth' | 'system'

export type PickedPoint = { lat: number; lon: number }

/** 엔진의 에너지 균형 모델이 실시간으로 내놓는 값 */
export type GlobeTelemetry = {
  /** 지연된 표면 온도 (°C) — 열관성까지 반영한 값 */
  T: number
  /** 순간 평형 온도 (°C) — 지금 이 거리에서 슈테판–볼츠만이 주는 값 */
  Teq: number
  /** 근일점에 놓였을 때의 평형 온도 (°C) */
  Tperi: number
  /** 지금 받는 일사량 (W/m²) */
  S: number
  /** 태양까지의 거리 (AU) */
  au: number
  /** 근일점·원일점 거리 (AU) */
  auPeri: number
  auApo: number
}

type GlobeApi = {
  ready: boolean
  view: View
  setView: (v: View, animate?: boolean, seconds?: number) => void
  /**
   * 지구 표면 클릭 구독. S0 만 등록한다 — 다른 단계에서 지구를 끌다가 지역이
   * 바뀌면 안 된다. 해제 함수를 돌려주므로 useEffect 의 정리에 그대로 쓴다.
   */
  onPick: (handler: (p: PickedPoint) => void) => () => void
  /**
   * 기후 색조 −1(차가움) … 0(현재) … 1(따뜻함).
   * 공간 분포 지도가 아니라 '지금 화면이 말하는 값'의 상징 표현이다.
   */
  setClimateTint: (v: number) => void
  /** 자기권 레이어 표시 (S7 전용) */
  setMagnetosphere: (v: boolean) => void
  /** 지자기 세기 % — 자력선과 태양풍 투과가 함께 움직인다 */
  setMagneticField: (pct: number) => void
  /**
   * 임계를 넘은 순간 지구본에서 한 번 터뜨린다.
   * 상태가 아니라 사건이므로 보류 큐에 넣지 않는다 — 엔진이 아직 없을 때 넘은
   * 임계를 나중에 몰아서 터뜨리면, 아무 일도 안 한 순간에 화면이 번쩍인다.
   */
  pulseAlert: (hex: number) => void
  /**
   * 지표 상태 — 빙상·건조화·바다 후퇴·용융 (전부 0…1).
   * 무엇을 어디에 연결할지는 [lib/surfaceState] 가 정한다.
   */
  setSurface: (s: Partial<SurfaceState>) => void
  /**
   * 지표를 엔진의 에너지 균형 온도에서 직접 끌어온다.
   * 극단 궤도에서는 이쪽이 맞다 — 근일점 거리가 실제로 온도를 정하기 때문이다.
   */
  setSurfaceAuto: (v: boolean) => void
  /** 지구를 근일점에 세운다 — 스쳐 지나가는 순간을 볼 수 있게 */
  setOrbitPark: (v: boolean) => void
  /** 엔진의 실시간 계산값 (약 5회/초 갱신) */
  telemetry: GlobeTelemetry | null
}

const GlobeContext = createContext<GlobeApi | null>(null)

export function useGlobe(): GlobeApi {
  const ctx = useContext(GlobeContext)
  if (!ctx) throw new Error('useGlobe 는 GlobeProvider 안에서만 쓸 수 있다')
  return ctx
}

/**
 * 단계별 기본 카메라.
 *
 * 지상의 이야기(S0~S4)는 지구에 붙어서, 궤도의 이야기(S5~S6)는 물러나서 본다.
 * S7 자기장·S8 미래는 다시 지구로 돌아온다 — 우주에서 지구를 '고치는' 화면이라
 * 대상이 화면 가운데 있어야 한다.
 */
const VIEW_BY_STAGE: Record<Stage, View> = {
  s0: 'earth',
  s1: 'earth',
  s2: 'earth',
  s3: 'earth',
  s4: 'earth',
  s5: 'earth',   // 100년 · SSP 부채꼴 — 아직 지상의 이야기
  s6: 'system',  // 수만 년 · 궤도
  s7: 'earth',   // 임계 · 자기권
  s8: 'earth',   // 전체 겹쳐보기 · 회수
}

/** 단계 전환 시 카메라 이동 시간 (초) */
const MOVE_SEC = 2.2

/**
 * 지구를 햇빛 쪽에서 보는 단계.
 *
 * S7 만 원본의 초승달 구도를 남긴다 — 자기권 자력선과 도시 불빛이 밤 쪽에서
 * 훨씬 잘 읽히고, 바다가 물러난 것도 낮 반쪽으로 충분히 보인다.
 */
const DAYLIGHT_STAGES = new Set<Stage>(['s0', 's1', 's2', 's3', 's4', 's5', 's8'])

export function GlobeProvider({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Sim | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setViewState] = useState<View>(() => VIEW_BY_STAGE.s0)
  const [telemetry, setTelemetry] = useState<GlobeTelemetry | null>(null)
  // 엔진은 0.1초마다 보내온다. 그대로 state 에 넣으면 초당 10회 리렌더가 되므로
  // 화면에 읽히는 속도(약 5회/초)로만 통과시킨다.
  const lastTelemetry = useRef(0)
  const { stage } = useJourney()
  const { orbit } = useWorld()
  const { place } = usePlace()
  const pickHandler = useRef<((p: PickedPoint) => void) | null>(null)

  // 엔진 생성은 비동기다. 만들어지는 동안 바뀐 값도 놓치지 않도록 ref 로 들고 있는다.
  const orbitRef = useRef(orbit)
  orbitRef.current = orbit
  const stageRef = useRef(stage)
  stageRef.current = stage

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false

    createTerraSim(host, {
      // standalone(/terra-orbital-sim.html)과 같은 설정이다. 번들된 NASA 플레이트를
      // 쓰므로 외부 요청이 없고, 발표 현장 네트워크와 무관하게 같은 화질이 나온다.
      // 'procedural' 로 낮추지 말 것 — 파일이 없을 때만 엔진이 알아서 내려간다.
      textureMode: 'local',
      params: orbitRef.current,
      motion: { speed: 1, spin: 1, exposure: 1.05 },
      view: VIEW_BY_STAGE[stageRef.current],
      // 엔진 자체 시네마틱은 끈다 — 단계별 카메라 정책과 겹치면 서로 덮어쓴다.
      intro: false,
      onViewChange: setViewState,
      onPick: (p: PickedPoint) => pickHandler.current?.(p),
      onTelemetry: (t: GlobeTelemetry) => {
        const now = performance.now()
        if (now - lastTelemetry.current < 200) return
        lastTelemetry.current = now
        setTelemetry({ T: t.T, Teq: t.Teq, Tperi: t.Tperi, S: t.S, au: t.au, auPeri: t.auPeri, auApo: t.auApo })
      },
    }).then((sim) => {
      if (cancelled) {
        sim.dispose()
        return
      }
      simRef.current = sim
      sim.setParams(orbitRef.current) // 로딩 중에 슬라이더가 움직였을 수 있다
      setReady(true)
    })

    const onResize = () => simRef.current?.resize()
    window.addEventListener('resize', onResize)
    // 첫 레이아웃이 잡히기 전에 엔진이 만들어지면 캔버스가 0px 로 시작한다.
    const ro = new ResizeObserver(onResize)
    ro.observe(host)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      simRef.current?.dispose()
      simRef.current = null
    }
  }, [])

  // 엔진이 준비되는 순간, 그 전에 놓친 지시를 몰아서 적용한다
  useEffect(() => {
    const sim = simRef.current
    if (!sim || !ready) return
    const q = pending.current
    if (q.magneto !== undefined) sim.setMagnetosphereVisible(q.magneto)
    if (q.field !== undefined) sim.setMagneticField(q.field)
    if (Object.keys(q.surface).length > 0) sim.setSurface(q.surface)
  }, [ready])

  // 궤도 3요소 → 엔진 (프레임 지연 없이 그대로 흘려보낸다)
  useEffect(() => {
    simRef.current?.setParams(orbit)
  }, [orbit])

  /**
   * 선택한 지역 → 마커.
   *
   * 마커를 S0 이 아니라 여기서 다루는 이유: 지역은 S0 에서 고르지만 그 표시는
   * 여정 내내 유지돼야 한다. S0 이 언마운트되면서 사라지면 안 된다.
   *
   * 정면 맞추기(faceLatLon)는 **지역이 바뀔 때 한 번만** 한다. 지구는 계속 돌고
   * 있으므로, 단계가 바뀔 때마다 다시 맞추면 도는 도중에 툭 끊겨 보인다.
   */
  useEffect(() => {
    const sim = simRef.current
    if (!sim || !ready || !place) return
    sim.setMarker({ lat: place.lat, lon: place.lon })
    sim.faceLatLon(place.lat, place.lon)
  }, [place, ready])

  useEffect(() => {
    const sim = simRef.current
    if (!sim || !ready || place) return
    sim.setMarker(null)
  }, [place, ready])

  /*
   * 단계 → 카메라. **단계가 바뀔 때만** 돈다.
   *
   * place 를 의존성에 넣으면 안 된다. 지역을 찍는 순간 이 effect 가 통째로 다시
   * 돌면서 setView 가 카메라를 기준 자세로 끌어당기는데, 그때 카메라는 자전 동행으로
   * 이미 돌아가 있는 상태다 — 방금 찍은 자리가 눈앞에서 끌려가 버린다. 실제로
   * 그랬다. 카메라 정책은 단계의 것이고, 지역 선택은 단계를 바꾸지 않는다.
   */
  useEffect(() => {
    const sim = simRef.current
    if (!sim || !ready) return
    // 지상의 이야기에서는 햇빛 쪽에서 본다 — 찍은 자리가 어둠에 잠기면 안 된다.
    // 궤도 이야기로 넘어가면 원본의 초승달 구도로 돌려놓는다.
    sim.setEarthFraming(DAYLIGHT_STAGES.has(stage) ? 'daylight' : 'crescent', false)
    sim.setView(VIEW_BY_STAGE[stage], true, MOVE_SEC)
    sim.setSpin(1)
    sim.setToggle('drift', false)
  }, [stage, ready])

  /*
   * 자전 동행 — S0 이 끝날 때까지 유지한다.
   *
   * 자전은 언제나 돈다. 대신 지역을 고르는 화면에서는 카메라가 자전에 동행해 지표가
   * 화면에 멈춰 보이게 한다. 예전에는 여기서 세 가지를 잘못했다.
   *   · S0 에서 drift(카메라 자동 회전)와 자전이 동시에 돌아 찍으려는 자리가
   *     두 겹으로 도망갔다.
   *   · 지역을 고른 뒤에는 자전을 아예 0 으로 멈춰버려 지구가 죽은 것처럼 보였다.
   *   · 지역을 찍는 **순간** 동행을 풀어버려, "이 지역으로 예보 시작하기" 를 누르기
   *     전에 방금 찍은 자리가 화면에서 흘러가 버렸다. 게다가 동행을 끄면 엔진이
   *     camera.up 을 즉시 원위치시키므로(롤 되돌리기) 그 순간 화면이 튄다.
   *
   * 그래서 조건은 place 가 아니라 stage 다. 버튼을 눌러 S1 으로 넘어가면 자동으로
   * 풀리고, 그때는 단계 전환 자체가 카메라를 다시 잡으므로 튀는 것으로 보이지 않는다.
   */
  useEffect(() => {
    if (!ready) return
    simRef.current?.setCameraFollowSpin(stage === 's0')
  }, [stage, ready])

  const setView = useCallback((v: View, animate = true, seconds = MOVE_SEC) => {
    simRef.current?.setView(v, animate, seconds)
  }, [])

  const onPick = useCallback((handler: (p: PickedPoint) => void) => {
    pickHandler.current = handler
    return () => {
      if (pickHandler.current === handler) pickHandler.current = null
    }
  }, [])

  const setClimateTint = useCallback((v: number) => {
    simRef.current?.setClimateTint(v)
  }, [])

  // 단계를 떠날 때 색조를 원래대로 돌려놓는다 — 다음 단계가 이전 단계의 색을
  // 물려받으면 그 화면이 하지도 않은 말을 하게 된다.
  useEffect(() => {
    return () => simRef.current?.setClimateTint(0)
  }, [stage])

  /*
   * 엔진이 준비되기 전에 들어온 지시를 기억해 둔다.
   *
   * 엔진은 텍스처를 다 받은 뒤에야 만들어지는데(수백 ms~수 초), 단계 화면의
   * useEffect 는 마운트 즉시 돈다. 그래서 `simRef.current?.…` 로만 흘려보내면
   * **그 사이에 온 호출이 통째로 버려진다** — 실제로 S7 에 들어가도 자기권 레이어가
   * 켜지지 않는 일이 있었다(엔진이 늦게 뜨는 환경에서 재현). 마지막 지시를 붙들고
   * 있다가 준비되는 순간 다시 적용한다.
   */
  const pending = useRef<{ magneto?: boolean; field?: number; surface: Partial<SurfaceState> }>({ surface: {} })

  const setMagnetosphere = useCallback((v: boolean) => {
    pending.current.magneto = v
    simRef.current?.setMagnetosphereVisible(v)
  }, [])

  const setMagneticFieldOnGlobe = useCallback((pct: number) => {
    pending.current.field = pct
    simRef.current?.setMagneticField(pct)
  }, [])

  const pulseAlert = useCallback((hex: number) => {
    simRef.current?.pulseAlert(hex)
  }, [])

  const setSurface = useCallback((next: Partial<SurfaceState>) => {
    pending.current.surface = { ...pending.current.surface, ...next }
    simRef.current?.setSurface(next)
  }, [])

  const setSurfaceAuto = useCallback((v: boolean) => {
    simRef.current?.setSurfaceAuto(v)
  }, [])

  const setOrbitPark = useCallback((v: boolean) => {
    simRef.current?.setOrbitPark(v)
  }, [])

  // 단계를 떠나면 지표도 원래대로. 색조와 같은 이유다 — 다음 화면이 이전 화면의
  // 빙상을 물려받으면 그 화면이 하지 않은 주장을 하게 된다.
  useEffect(() => {
    return () => {
      simRef.current?.setSurfaceAuto(false)
      simRef.current?.setOrbitPark(false)
      simRef.current?.setSurface(NEUTRAL_SURFACE)
    }
  }, [stage])

  const api = useMemo<GlobeApi>(
    () => ({
      ready,
      view,
      setView,
      onPick,
      setClimateTint,
      setMagnetosphere,
      setMagneticField: setMagneticFieldOnGlobe,
      pulseAlert,
      setSurface,
      setSurfaceAuto,
      setOrbitPark,
      telemetry,
    }),
    [ready, view, setView, onPick, setClimateTint, setMagnetosphere, setMagneticFieldOnGlobe, setSurface, setSurfaceAuto, setOrbitPark, telemetry],
  )

  return (
    <GlobeContext.Provider value={api}>
      {createPortal(<div ref={hostRef} className="fixed inset-0 z-0" />, document.body)}
      {children}
    </GlobeContext.Provider>
  )
}

/**
 * 지구와 UI 사이의 암막.
 *
 * 지구를 상시 노출하라는 요구와 "글이 읽혀야 한다"는 요구는 정면으로 부딪친다.
 * 차트와 본문이 빽빽한 단계에서는 암막을 짙게 깔고, 지구 자체가 주인공인 단계에서는
 * 걷는다. 지구를 끄는 대신 뒤로 물리는 방식이라 원칙 2 를 깨지 않는다.
 */
const SCRIM_BY_STAGE: Record<Stage, number> = {
  s0: 0.42,
  // 햇빛 쪽 구도로 바꾼 뒤로 지구가 훨씬 밝다. 차트가 대륙 위에 겹치면 읽히지
  // 않으므로 글이 많은 단계는 암막을 더 짙게 깐다.
  s1: 0.82,
  s2: 0.82,
  s3: 0.82,
  s4: 0.82,
  s5: 0.82, // 차트가 주인공인 화면
  s6: 0.18, // 궤도 — 지구가 주인공
  s7: 0.18, // 자기권 — 지구가 주인공
  s8: 0.82,
}

export function GlobeScrim({ stage }: { stage: Stage }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1] transition-opacity duration-700"
      style={{ background: 'var(--color-space-0)', opacity: SCRIM_BY_STAGE[stage] }}
      aria-hidden
    />
  )
}
