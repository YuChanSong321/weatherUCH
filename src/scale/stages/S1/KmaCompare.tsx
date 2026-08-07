/**
 * S1 채점 화면의 3자 대결 — 당신 / 기상청 / 실제.
 *
 * 여기서 가르치려는 것은 두 가지다.
 *   · 기상청도 틀린다. 슈퍼컴퓨터와 예보관이 붙어도 틀린다. 대기가 혼돈이기 때문이다.
 *   · 그런데 사람이 이기는 날도 있다. 그건 실력이 아니라 그날의 성격이었다.
 * 그래서 기상청이 어긋난 라운드는 감점의 언어가 아니라 발견의 언어로 띄운다.
 *
 * 형태: 실제 관측을 0에 놓은 오차 수직선. 막대가 아니라 점 두 개인 이유는 비교하는
 * 값이 크기가 아니라 '실제로부터 어느 쪽으로 얼마나 빗나갔는가'이기 때문이다.
 *
 * 색: 당신 = act-1, 기상청 = act-2 (앱 전체가 쓰는 고정 순서 그대로). 실제 관측은
 * 시리즈 색이 아니라 중립 잉크다 — 다른 화면과 같은 규칙이다. 세 값 모두 숫자를
 * 직접 달아 색만으로 구분되는 지점이 없게 한다.
 */
import type { ReactNode } from 'react'
import {
  PRECIP_CLASSES,
  precipClassOf,
  type ForecastCase,
  type Guess,
  type RoundScore,
} from '../../lib/forecast'

const USER = 'var(--color-act-1)'
const KMA = 'var(--color-act-2)'

const labelOfPrecip = (id: string) => PRECIP_CLASSES.find((p) => p.id === id)?.label ?? id

export function KmaCompare({
  forecastCase,
  guess,
  score,
}: {
  forecastCase: ForecastCase
  guess: Guess
  score: RoundScore
}) {
  const kma = score.kma
  const issued = forecastCase.kma
  // 그날 예보 자료가 없으면 3자 대결 자체를 접는다 (조용히 2자로 돌아간다)
  if (!kma || !issued) return null

  const actual = forecastCase.answer.tmax
  const userError = guess.tmax - actual
  const kmaError = kma.tmax - actual
  // 눈금은 최소 ±2℃ — 둘 다 잘 맞힌 날에 점 두 개가 붙어버리지 않게 한다
  const span = Math.max(2, Math.abs(userError) * 1.25, Math.abs(kmaError) * 1.25)
  const pct = (e: number) => 50 + (e / span) * 50

  return (
    <div className="panel-quiet flex flex-col gap-2.5 px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.1em] text-ink-3">최고기온 · 3자 대결</span>
        <span className="text-[10.5px] text-ink-3">
          기상청 {issued.baseDate.slice(5).replace('-', '.')} {issued.baseTime.slice(0, 2)}시 발표
          {issued._source === 'dummy' && <span className="text-ink-3"> · 합성값</span>}
        </span>
      </div>

      {/* 세 값을 나란히 */}
      <div className="grid grid-cols-3 gap-2">
        <Value label="당신" value={guess.tmax} color={USER} />
        <Value label="기상청" value={kma.tmax} color={KMA} />
        <Value label="실제" value={actual} color="var(--color-series-obs)" strong />
      </div>

      {/* 오차 수직선 — 가운데가 실제 관측 */}
      <div className="relative mt-0.5 h-9">
        <div className="absolute inset-x-0 top-4 h-px bg-white/12" />
        {/* 실제 = 기준선 */}
        <div className="absolute top-1 h-6 w-px left-1/2 -translate-x-1/2 bg-[var(--color-series-obs)]" />
        <Dot pctLeft={pct(kmaError)} color={KMA} error={kmaError} />
        <Dot pctLeft={pct(userError)} color={USER} error={userError} raised />
        <div className="absolute inset-x-0 top-[26px] flex justify-between text-[9.5px] text-ink-3">
          <span>−{span.toFixed(1)}℃</span>
          <span>실제</span>
          <span>+{span.toFixed(1)}℃</span>
        </div>
      </div>

      {/* 강수 — 등급 세 개 나란히 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/8 pt-2 text-[11.5px]">
        <span className="text-ink-3">강수</span>
        <span>
          <Swatch color={USER} /> 당신 {labelOfPrecip(guess.precip)}
        </span>
        <span>
          <Swatch color={KMA} /> 기상청 {labelOfPrecip(kma.precipClass)}
          {kma.precipProb !== null && <span className="tnum text-ink-3"> ({kma.precipProb}%)</span>}
        </span>
        <span className="text-ink-1">
          <Swatch color="var(--color-series-obs)" /> 실제{' '}
          {labelOfPrecip(precipClassOf(forecastCase.answer.precip))}
        </span>
      </div>

      <Outcome kma={kma} />
    </div>
  )
}

function Value({
  label,
  value,
  color,
  strong,
}: {
  label: string
  value: number
  color: string
  strong?: boolean
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-[10.5px] text-ink-3">
        <Swatch color={color} />
        {label}
      </div>
      <div
        className="tnum text-[17px] leading-tight font-semibold"
        style={{ color: strong ? 'var(--color-ink-1)' : undefined }}
      >
        {value.toFixed(1)}℃
      </div>
    </div>
  )
}

function Dot({
  pctLeft,
  color,
  error,
  raised,
}: {
  pctLeft: number
  color: string
  error: number
  raised?: boolean
}) {
  return (
    <div
      className="absolute -translate-x-1/2"
      style={{ left: `${pctLeft}%`, top: raised ? 8 : 20 }}
    >
      {/* 표면 링: 두 점이 겹쳐도 서로 먹지 않는다 */}
      <div
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: '0 0 0 2px var(--color-space-1)' }}
      />
      <div
        className="tnum absolute top-1/2 left-4 -translate-y-1/2 text-[10px] whitespace-nowrap"
        style={{ color: 'var(--color-ink-2)' }}
      >
        {error > 0 ? '+' : '−'}
        {Math.abs(error).toFixed(1)}
      </div>
    </div>
  )
}

const Swatch = ({ color }: { color: string }) => (
  <span
    className="inline-block h-2 w-2 shrink-0 rounded-full align-middle"
    style={{ background: color }}
  />
)

/** 이 라운드가 남기는 한 줄. 감점이 아니라 발견. */
function Outcome({ kma }: { kma: NonNullable<RoundScore['kma']> }) {
  if (kma.userWins) {
    const wide = kma.margin <= -1
    return (
      <Banner
        color="var(--color-good)"
        title={wide ? '기상청을 이기셨습니다' : '기상청보다 정확하셨습니다'}
        body={
          <>
            기상청보다 <span className="tnum font-semibold">{Math.abs(kma.margin).toFixed(1)}℃</span> 가깝게
            찍으셨어요. {kma.kmaMissed ? '이날은 예보 자체가 어려운 날이었습니다 — ' : ''}
            며칠 규모에서는 사람이 읽어낼 수 있는 신호가 실제로 남아 있습니다.
          </>
        }
      />
    )
  }
  if (kma.kmaMissed) {
    return (
      <Banner
        color="var(--color-act-3)"
        title="전문가도 틀립니다"
        body={
          <>
            수백 개의 관측소와 슈퍼컴퓨터를 쓰는 기상청도 이날은{' '}
            {kma.error >= 2 ? (
              <>
                <span className="tnum font-semibold">{kma.error.toFixed(1)}℃</span> 어긋났습니다
              </>
            ) : (
              '강수 등급을 빗나갔고요'
            )}
            . 실력이 모자라서가 아니라 <span className="text-ink-1">대기가 혼돈이기 때문</span>입니다 — 초기 상태의
            아주 작은 오차가 며칠마다 두 배로 자라거든요.
          </>
        }
      />
    )
  }
  return (
    <p className="text-[11.5px] leading-relaxed text-ink-3">
      이날은 기상청이 <span className="tnum">{Math.abs(kma.margin).toFixed(1)}℃</span> 더 정확했습니다. 관측망 전체와
      수치모델을 가진 쪽이 유리한 게 당연하고요 — 그런데도 그 격차는 며칠 뒤면 사라집니다.
    </p>
  )
}

function Banner({ color, title, body }: { color: string; title: string; body: ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: `color-mix(in oklab, ${color} 42%, transparent)`,
        background: `color-mix(in oklab, ${color} 13%, transparent)`,
      }}
    >
      <div className="text-[12.5px] font-semibold" style={{ color }}>
        {title}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2">{body}</p>
    </div>
  )
}
