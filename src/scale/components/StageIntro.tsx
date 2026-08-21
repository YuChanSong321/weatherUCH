/**
 * 단계 도입부 — 안내 세 마디를 **한 번에 하나씩** 거친 뒤 본 화면을 연다.
 *
 * 왜 이렇게 바꿨나.
 * 처음에는 같은 내용을 [StageBrief] 로 헤더 아래 3열 띠에 한꺼번에 깔았다. 정보는
 * 다 있었지만 "그래프가 메인처럼 보이고 그 위아래로 글이 붙어 시선이 분산된다,
 * 난잡하다"는 지적을 받았다. 맞는 말이다 — 한 화면에 시작점이 여러 개면 읽는 사람이
 * 순서를 직접 정해야 하고, 그 순간 흐름이 끊긴다.
 *
 * 그래서 시선이 갈 곳을 **매 순간 하나만** 둔다.
 *   ① 지금 할 일 → ② 여기서 배우는 개념 → ③ 이 개념이 쓰이는 곳 → 본 화면(그래프)
 * 한 카드에 한 마디씩, 가운데 하나만 띄운다. 다음을 누르는 동작 자체가 진행이 되고,
 * 발표자는 버튼 세 번으로 이야기를 끌고 갈 수 있다.
 *
 * 도입을 지난 뒤에는 사라지지 않고 **한 줄로 접혀** 화면 위에 남는다. "내가 지금 뭘
 * 배우는 중이었지"를 다시 확인할 자리는 있어야 하기 때문이다. 다시 보기로 펼친다.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export type IntroStep = {
  /** 칸 이름 — "지금 할 일" 처럼 짧게 */
  label: string
  /** 한 마디. 세 줄을 넘기지 말 것 — 넘기는 순간 이 컴포넌트의 존재 이유가 사라진다. */
  body: ReactNode
  /** 접힌 뒤 한 줄로 남길 요약 (없으면 남기지 않는다) */
  chip?: string
}

export function StageIntro({
  eyebrow,
  steps,
  tone,
  onDone,
}: {
  /** 단계 표시 — "2단계 · 수십 년" */
  eyebrow: string
  steps: IntroStep[]
  tone: string
  onDone: () => void
}) {
  const [i, setI] = useState(0)
  const last = i === steps.length - 1
  const step = steps[i]

  const advance = () => (last ? onDone() : setI((n) => n + 1))
  const back = () => setI((n) => Math.max(0, n - 1))

  // 발표 중 손이 마우스에서 떨어져 있어도 넘길 수 있어야 한다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') advance()
      if (e.key === 'ArrowLeft') back()
      if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="pointer-events-auto mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-6 text-center">
      {/*
        3D 지구가 늘 뒤에 있고, 단계에 따라서는 태양 광원이 바로 이 자리에 온다.
        머리말만 판 밖에 떠 있으면 그 위에서 통째로 사라진다 — 실제로 S6(수만 년)
        에서 안 읽혔다. 카드 본문과 같은 판을 얇게 깔아 준다.
      */}
      <div
        className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium tracking-[0.14em] backdrop-blur-md"
        style={{ color: tone, background: 'color-mix(in oklab, var(--color-space-1) 82%, transparent)' }}
      >
        {eyebrow}
      </div>

      {/* 진행 막대 — 지나온 칸은 채우고 남은 칸은 비운다. 몇 걸음 남았는지가 보여야 한다. */}
      <div
        className="flex items-center gap-1.5 rounded-full px-2 py-1.5 backdrop-blur-md"
        style={{ background: 'color-mix(in oklab, var(--color-space-1) 70%, transparent)' }}
        aria-hidden
      >
        {steps.map((s, n) => (
          <span
            key={s.label}
            className="h-[3px] rounded-full transition-all duration-500"
            style={{
              width: n === i ? 40 : 22,
              background: n <= i ? tone : 'rgb(255 255 255 / 0.16)',
            }}
          />
        ))}
      </div>

      {/* 3D 지구가 늘 뒤에 있으므로 카드는 항상 불투명 판 + 블러다. 반투명으로 두면
          대륙의 밝은 부분과 글자가 섞여, 한 문장만 읽히게 하려던 의도가 무너진다. */}
      <div
        className="flex min-h-[13.5rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 px-8 py-9 backdrop-blur-md"
        style={{ background: 'color-mix(in oklab, var(--color-space-1) 88%, transparent)' }}
      >
        {/*
          mode="wait" — 앞 카드가 완전히 빠진 뒤 다음 카드가 올라온다. 두 문장이 한
          순간이라도 겹쳐 보이면 "하나만 읽으면 된다"는 이 화면의 약속이 깨진다.
        */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <span className="tnum text-[12px] font-semibold" style={{ color: tone }}>
                {i + 1}
              </span>
              <span className="text-[12px] font-medium tracking-[0.06em] text-ink-3">/ {steps.length}</span>
              <span className="mx-1 h-3 w-px bg-white/15" />
              <span className="text-[13px] font-semibold" style={{ color: tone }}>
                {step.label}
              </span>
            </div>
            <p className="max-w-xl text-[17px] leading-[1.65] font-medium tracking-tight text-ink-1">
              {step.body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/*
        되돌아갈 문을 만들어 둔다.
        키보드 ←(왼쪽 화살표)로는 원래 돌아갈 수 있었지만 화면에는 '다음'만 있어서,
        한 마디 놓치면 처음부터 다시 들어와야 하는 것처럼 보였다.

        첫 카드에서도 버튼을 지우지 않고 흐리게(disabled) 둔다 — 카드를 넘길 때마다
        버튼 줄의 폭이 달라지면 '다음'의 위치가 흔들려서, 발표 중에 같은 자리를 반복해
        누르기가 어려워진다.
      */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost px-5 py-2.5 text-[13px]"
          onClick={back}
          disabled={i === 0}
        >
          이전
        </button>
        <button type="button" className="btn btn-primary px-7 py-2.5 text-[13.5px]" onClick={advance}>
          {last ? '시작하기' : '다음'}
        </button>
        {!last && (
          <button type="button" className="ml-1 text-[11.5px] text-ink-3 hover:text-ink-2" onClick={onDone}>
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * 도입을 지난 뒤 화면 위에 남는 한 줄.
 * 자리를 거의 쓰지 않으면서 "지금 배우는 것"을 계속 붙들어 둔다.
 */
export function StageIntroBar({
  chip,
  tone,
  label = '배우는 개념',
  replayLabel = '안내 다시 보기',
  overGlobe = false,
  onReplay,
}: {
  chip: string
  tone: string
  /** 띠의 이름 — 단계에서는 '배우는 개념', 정리 화면에서는 '예보의 방법' 같은 것 */
  label?: string
  replayLabel?: string
  overGlobe?: boolean
  onReplay: () => void
}) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 self-start rounded-full border border-white/8 py-1 pr-1 pl-3 ${
        overGlobe ? 'backdrop-blur-md' : ''
      }`}
      style={{
        background: overGlobe
          ? 'color-mix(in oklab, var(--color-space-1) 80%, transparent)'
          : 'rgb(255 255 255 / 0.03)',
      }}
    >
      <span className="text-[10px] font-medium tracking-[0.1em] whitespace-nowrap" style={{ color: tone }}>
        {label}
      </span>
      <span className="truncate text-[11.5px] text-ink-2">{chip}</span>
      <button
        type="button"
        onClick={onReplay}
        className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] text-ink-3 transition-colors hover:bg-white/6 hover:text-ink-1"
      >
        {replayLabel}
      </button>
    </div>
  )
}
