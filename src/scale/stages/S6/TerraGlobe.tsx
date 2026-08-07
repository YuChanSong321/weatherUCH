/**
 * S6 우주 배경 — 기존 TERRA 궤도 시뮬레이터를 그대로 얹는다.
 *
 * 렌더링·궤도·조명은 전부 [src/sim/terra-engine.js] 다. 이 파일은 리액트 수명주기에
 * 맞춰 엔진을 붙였다 떼고, 슬라이더 값을 흘려보내는 껍데기일 뿐이다.
 *
 * 배치도 원본을 따른다. standalone 시뮬레이터는 우주가 화면 전체를 채우고 유리 패널만
 * 그 위에 작게 떠 있는 구성이고, S6도 같은 구성이다 — 캔버스는 `fixed inset-0` 로
 * 뷰포트를 통째로 덮고, 미션 UI 는 그 위에 떠 있는 패널들이다. 캔버스가 UI 뒤에 있으니
 * 패널이 없는 자리에서는 드래그·줌이 그대로 지구에 닿는다 (원본의 pointer-events 규칙).
 *
 * 연출: S5(지상의 기온 곡선)에서 넘어오면 궤도 전체를 먼저 보여주고, 거기서 지구로
 * 들어가 멈춘다. 시뮬레이터의 우주 톤이 다른 화면과 이질적인 것은 감추지 않고,
 * 그 이질감 자체를 "지상을 벗어났다"는 신호로 쓴다.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createTerraSim } from '../../../sim/terra-engine.js'
import type { OrbitParams } from '../../lib/milankovitch'

type Sim = Awaited<ReturnType<typeof createTerraSim>>

/**
 * 진입 연출: **궤도 전체에서 시작해 지구로 들어가고 끝난다.** 이동은 하나뿐이다.
 *
 * 엔진에도 자체 시네마틱(멀리서 지구로 날아 들어가는 연출)이 있지만 끈다. 켜두면
 * 아래 이동과 겹쳐 카메라가 가다 말고 되돌아 나오고, 그건 연출이 아니라 오작동으로
 * 읽힌다. 시작 지점만 궤도로 잡아두고 들어가는 이동 하나만 남긴다.
 */
/** 궤도 전체를 보여주는 시간. 이 뒤에 지구로 들어간다. */
const HOLD_MS = 1600
const DIVE_SEC = 2.6

export function TerraGlobe({ params }: { params: OrbitParams }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Sim | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<'earth' | 'system'>('system')
  const [arrived, setArrived] = useState(false)

  // 엔진 생성은 비동기라, 만들어지는 동안 바뀐 값도 놓치지 않도록 ref 로 들고 있는다.
  const paramsRef = useRef(params)
  paramsRef.current = params

  // 엔진은 한 번만 만든다. params 는 아래 별도 effect 로 흘려보낸다.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let dive = 0
    let arrive = 0

    createTerraSim(host, {
      // standalone(/terra-orbital-sim.html)과 같은 설정이다. 화질을 낮추거나
      // 텍스처를 합성으로 바꾸지 말 것 — 이 지구본이 이 단계의 핵심이다.
      // 원격 플레이트가 막히면 엔진이 알아서 절차적 폴백으로 내려간다(원본 동작).
      textureMode: 'remote',
      params: paramsRef.current,
      motion: { speed: 1, spin: 1, exposure: 1.05 },
      // 궤도 전체에서 시작한다
      view: 'system',
      // 엔진 시네마틱은 끈다 — 아래 이동과 겹치면 서로 덮어쓴다 (위 주석)
      intro: false,
      onViewChange: setView,
    }).then((sim) => {
      if (cancelled) {
        sim.dispose()
        return
      }
      simRef.current = sim
      sim.setParams(paramsRef.current) // 로딩 중에 슬라이더가 움직였을 수 있다
      setReady(true)
      // 궤도 전체 → 지구로 쏙
      dive = window.setTimeout(() => {
        sim.setView('earth', true, DIVE_SEC)
        // 자막은 도착한 뒤에 걷는다 — 들어가는 동안 계속 읽혀야 한다
        arrive = window.setTimeout(() => setArrived(true), DIVE_SEC * 1000)
      }, HOLD_MS)
    })

    const onResize = () => simRef.current?.resize()
    window.addEventListener('resize', onResize)
    // 첫 레이아웃이 잡히기 전에 엔진이 만들어지면 캔버스가 0px 로 시작한다.
    // 크기가 정해지는 순간 다시 맞춘다.
    const ro = new ResizeObserver(onResize)
    ro.observe(host)

    return () => {
      cancelled = true
      window.clearTimeout(dive)
      window.clearTimeout(arrive)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      simRef.current?.dispose()
      simRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 슬라이더 → 엔진
  useEffect(() => {
    simRef.current?.setParams(params)
  }, [params])

  return (
    <>
      {/*
        우주. 원본 시뮬레이터에서 #scene 이 body 직속이었던 것처럼 여기서도 body 로
        올려 붙인다. 두 가지 이유가 있고 둘 다 실제로 겪은 문제다.

          · 페인팅 순서 — position:fixed 는 '위치 지정 요소'라, 위치 지정이 없는
            HUD 패널보다 무조건 위에 그려진다. 캔버스를 HUD 트리 안에 두면
            지구본이 슬라이더를 덮어버린다. body 로 빼고 z-0 을 주면 z-10 인
            무대 전체(App 의 main)가 항상 위로 온다.
          · fixed 의 기준 — 조상에 transform 이 걸리면 fixed 는 뷰포트가 아니라
            그 조상을 기준으로 잡힌다. 단계 전환 애니메이션(framer-motion)이
            바로 그 transform 을 건다.
      */}
      {createPortal(<div ref={hostRef} className="fixed inset-0 z-0" />, document.body)}

      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-[11.5px] tracking-[0.14em] text-ink-3">
          우주로 나가는 중…
        </div>
      )}

      {/* 자막. 지구에 도착하면 걷힌다. */}
      {ready && (
        <div
          className="pointer-events-none absolute inset-x-0 top-1 flex justify-center text-[12px] transition-opacity duration-700"
          style={{ opacity: arrived ? 0 : 1 }}
        >
          <span className="rounded-full bg-black/50 px-3 py-1.5 text-ink-2 backdrop-blur-sm">
            지구의 궤도입니다 — 여기서부터는 대기가 아니라 <span className="text-ink-1">궤도</span>가 기후를 정합니다
          </span>
        </div>
      )}

      {/* 뷰 전환. 기울기는 근접 뷰에서, 세차·이심률은 궤도 뷰에서 잘 보인다. */}
      {ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1">
          {(
            [
              ['earth', '지구'],
              ['system', '궤도'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => simRef.current?.setView(mode)}
              aria-pressed={view === mode}
              className="pointer-events-auto rounded-full border px-3 py-1 text-[11px] backdrop-blur-sm transition-colors"
              style={{
                borderColor: view === mode ? 'var(--color-act-3)' : 'rgb(255 255 255 / 0.14)',
                color: view === mode ? 'var(--color-ink-1)' : 'var(--color-ink-3)',
                background: view === mode ? 'rgb(144 133 233 / 0.22)' : 'rgb(0 0 0 / 0.42)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
