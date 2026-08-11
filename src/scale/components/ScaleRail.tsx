/**
 * 상단 시간 규모 자 (ruler). 단계가 넘어갈 때 마커가 오른쪽으로 미끄러지며
 * "카메라가 뒤로 물러난다"는 감각을 하나의 연속된 여정으로 묶어준다.
 */
import { Attribution } from './Attribution'
import { STAGE_SCALE, type Stage } from '../state/journey'

/**
 * 로그 시간축 위의 위치(0~1) — 하루에서 수만 년까지.
 *
 * ⚠️ 반드시 단조 증가. 마커가 한 번이라도 왼쪽으로 되돌아가면 "한 방향 줌아웃"이라는
 * 이 콘텐츠의 전제가 그 자리에서 무너진다. 단계 순서를 바꿀 때 이 표도 같이 봐야 한다.
 */
const POSITION: Record<Stage, number> = {
  s0: 0.02,
  s1: 0.08,
  s2: 0.24,
  s3: 0.44,
  s4: 0.5,
  s5: 0.66,
  s6: 0.9,
  s7: 0.94,
  s8: 0.99,
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

export function ScaleRail({
  stage,
  score,
  placeLabel,
}: {
  stage: Stage
  score: { earned: number; max: number }
  /** S0 에서 고른 지역 이름. 캡션의 {place} 를 이걸로 바꾼다. */
  placeLabel: string
}) {
  const meta = STAGE_SCALE[stage]
  const caption = meta.caption.replace('{place}', placeLabel)
  const color = ACT_COLOR[meta.act]
  const pos = POSITION[stage]

  return (
    <header className="relative z-20 flex items-center gap-3 px-4 py-3 md:gap-6 md:px-8 md:py-4">
      <div className="flex min-w-0 items-center gap-3 md:min-w-[13rem]">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 12px ${color}` }}
        />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">예측의 스케일</div>
          <div className="truncate text-[11px] text-ink-3">{caption}</div>
        </div>
      </div>

      <div className="relative hidden h-9 flex-1 lg:block">
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

      {/* 자료 출처 — 대회 규정상 상시 노출이어야 한다 */}
      <Attribution />

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
