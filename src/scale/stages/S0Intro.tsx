/**
 * S0 · 도전장. 설명 화면 없음 — 10초 안에 첫 조작으로 들어간다.
 * 여기서 던지는 질문은 S7에서 그대로 회수된다.
 */
import { CITY, isAllSynthetic, isDummyData, syntheticLabels } from '../data/loader'
import type { ForecastCase } from '../lib/forecast'

const monthOf = (iso: string) => `${iso.slice(0, 4)}년 ${Number(iso.slice(5, 7))}월`

export function S0Intro({ firstCase, onStart }: { firstCase: ForecastCase; onStart: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center rise">
      <div className="text-[12px] font-medium tracking-[0.22em] text-act-1">
        {CITY} · {monthOf(firstCase.today.date)}
      </div>

      <h1 className="mt-5 text-[46px] leading-[1.12] font-semibold tracking-[-0.02em]">
        당신은 며칠 앞을
        <br />
        맞힐 수 있을까요?
      </h1>

      <p className="mt-5 max-w-md text-[14px] leading-relaxed text-ink-2">
        관측 자료 3일치만 드립니다. 내일의 기온과 비를 찍어보세요.
        <br />
        어긋나도 괜찮습니다 — 어긋나는 지점이 이 콘텐츠의 주제니까요.
      </p>

      <button type="button" className="btn btn-primary mt-9 px-8 py-3.5 text-[15px]" onClick={onStart}>
        예보 시작하기
      </button>

      <div className="mt-10 flex items-center gap-2 text-[11px] text-ink-3">
        <span className="pulse-soft">며칠</span>
        <span className="h-px w-6 bg-white/15" />
        <span>수십 년</span>
        <span className="h-px w-6 bg-white/15" />
        <span>수만 년</span>
        <span className="ml-1 text-ink-3/70">— 세 번의 줌아웃</span>
      </div>

      {isDummyData && (
        <div className="mt-8 text-[10.5px] text-ink-3/80">
          {isAllSynthetic
            ? '현재 표시되는 값은 스키마 검증용 합성 데이터입니다 (실측 자료로 교체 예정)'
            : `관측 자료는 기상청 실측입니다 — ${syntheticLabels.join(' · ')}만 아직 실측이 아닙니다`}
        </div>
      )}
    </div>
  )
}
