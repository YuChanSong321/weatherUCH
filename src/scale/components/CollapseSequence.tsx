/**
 * 돌아올 수 없는 지점 — 경고 6초, 그리고 결말.
 *
 * 두 국면이다.
 *   ① 경고  선을 넘은 순간부터 6초. 다이얼을 물리면 아무 일도 없었던 것이 된다.
 *   ② 결말  6초가 지나면 지구가 실제로 그 상태로 넘어간다. 되돌리는 다이얼은 없다.
 *
 * 이 화면이 지키는 선은 하나다 — **극적으로 만들되 지어내지 않는다.**
 * 지구는 폭발하지 않는다. 무슨 일이 실제로 일어나는지, 얼마나 걸리는지, 그리고
 * 무엇이 사실이 아닌지까지 화면에 적는다 (→ lib/collapse).
 *
 * 경고를 6초로 둔 이유: 넘자마자 끝나면 "왜 끝났는지" 알 수 없고, 더 길면 긴장이
 * 풀린다. 6초는 값을 읽고 손을 되돌릴 수 있으면서 다급함이 남는 길이다.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GRACE_SECONDS, type CollapseState } from '../lib/collapse'

/* eslint-disable react-refresh/only-export-components */

/* ─────────────────────────────  ① 경고  ───────────────────────────── */

export function CollapseWarning({ collapse, remaining }: { collapse: CollapseState; remaining: number }) {
  const urgent = remaining <= 3
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4"
      role="alert"
      aria-live="assertive"
    >
      <div
        className="flex items-center gap-4 rounded-xl border px-5 py-3 backdrop-blur-md"
        style={{
          borderColor: 'color-mix(in oklab, var(--color-bad) 70%, transparent)',
          background: 'color-mix(in oklab, var(--color-bad) 18%, rgb(10 15 24 / 0.88))',
          boxShadow: '0 0 40px color-mix(in oklab, var(--color-bad) 35%, transparent)',
        }}
      >
        {/* 초읽기 — 이 화면에서 가장 큰 숫자여야 한다 */}
        <div className="flex items-baseline gap-1">
          <span
            className="hud-num text-[32px] leading-none font-semibold"
            style={{ color: 'var(--color-bad)' }}
          >
            {remaining.toFixed(1)}
          </span>
          <span className="text-[12px] text-ink-3">s</span>
        </div>
        <div className="min-w-0">
          <div
            className={`text-[14px] leading-tight font-semibold ${urgent ? 'pulse-soft' : ''}`}
            style={{ color: 'var(--color-bad)' }}
          >
            {remaining.toFixed(1)}초 뒤 지구는 돌아올 수 없습니다
          </div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">
            {collapse.warning} · <span className="text-ink-1">지금 다이얼을 되돌리면 아무 일도 일어나지 않습니다.</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────  ② 결말  ───────────────────────────── */

/** 카메라가 지구에 닿는 데 걸리는 시간 — 이 동안은 글을 띄우지 않는다 */
export const CLOSEUP_SECONDS = 3.2

export function CollapseOutcome({ collapse, onReset }: { collapse: CollapseState; onReset: () => void }) {
  /*
   * 판을 바로 띄우지 않는다.
   *
   * 결말의 주인공은 글이 아니라 **행성**이다. 카메라가 지구 앞까지 밀고 들어가는
   * 동안 화면을 비워 두고, 다 닿은 뒤에야 설명을 올린다. 반대로 하면 기껏 바꿔 놓은
   * 지표를 아무도 못 보고 글만 읽게 된다.
   */
  const [showPanel, setShowPanel] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setShowPanel(true), CLOSEUP_SECONDS * 1000)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      /* pb-32 — 하단 대시보드(약 110px)를 피한다. 그냥 items-end 로 두면 되돌리기
         버튼이 대시보드 뒤로 숨어 누를 수 없다. */
      className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-6 pt-6 pb-32"
      role="alertdialog"
      aria-label={collapse.title}
    >
      {/* 클로즈업이 도는 동안 — 한 줄만 띄우고 화면을 비워 둔다 */}
      <AnimatePresence>
        {!showPanel && (
          <motion.div
            key="hold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 top-24 flex justify-center"
          >
            <span
              className="rounded-full border px-4 py-2 text-[13px] font-semibold tracking-[0.06em] backdrop-blur-md"
              style={{
                color: 'var(--color-bad)',
                borderColor: 'color-mix(in oklab, var(--color-bad) 55%, transparent)',
                background: 'color-mix(in oklab, var(--color-bad) 14%, rgb(10 15 24 / 0.7))',
              }}
            >
              {collapse.kind === 'mars' ? '대기가 벗겨지고 있습니다' : '바다가 끓어오르고 있습니다'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {showPanel && (
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="panel pointer-events-auto max-h-[62vh] w-full max-w-2xl overflow-y-auto p-6"
        style={{
          borderColor: 'color-mix(in oklab, var(--color-bad) 45%, transparent)',
          background: 'color-mix(in oklab, var(--color-space-1) 92%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="hud-badge"
            style={{
              color: 'var(--color-bad)',
              borderColor: 'color-mix(in oklab, var(--color-bad) 50%, transparent)',
              background: 'color-mix(in oklab, var(--color-bad) 14%, transparent)',
            }}
          >
            돌아올 수 없음
          </span>
          <span className="hud-title">{collapse.kind === 'mars' ? '화성 경로' : '금성 경로'}</span>
        </div>

        <h2 className="mt-2 text-[21px] leading-tight font-semibold tracking-tight">{collapse.title}</h2>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{collapse.mechanism}</p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="panel-quiet px-3.5 py-2.5">
            <div className="hud-title">실제 시간 규모</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{collapse.timescale}</p>
          </div>
          {/* 연출과 사실의 경계를 화면이 스스로 밝힌다 */}
          <div
            className="rounded-xl border px-3.5 py-2.5"
            style={{
              borderColor: 'rgb(255 255 255 / 0.12)',
              background: 'rgb(255 255 255 / 0.03)',
            }}
          >
            <div className="hud-title">사실이 아닌 것</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{collapse.caveat}</p>
          </div>
        </div>

        <p className="mt-4 border-t border-white/8 pt-3 text-[12.5px] leading-relaxed text-ink-2">
          이 시뮬레이터에는 <span className="text-ink-1">되돌리기 버튼</span>이 있습니다. 실제 지구에는 없어요 —
          그것이 임계점의 정의입니다. 원인을 되돌려도 결과는 돌아오지 않습니다.
        </p>

        <div className="mt-4 flex justify-end">
          <button type="button" className="btn btn-primary px-6" onClick={onReset}>
            처음 상태로 되돌리기
          </button>
        </div>
      </motion.div>
      )}
    </motion.div>
  )
}

/* ────────────────────  두 국면을 묶는 상태 기계  ──────────────────── */

/**
 * 선을 넘었는지 지켜보다가, 6초를 세고, 결말로 넘긴다.
 *
 * `collapse` 가 null 이 되면(= 손을 되돌리면) 세던 것을 버린다. 이미 결말에 들어간
 * 뒤에는 값이 바뀌어도 돌아오지 않는다 — 그게 이 화면의 논지다.
 */
export function useCollapse(collapse: CollapseState | null) {
  const [remaining, setRemaining] = useState(GRACE_SECONDS)
  const [done, setDone] = useState<CollapseState | null>(null)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (done) return
    if (!collapse) {
      startedAt.current = null
      setRemaining(GRACE_SECONDS)
      return
    }
    if (startedAt.current === null) startedAt.current = performance.now()
    const id = window.setInterval(() => {
      const left = GRACE_SECONDS - (performance.now() - (startedAt.current ?? 0)) / 1000
      if (left <= 0) {
        setRemaining(0)
        setDone(collapse)
      } else {
        setRemaining(left)
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [collapse, done])

  const reset = () => {
    setDone(null)
    startedAt.current = null
    setRemaining(GRACE_SECONDS)
  }

  return { warning: !done && collapse ? collapse : null, remaining, done, reset }
}

/** 경고와 결말을 한 번에 그린다 */
export function CollapseLayer({
  collapse,
  remaining,
  done,
  onReset,
}: {
  collapse: CollapseState | null
  remaining: number
  done: CollapseState | null
  onReset: () => void
}) {
  return (
    <AnimatePresence>
      {done ? (
        <CollapseOutcome key="outcome" collapse={done} onReset={onReset} />
      ) : collapse ? (
        <CollapseWarning key="warn" collapse={collapse} remaining={remaining} />
      ) : null}
    </AnimatePresence>
  )
}
