/** S1 채점 결과 — "틀렸다"가 아니라 "무엇이 어긋났고 왜 그랬는지". */
import { dtrOf, skyOf, type ForecastCase, type Guess, type ItemScore, type RoundScore } from '../../lib/forecast'
import { PRECIP_CLASSES, precipClassOf } from '../../lib/forecast'

const VERDICT_STYLE: Record<ItemScore['verdict'], { color: string; label: string }> = {
  hit: { color: 'var(--color-good)', label: '적중' },
  near: { color: 'var(--color-warn)', label: '근접' },
  miss: { color: 'var(--color-bad)', label: '어긋남' },
}

export function RoundResult({
  forecastCase,
  guess,
  score,
  isLastRound,
  onNext,
}: {
  forecastCase: ForecastCase
  guess: Guess
  score: RoundScore
  isLastRound: boolean
  onNext: () => void
}) {
  const { answer, today } = forecastCase
  const actualClass = precipClassOf(answer.precip)
  const actualPrecipLabel = PRECIP_CLASSES.find((p) => p.id === actualClass)!.label

  return (
    <section className="panel rise flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">내일이 도착했다</h2>
        <span className="tnum text-[12px]">
          <span className="font-semibold">{score.earned}</span>
          <span className="text-ink-3"> / {score.max}점</span>
        </span>
      </div>

      {/* 실제 관측 */}
      <div className="panel-quiet grid grid-cols-4 gap-2 px-3 py-3 text-center">
        <Fact label="최고기온" value={`${answer.tmax.toFixed(1)}℃`} sub={`예보 ${guess.tmax.toFixed(1)}℃`} />
        <Fact label="강수" value={answer.precip > 0 ? `${answer.precip} mm` : '없음'} sub={actualPrecipLabel} />
        <Fact label="일교차" value={`${dtrOf(answer).toFixed(1)}℃`} sub={`하늘 ${skyOf(answer.cloud)}`} />
        <Fact label="바람" value={`${answer.windDir} ${answer.windSpeed.toFixed(1)}`} sub={`${answer.windDeg}°`} />
      </div>

      {/* 항목별 채점 + 해설 */}
      <div className="flex flex-col gap-2.5">
        {score.items.map((item) => {
          const style = VERDICT_STYLE[item.verdict]
          return (
            <div key={item.label} className="panel-quiet px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                  style={{ background: `color-mix(in oklab, ${style.color} 26%, transparent)`, color: style.color }}
                >
                  {style.label}
                </span>
                <span className="text-[12.5px] font-medium">{item.label}</span>
                <span className="tnum ml-auto text-[11.5px] text-ink-2">
                  +{item.earned}
                  <span className="text-ink-3">/{item.max}</span>
                </span>
              </div>
              <div className="mt-1.5 text-[12.5px] font-medium text-ink-1">{item.headline}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{item.why}</p>
            </div>
          )
        })}
      </div>

      {/* 라운드가 가르친 규칙 */}
      <div
        className="rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed"
        style={{
          borderColor: 'color-mix(in oklab, var(--color-act-1) 40%, transparent)',
          background: 'color-mix(in oklab, var(--color-act-1) 12%, transparent)',
        }}
      >
        {score.lesson}
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="tnum text-[11px] text-ink-3">
          오늘 {today.tmax.toFixed(1)}℃ → 내일 {answer.tmax.toFixed(1)}℃ (변화{' '}
          {forecastCase.features.tmaxDelta > 0 ? '+' : ''}
          {forecastCase.features.tmaxDelta.toFixed(1)}℃)
        </span>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {isLastRound ? '3라운드 결과 보기' : '다음 라운드'}
        </button>
      </div>
    </section>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-ink-3">{label}</div>
      <div className="tnum text-[15px] font-semibold">{value}</div>
      <div className="tnum text-[10.5px] text-ink-3">{sub}</div>
    </div>
  )
}
