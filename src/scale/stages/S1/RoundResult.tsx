/** S1 채점 결과 — "틀렸다"가 아니라 "무엇이 어긋났고 왜 그랬는지, 예보관은 어떻게 하는지". */
import { KmaCompare } from './KmaCompare'
import { MethodPanel } from './MethodPanel'
import { usePlace } from '../../state/place'
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
  const { today } = forecastCase
  // 라운드가 물은 날이 곧 열어볼 날이다. R3 는 사흘 뒤를 물었으니 사흘 뒤를 연다.
  const answer = forecastCase.kind === 'tmax3' ? forecastCase.answer3 : forecastCase.answer
  const actualClass = precipClassOf(answer.precip)
  const actualPrecipLabel = PRECIP_CLASSES.find((p) => p.id === actualClass)!.label
  const userTemp = forecastCase.kind === 'tmax3' ? guess.tmax3 : guess.tmax

  /*
   * R1 과 R2 는 같은 날(내일)을 묻는다 — R1 은 기온, R2 는 강수. 그래서 R1 결과에서
   * 내일의 강수를 열어버리면 다음 라운드의 4지선다 답을 그대로 알려주는 셈이 된다.
   * 하늘 상태도 같다 ('흐림'이면 비, '맑음'이면 비 없음). 아직 묻지 않은 것은 봉인한다
   * — KmaCompare 와 상단 기상특보 배지가 이미 쓰고 있는 규칙 그대로다.
   */
  const precipSealed = forecastCase.kind === 'tmax'

  /* 방법론 칸은 이 지역의 관측 전체를 본다 — 기후값 평균과 강수 지속성 통계를 여기서 낸다 */
  const { place } = usePlace()

  return (
    <section className="panel rise flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {forecastCase.kind === 'tmax3' ? '사흘 뒤가 도착했습니다' : '내일이 도착했습니다'}
        </h2>
        <span className="tnum text-[12px]">
          <span className="font-semibold">{score.earned}</span>
          <span className="text-ink-3"> / {score.max}점</span>
        </span>
      </div>

      {/* 실제 관측 */}
      <div className="panel-quiet grid grid-cols-4 gap-2 px-3 py-2.5 text-center">
        <Fact
          label="최고기온"
          value={`${answer.tmax.toFixed(1)}℃`}
          sub={userTemp === undefined ? '이 라운드는 강수' : `당신 ${userTemp.toFixed(1)}℃`}
        />
        {precipSealed ? (
          <Fact label="강수" value="?" sub="다음 라운드 문제" sealed />
        ) : (
          <Fact label="강수" value={answer.precip > 0 ? `${answer.precip} mm` : '없음'} sub={actualPrecipLabel} />
        )}
        <Fact
          label="일교차"
          value={`${dtrOf(answer).toFixed(1)}℃`}
          sub={precipSealed ? `최저 ${answer.tmin.toFixed(1)}℃` : `하늘 ${skyOf(answer.cloud)}`}
        />
        <Fact label="바람" value={`${answer.windDir} ${answer.windSpeed.toFixed(1)}`} sub={`${answer.windDeg}°`} />
      </div>

      {/* 3자 대결 — 당신 / 기상청 / 실제 */}
      <KmaCompare forecastCase={forecastCase} guess={guess} score={score} />

      {/* 항목별 채점 + 해설 */}
      <div className="flex flex-col gap-2">
        {score.items.map((item) => {
          const style = VERDICT_STYLE[item.verdict]
          return (
            <div key={item.label} className="panel-quiet px-3.5 py-2.5">
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

      {/* 예보관의 방법 — 같은 문제를 표준 방법으로 다시 풀어본다 */}
      {place && <MethodPanel records={place.records} forecastCase={forecastCase} guess={guess} />}

      {/* 라운드가 가르친 규칙 */}
      <div
        className="rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed"
        style={{
          borderColor: 'color-mix(in oklab, var(--color-act-1) 40%, transparent)',
          background: 'color-mix(in oklab, var(--color-act-1) 12%, transparent)',
        }}
      >
        {score.lesson}
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="tnum text-[11px] text-ink-3">
          오늘 {today.tmax.toFixed(1)}℃ → {forecastCase.kind === 'tmax3' ? '사흘 뒤' : '내일'}{' '}
          {answer.tmax.toFixed(1)}℃ (변화 {answer.tmax - today.tmax > 0 ? '+' : ''}
          {(answer.tmax - today.tmax).toFixed(1)}℃)
        </span>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {isLastRound ? '3라운드 결과 보기' : '다음 라운드'}
        </button>
      </div>
    </section>
  )
}

function Fact({
  label,
  value,
  sub,
  sealed,
}: {
  label: string
  value: string
  sub: string
  /** 아직 묻지 않은 항목. 비어 보이는 대신 '아직 열지 않았다'로 읽히게 흐린다. */
  sealed?: boolean
}) {
  return (
    <div>
      <div className="text-[10.5px] text-ink-3">{label}</div>
      <div className={`tnum text-[15px] font-semibold ${sealed ? 'text-ink-3' : ''}`}>{value}</div>
      <div className="tnum text-[10.5px] text-ink-3">{sub}</div>
    </div>
  )
}
