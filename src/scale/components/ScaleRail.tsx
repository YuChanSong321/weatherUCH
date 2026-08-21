/**
 * 상단 시간 규모 자 (ruler). 단계가 넘어갈 때 마커가 오른쪽으로 미끄러지며
 * "카메라가 뒤로 물러난다"는 감각을 하나의 연속된 여정으로 묶어준다.
 */
import { Attribution } from './Attribution'
import { STAGE_SCALE, useJourney, type Stage } from '../state/journey'

/**
 * 눈금 — 자 위에 이름이 붙는 자리이자, **그 단계로 건너뛰는 버튼**.
 *
 * 마커 위치는 이 표에서 파생시킨다(아래 POSITION). 두 표를 손으로 따로 적어두면
 * 반드시 어긋난다 — 실제로 s3 마커가 44%, '수십 년' 눈금이 46% 여서 점이 글자
 * 옆에 비스듬히 서 있었다. 눈금을 옮기면 마커도 따라 움직여야 한다.
 *
 * `stage` 는 그 눈금을 누르면 갈 곳이다. s4(빈 해)는 s3 와 같은 '수십 년' 규모라
 * 눈금을 따로 두지 않는다 — 규모가 같은데 자 위에 두 점이 서면 그것이 거짓말이다.
 */
const TICKS = {
  day: { at: 0.05, label: '하루', stage: 's1' },
  year: { at: 0.22, label: '한 해', stage: 's2' },
  decades: { at: 0.44, label: '수십 년', stage: 's3' },
  century: { at: 0.63, label: '100년', stage: 's5' },
  myriad: { at: 0.84, label: '수만 년', stage: 's6' },
  threshold: { at: 0.96, label: '임계', stage: 's7' },
} as const satisfies Record<string, { at: number; label: string; stage: Stage }>

const TICK_LIST = Object.values(TICKS)

/**
 * 로그 시간축 위의 위치(0~1) — 하루에서 수만 년까지.
 *
 * ⚠️ 반드시 단조 **비감소**. 마커가 한 번이라도 왼쪽으로 되돌아가면 "한 방향 줌아웃"
 * 이라는 이 콘텐츠의 전제가 그 자리에서 무너진다.
 *
 * 이름이 붙은 규모에 서 있는 단계는 그 눈금 값을 그대로 쓴다 — 점이 글자 한가운데에
 * 서야 "지금 여기"가 읽힌다. s3·s4 가 같은 값인 것은 버그가 아니다: 둘 다 '수십 년'
 * 규모이고, 규모가 같은데 마커만 움직이면 그것이 거짓말이다.
 */
const POSITION: Record<Stage, number> = {
  s0: 0.015, // 아직 규모가 없다 — 첫 눈금 앞에 선다
  s1: TICKS.day.at,
  s2: TICKS.year.at,
  s3: TICKS.decades.at,
  s4: TICKS.decades.at,
  s5: TICKS.century.at,
  s6: TICKS.myriad.at,
  s7: TICKS.threshold.at,
  s8: 0.995, // 여정의 끝 — 자의 오른쪽 끝을 넘어선 자리
}

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

      <div className="relative hidden h-11 flex-1 lg:block">
        <div className="absolute top-4 h-px w-full bg-white/12" />
        {TICK_LIST.map((t) => (
          <ScaleTick key={t.label} tick={t} current={stage} />
        ))}
        {/*
          마커는 눌리지 않는다 — 클릭은 눈금 버튼이 받는다. 마커가 위에 떠서 그 밑의
          버튼을 가리면, 지금 서 있는 칸만 유독 안 눌리는 화면이 된다.
        */}
        <div
          className="pointer-events-none absolute top-4 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ left: `${pos * 100}%` }}
        >
          <div
            className="h-3.5 w-3.5 rounded-full border-2"
            style={{ borderColor: color, background: 'var(--color-space-0)', boxShadow: `0 0 14px ${color}` }}
          />
        </div>
      </div>

      <StageNav />

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


/**
 * 복습용 앞뒤 이동.
 *
 * 여정은 한 방향으로 흐르지만, 한 마디를 놓친 사람이 처음부터 다시 시작하는 수밖에
 * 없으면 그건 학습 콘텐츠가 아니다. 지나온 단계는 언제든 다시 보고, 보던 자리로
 * 돌아올 수 있어야 한다.
 *
 * 앞으로 가기는 **가본 곳까지만** 열린다. 앞질러 가면 안 푼 단계의 점수가 빈 채로
 * 결과 화면에 도착하고, "내가 만든 것이 남는다"는 이 콘텐츠의 약속이 깨진다.
 */
function StageNav() {
  const { back, forward, canBack, canForward } = useJourney()
  /* canForward 는 '가본 곳까지'였는데, 시간 자가 아무 데나 열리는 이상 화살표만
     막아둘 이유가 없다. 마지막 단계에서만 잠근다. */
  const btn =
    'grid h-7 w-7 place-items-center rounded-full border border-white/10 text-[13px] leading-none ' +
    'text-ink-3 transition-colors hover:border-white/25 hover:text-ink-1 ' +
    'disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-white/10 disabled:hover:text-ink-3'
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} onClick={back} disabled={!canBack} aria-label="이전 단계 다시 보기">
        ‹
      </button>
      <button
        type="button"
        className={btn}
        onClick={forward}
        disabled={!canForward}
        aria-label="보던 단계로 돌아가기"
        title={canForward ? '보던 단계로 돌아가기' : '아직 가보지 않은 단계입니다'}
      >
        ›
      </button>
    </div>
  )
}


/**
 * 눈금 하나 = 그 시간 규모로 건너뛰는 버튼.
 *
 * 아직 안 지난 단계도 **누를 수 있다.** 처음에는 가본 곳까지만 열었는데, 두 가지가
 * 걸렸다. 하나는 주소 해시(`#s5`)로는 어차피 아무 데나 갈 수 있고 앱이 그걸 견디도록
 * 만들어져 있어서 잠금이 실제로 막아주는 것이 없다는 점. 다른 하나는 처음 실행했을 때
 * 자 전체가 잠긴 채로 떠서 고장난 화면처럼 보인다는 점이다.
 *
 * 대신 **지나온 칸과 아직인 칸을 밝기로 구분한다** — 앞으로 갈 길이 남았다는 감각은
 * 유지하면서, 발표 중에 원하는 규모로 바로 뛸 수 있다. 앞질러 가면 그 단계의 점수는
 * 비어 있는 채로 결과 화면에 도착하는데, 그건 누른 사람의 선택이다.
 */
function ScaleTick({
  tick,
  current,
}: {
  tick: { at: number; label: string; stage: Stage }
  current: Stage
}) {
  const { go, canJump } = useJourney()
  /** 이미 지나온 칸인가 — 막는 데 쓰지 않고 밝기에만 쓴다 */
  const visited = canJump(tick.stage)
  // s3·s4 는 같은 '수십 년' 눈금을 쓴다 — 둘 중 어디에 있어도 이 칸이 지금 자리다
  const here = POSITION[current] === tick.at
  const color = ACT_COLOR[STAGE_SCALE[tick.stage].act]

  return (
    <div className="absolute top-0" style={{ left: `${tick.at * 100}%` }}>
      <div
        className="h-3 w-px translate-y-2.5 transition-colors"
        style={{ background: here ? color : visited ? 'rgb(255 255 255 / 0.25)' : 'rgb(255 255 255 / 0.12)' }}
      />
      <button
        type="button"
        onClick={() => go(tick.stage)}
        aria-current={here ? 'step' : undefined}
        title={visited ? `${tick.label} 단계로 이동` : `${tick.label} 단계로 건너뛰기 (아직 지나지 않은 단계입니다)`}
        /* pt-3.5 — 마커(지름 14px, 중심 16px)가 라벨을 덮지 않게 그 아래로 내린다.
           예전에는 현재 단계의 글자 위에 마커가 정확히 얹혀 가장 읽혀야 할 칸이
           가려졌다. */
        className="-translate-x-1/2 mt-3.5 cursor-pointer rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap transition-colors hover:bg-white/8 hover:text-ink-1"
        style={{
          color: here ? color : 'var(--color-ink-3)',
          opacity: here || visited ? 1 : 0.45,
          fontWeight: here ? 600 : 400,
        }}
      >
        {tick.label}
      </button>
    </div>
  )
}
