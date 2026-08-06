/**
 * 상단 시간 규모 자 (ruler). 단계가 넘어갈 때 마커가 오른쪽으로 미끄러지며
 * "카메라가 뒤로 물러난다"는 감각을 하나의 연속된 여정으로 묶어준다.
 */
import { STAGE_SCALE, type Stage } from '../state/journey'

/** 로그 시간축 위의 위치(0~1) — 하루에서 수만 년까지 */
const POSITION: Record<Stage, number> = {
  s0: 0.02,
  s1: 0.08,
  s2: 0.24,
  s3: 0.44,
  s4: 0.5,
  s5: 0.62,
  s6: 0.9,
  s7: 0.97,
}

const TICKS = [
  { at: 0.06, label: '하루' },
  { at: 0.24, label: '한 해' },
  { at: 0.46, label: '수십 년' },
  { at: 0.66, label: '100년' },
  { at: 0.9, label: '수만 년' },
]

const ACT_COLOR: Record<1 | 2 | 3, string> = {
  1: 'var(--color-act-1)',
  2: 'var(--color-act-2)',
  3: 'var(--color-act-3)',
}

export function ScaleRail({ stage, score }: { stage: Stage; score: { earned: number; max: number } }) {
  const meta = STAGE_SCALE[stage]
  const color = ACT_COLOR[meta.act]
  const pos = POSITION[stage]

  return (
    <header className="flex items-center gap-6 px-8 py-4">
      <div className="flex min-w-[13rem] items-center gap-3">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 12px ${color}` }}
        />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">예측의 스케일</div>
          <div className="text-[11px] text-ink-3">{meta.caption}</div>
        </div>
      </div>

      <div className="relative h-9 flex-1">
        <div className="absolute top-4 h-px w-full bg-white/12" />
        {TICKS.map((t) => (
          <div key={t.label} className="absolute top-0" style={{ left: `${t.at * 100}%` }}>
            <div className="h-3 w-px translate-y-2.5 bg-white/25" />
            <div className="-translate-x-1/2 pt-1 text-[10px] whitespace-nowrap text-ink-3">{t.label}</div>
          </div>
        ))}
        <div
          className="absolute top-4 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ left: `${pos * 100}%` }}
        >
          <div
            className="h-3.5 w-3.5 rounded-full border-2"
            style={{ borderColor: color, background: 'var(--color-space-0)', boxShadow: `0 0 14px ${color}` }}
          />
        </div>
      </div>

      <div className="min-w-[7.5rem] text-right">
        <div className="tnum text-[13px] font-semibold" style={{ color }}>
          {score.earned}
          <span className="text-ink-3"> / {score.max}</span>
        </div>
        <div className="text-[11px] text-ink-3">시간 규모 · {meta.scaleLabel}</div>
      </div>
    </header>
  )
}
