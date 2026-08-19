/**
 * 각 화면의 학습 안내 — "지금 뭘 하고, 뭘 배우고, 그게 어디에 쓰이나".
 *
 * 왜 필요한가: 조작은 재미있는데 **무엇을 배우는 중인지** 모르겠다는 지적이
 * 있었다. 물리적 인과(슬라이더를 밀면 지구가 변한다)는 화면이 이미 잘 보여주지만,
 * 개념적 학습(이 개념의 이름이 무엇이고 실제로 어디에 쓰이는지)은 어디에도 적혀
 * 있지 않았다.
 *
 * 설계 원칙 두 가지:
 *   1. 기획안 §2 "조작 먼저, 설명 나중" 을 깨지 않는다 — 그래서 화면을 막는 모달이
 *      아니라 헤더 아래 한 줄짜리 띠다. 읽지 않아도 조작은 시작된다.
 *   2. 발표 10분 안에 들어가야 하므로 접었다 펴는 동작을 요구하지 않는다. 항상
 *      보이되, 셋으로 쪼개 한 칸이 한 호흡에 읽히게 한다.
 */
import type { ReactNode } from 'react'

export function StageBrief({
  doing,
  learning,
  using,
  tone = 'var(--color-act-2)',
  overGlobe = false,
}: {
  /** 지금 손으로 할 일 */
  doing: ReactNode
  /** 그 조작이 가르치는 개념 (이름을 반드시 포함할 것) */
  learning: ReactNode
  /** 그 개념이 교실 밖에서 쓰이는 자리 */
  using: ReactNode
  tone?: string
  /**
   * 3D 지구 위에 얹히는 단계인가.
   * 기본 배경(흰색 3%)은 어두운 무대에서는 충분하지만 지구본의 밝은 대륙 위에서는
   * 글자가 지형에 섞여 읽히지 않는다. 그런 단계에서는 불투명한 판을 깐다.
   */
  overGlobe?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-x-5 gap-y-2 rounded-xl border border-white/8 px-4 py-2.5 sm:grid-cols-3 ${
        overGlobe ? 'backdrop-blur-md' : ''
      }`}
      style={{
        background: overGlobe
          ? 'color-mix(in oklab, var(--color-space-1) 78%, transparent)'
          : 'rgb(255 255 255 / 0.03)',
      }}
    >
      <Cell label="지금 할 일" tone={tone}>
        {doing}
      </Cell>
      <Cell label="여기서 배우는 개념" tone={tone}>
        {learning}
      </Cell>
      <Cell label="이 개념이 쓰이는 곳" tone={tone}>
        {using}
      </Cell>
    </div>
  )
}

function Cell({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-medium tracking-[0.12em] whitespace-nowrap" style={{ color: tone }}>
        {label}
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{children}</p>
    </div>
  )
}
