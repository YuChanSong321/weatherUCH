/**
 * 배경 별밭 — 단계가 진행될수록 카메라가 뒤로 물러나는 느낌을 만든다.
 * 막(act)이 올라가면 별이 더 많이/더 작게 보이도록 줌 레벨이 부드럽게 이동한다.
 */
import { useEffect, useRef } from 'react'

type Star = { x: number; y: number; z: number; tw: number }

const STAR_COUNT = 260
const ZOOM_BY_ACT: Record<number, number> = { 1: 1, 2: 1.7, 3: 2.7 }

export function StarField({ act }: { act: 1 | 2 | 3 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actRef = useRef(act)
  actRef.current = act

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.25 + Math.random() * 0.75,
      tw: Math.random() * Math.PI * 2,
    }))

    let dpr = 1
    let w = 0
    let h = 0
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let zoom = ZOOM_BY_ACT[act]
    let raf = 0
    let t = 0

    const frame = () => {
      t += 1
      const target = ZOOM_BY_ACT[actRef.current] ?? 1
      zoom += (target - zoom) * 0.02

      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2

      for (const s of stars) {
        // 줌아웃: 화면 중심 기준으로 별들이 안쪽으로 수축하며 촘촘해진다
        const px = cx + (s.x - 0.5) * w * (1 / zoom) * 2.2
        const py = cy + (s.y - 0.5) * h * (1 / zoom) * 2.2
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue

        const drift = reduceMotion ? 0 : Math.sin(t * 0.002 + s.tw) * 0.6
        const twinkle = reduceMotion ? 0.75 : 0.55 + 0.45 * Math.sin(t * 0.02 * s.z + s.tw)
        const r = Math.max(0.35, s.z * 1.5 / Math.sqrt(zoom))

        ctx.beginPath()
        ctx.arc(px + drift, py, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226, 232, 255, ${(0.18 + 0.5 * s.z) * twinkle})`
        ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
    // act 는 ref 로 읽으므로 마운트 시 1회만 초기화한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div
        className="absolute inset-0 transition-[background] duration-[1400ms]"
        style={{
          background:
            act === 1
              ? 'radial-gradient(120% 90% at 50% 12%, rgba(56,169,224,0.13), transparent 62%)'
              : act === 2
                ? 'radial-gradient(120% 90% at 50% 15%, rgba(217,154,31,0.12), transparent 62%)'
                : 'radial-gradient(120% 95% at 50% 18%, rgba(144,133,233,0.15), transparent 64%)',
        }}
      />
    </div>
  )
}
