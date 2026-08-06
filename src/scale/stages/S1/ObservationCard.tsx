/** S1 좌측 — "오늘까지의 관측". 사용자가 예측의 근거로 삼을 유일한 정보. */
import { Sparkline } from '../../components/Sparkline'
import { dtrOf, skyOf, type ForecastCase } from '../../lib/forecast'
import type { DailyRecord } from '../../types'

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${y}. ${Number(m)}. ${Number(d)}.`
}

const dayLabels = ['이틀 전', '어제', '오늘']

const trendText = (delta: number, unit: string) =>
  `${delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} ${Math.abs(delta).toFixed(unit === 'hPa' ? 1 : 0)}${unit}`

const trendColor = (delta: number, invert = false) => {
  const rising = invert ? delta < 0 : delta > 0
  if (Math.abs(delta) < 0.4) return 'var(--color-ink-3)'
  return rising ? 'var(--color-act-1)' : 'var(--color-bad)'
}

export function ObservationCard({ forecastCase }: { forecastCase: ForecastCase }) {
  const { history, today, features } = forecastCase

  return (
    <section className="panel flex flex-col gap-3.5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">오늘까지의 관측</h2>
        <span className="text-[11px] text-ink-3">부산 · {fmtDate(today.date)}</span>
      </div>

      {/* 3일 관측 표 */}
      <div className="grid grid-cols-[4.6rem_repeat(3,1fr)] gap-x-2 gap-y-1.5 text-[12px]">
        <div />
        {history.map((r, i) => (
          <div
            key={r.date}
            className={`text-center text-[11px] ${i === 2 ? 'font-semibold text-ink-1' : 'text-ink-3'}`}
          >
            {dayLabels[i]}
            <div className="text-[10px] text-ink-3">{r.date.slice(5).replace('-', '. ')}</div>
          </div>
        ))}

        <Row label="최고기온" recs={history} render={(r) => `${r.tmax.toFixed(1)}℃`} strong />
        <Row label="최저기온" recs={history} render={(r) => `${r.tmin.toFixed(1)}℃`} />
        <Row label="일교차" recs={history} render={(r) => `${dtrOf(r).toFixed(1)}℃`} />
        <Row label="강수" recs={history} render={(r) => (r.precip > 0 ? `${r.precip} mm` : '—')} />
        <Row label="습도" recs={history} render={(r) => `${r.humidity}%`} />
        <Row label="기압" recs={history} render={(r) => `${r.pressure.toFixed(1)}`} />
        <Row label="바람" recs={history} render={(r) => `${r.windDir} ${r.windSpeed.toFixed(1)}`} />
        <Row label="하늘" recs={history} render={(r) => skyOf(r.cloud)} />
      </div>

      {/* 오늘의 변화 신호 — 예측의 재료 */}
      <div className="grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
        <SignalTile
          title="기압 흐름"
          value={`${today.pressure.toFixed(1)} hPa`}
          delta={trendText(features.pressureTrend, 'hPa')}
          deltaColor={trendColor(features.pressureTrend)}
          values={history.map((r) => r.pressure)}
        />
        <SignalTile
          title="습도 흐름"
          value={`${today.humidity}%`}
          delta={trendText(features.humidityTrend, '%p')}
          deltaColor={trendColor(features.humidityTrend, true)}
          values={history.map((r) => r.humidity)}
        />
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        읽을 수 있는 건 여기까지다. 내일의 대기는 아직 아무도 보지 못했다.
      </p>
    </section>
  )
}

function Row({
  label,
  recs,
  render,
  strong,
}: {
  label: string
  recs: DailyRecord[]
  render: (r: DailyRecord) => string
  strong?: boolean
}) {
  return (
    <>
      <div className="text-[11px] text-ink-3">{label}</div>
      {recs.map((r, i) => (
        <div
          key={r.date}
          className={`tnum rounded-md py-0.5 text-center ${
            i === 2 ? 'bg-white/6 font-semibold text-ink-1' : 'text-ink-2'
          } ${strong && i === 2 ? 'text-[13px]' : ''}`}
        >
          {render(r)}
        </div>
      ))}
    </>
  )
}

function SignalTile({
  title,
  value,
  delta,
  deltaColor,
  values,
}: {
  title: string
  value: string
  delta: string
  deltaColor: string
  values: number[]
}) {
  return (
    <div className="panel-quiet flex items-center justify-between gap-2 px-3 py-2.5">
      <div>
        <div className="text-[10.5px] text-ink-3">{title}</div>
        <div className="tnum text-[14px] font-semibold">{value}</div>
        <div className="tnum text-[11px] font-medium" style={{ color: deltaColor }}>
          {delta} <span className="text-ink-3">(어제 대비)</span>
        </div>
      </div>
      <Sparkline values={values} />
    </div>
  )
}
