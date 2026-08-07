/**
 * S6 우주 뷰 — 기존 TERRA 궤도 시뮬레이터를 그대로 얹는다.
 *
 * 렌더링·궤도·조명은 전부 [src/sim/terra-engine.js] 다. 이 파일은 리액트 수명주기에
 * 맞춰 엔진을 붙였다 떼고, 슬라이더 값을 흘려보내는 껍데기일 뿐이다. 궤도 표현을
 * 여기서 다시 그리지 않는 것이 요점이다.
 *
 * 연출: S5(지상의 기온 곡선)에서 넘어오자마자 지구 근접 뷰로 시작해 궤도 전체 뷰로
 * 카메라를 뺀다. 시뮬레이터의 우주 톤이 다른 화면과 이질적인 것은 감추지 않고,
 * 그 이질감 자체를 "지상을 벗어났다"는 신호로 쓴다.
 */
import { useEffect, useRef, useState } from 'react'
import { createTerraSim } from '../../../sim/terra-engine.js'
import type { OrbitParams } from '../../lib/milankovitch'

type Sim = Awaited<ReturnType<typeof createTerraSim>>

/** 근접 뷰에 머무는 시간. 이 뒤에 카메라가 궤도 전체로 빠진다. */
const HOLD_MS = 1500
const PULL_OUT_SEC = 2.6

export function TerraGlobe({ params }: { params: OrbitParams }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Sim | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<'earth' | 'system'>('earth')
  const [arrived, setArrived] = useState(false)

  // 엔진 생성은 비동기라, 만들어지는 동안 바뀐 값도 놓치지 않도록 ref 로 들고 있는다.
  const paramsRef = useRef(params)
  paramsRef.current = params

  // 엔진은 한 번만 만든다. params 는 아래 별도 effect 로 흘려보낸다.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let pullOut = 0

    createTerraSim(host, {
      // 발표 현장 네트워크와 무관해야 한다 — 외부 요청 0건, 절차적 텍스처만 쓴다.
      // (public/textures/ 에 플레이트를 두면 textureMode:'local' 로 올릴 수 있다)
      textureMode: 'procedural',
      quality: 'lite',
      params: paramsRef.current,
      motion: { speed: 1.6, spin: 1, exposure: 1.05 },
      view: 'earth',
      intro: true,
      onViewChange: setView,
    }).then((sim) => {
      if (cancelled) {
        sim.dispose()
        return
      }
      simRef.current = sim
      sim.setToggle('grid', false) // 패널 크기에서는 황도 격자가 노이즈로만 읽힌다
      sim.setParams(paramsRef.current) // 로딩 중에 슬라이더가 움직였을 수 있다
      setReady(true)
      // 줌아웃: 지구 근접 → 궤도 전체
      pullOut = window.setTimeout(() => {
        sim.setView('system', true, PULL_OUT_SEC)
        setArrived(true)
      }, HOLD_MS)
    })

    const ro = new ResizeObserver(() => simRef.current?.resize())
    ro.observe(host)

    return () => {
      cancelled = true
      window.clearTimeout(pullOut)
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
    <div className="panel relative overflow-hidden">
      <div ref={hostRef} className="h-full w-full" />

      {/* 로딩 — 절차적 텍스처 합성은 한 프레임 안에 안 끝난다 */}
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-[11.5px] tracking-[0.14em] text-ink-3">
          우주로 나가는 중…
        </div>
      )}

      {/* 도착 자막. 궤도 전체가 잡히면 사라진다. */}
      {ready && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 p-3 text-[11.5px] leading-relaxed transition-opacity duration-700"
          style={{ opacity: arrived ? 0 : 1 }}
        >
          <span className="rounded bg-black/45 px-2 py-1 text-ink-2 backdrop-blur-sm">
            지상을 벗어난다 — 여기서부터는 대기가 아니라 <span className="text-ink-1">궤도</span>가 기후를 정한다
          </span>
        </div>
      )}

      {/* 뷰 전환. 기울기는 근접 뷰에서, 세차·이심률은 궤도 뷰에서 잘 보인다. */}
      {ready && (
        <div className="absolute right-2 bottom-2 flex gap-1">
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
              className="rounded border px-2 py-1 text-[10.5px] transition-colors"
              style={{
                borderColor: view === mode ? 'var(--color-act-3)' : 'rgb(255 255 255 / 0.14)',
                color: view === mode ? 'var(--color-ink-1)' : 'var(--color-ink-3)',
                background: view === mode ? 'rgb(144 133 233 / 0.16)' : 'rgb(0 0 0 / 0.35)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
