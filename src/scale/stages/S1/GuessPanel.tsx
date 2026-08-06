/** S1 우측 — 사용자의 예보 입력. 슬라이더 기본값이 '오늘과 같음'인 것 자체가 지속성 학습. */
import { useMemo, useState } from 'react'
import {
  DTR_CLASSES,
  PRECIP_CLASSES,
  WIND_FAMILIES,
  type ForecastCase,
  type Guess,
} from '../../lib/forecast'
import type { DtrClass, PrecipClass, WindFamily } from '../../types'

const ROUND_HINT: Record<number, string> = {
  1: '하루 뒤의 대기는 오늘의 대기와 대체로 닮아 있다. 그리고 하늘이 열려 있으면 기온이 크게 오르내린다.',
  2: '기압이 오르기 시작하면 북쪽에서, 내려가기 시작하면 남쪽에서 공기가 밀려온다.',
  3: '이번 날은 대기가 조용하지 않다. 오늘과 닮으리라는 가정이 통할지 스스로 판단해야 한다.',
}

export function GuessPanel({
  forecastCase,
  onSubmit,
}: {
  forecastCase: ForecastCase
  onSubmit: (g: Guess) => void
}) {
  const { today, bonus, round } = forecastCase
  const [tmax, setTmax] = useState<number>(today.tmax)
  const [precip, setPrecip] = useState<PrecipClass | null>(null)
  const [bonusPick, setBonusPick] = useState<DtrClass | WindFamily | null>(null)

  const range = useMemo(() => {
    const lo = Math.round((today.tmax - 9) * 2) / 2
    const hi = Math.round((today.tmax + 9) * 2) / 2
    return { lo, hi }
  }, [today.tmax])

  const anchorPct = ((today.tmax - range.lo) / (range.hi - range.lo)) * 100
  const ready = precip !== null && (bonus === null || bonusPick !== null)
  const diff = tmax - today.tmax

  return (
    <section className="panel flex flex-col gap-5 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">내일의 예보</h2>
        <span className="text-[11px] text-ink-3">라운드 {round} / 3</span>
      </div>

      {/* ── 최고기온 (50점) ── */}
      <div>
        <Legend title="내일 최고기온" points={50} />
        <div className="mt-1 flex items-end gap-3">
          <div className="tnum text-[34px] leading-none font-semibold tracking-tight">
            {tmax.toFixed(1)}
            <span className="text-[18px] text-ink-2">℃</span>
          </div>
          <div className="tnum pb-1 text-[12px] text-ink-3">
            오늘 대비 {diff > 0 ? '+' : ''}
            {diff.toFixed(1)}℃
          </div>
        </div>

        <div className="relative mt-1">
          <input
            className="slider"
            type="range"
            min={range.lo}
            max={range.hi}
            step={0.1}
            value={tmax}
            onChange={(e) => setTmax(Number(e.target.value))}
            aria-label="내일 최고기온 예측"
          />
          {/* 오늘 값 앵커 — 지속성의 시각적 기준선 */}
          <div
            className="pointer-events-none absolute top-[13px] -translate-x-1/2"
            style={{ left: `calc(${anchorPct}% )` }}
          >
            <div className="h-3.5 w-px bg-white/45" />
            <div className="-translate-x-1/2 pt-0.5 text-[10px] whitespace-nowrap text-ink-3">
              오늘 {today.tmax.toFixed(1)}℃
            </div>
          </div>
          <div className="tnum mt-4 flex justify-between text-[10px] text-ink-3">
            <span>{range.lo.toFixed(1)}℃</span>
            <span>{range.hi.toFixed(1)}℃</span>
          </div>
        </div>
      </div>

      {/* ── 강수 등급 (30점) ── */}
      <div>
        <Legend title="내일 강수" points={30} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PRECIP_CLASSES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="choice"
              data-selected={precip === c.id}
              onClick={() => setPrecip(c.id)}
            >
              <span className="text-[13px] font-medium">{c.label}</span>
              <span className="tnum text-[10.5px] text-ink-3">{c.range}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 보너스 (20점) ── */}
      {bonus === 'dtr' && (
        <div>
          <Legend title="내일 일교차" points={20} badge="보너스" />
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DTR_CLASSES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="choice"
                data-selected={bonusPick === c.id}
                onClick={() => setBonusPick(c.id)}
              >
                <span className="text-[13px] font-medium">{c.label}</span>
                <span className="tnum text-[10.5px] text-ink-3">{c.range}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {bonus === 'wind' && (
        <div>
          <Legend title="내일 풍향" points={20} badge="보너스" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {WIND_FAMILIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="choice"
                data-selected={bonusPick === c.id}
                onClick={() => setBonusPick(c.id)}
              >
                <span className="text-[13px] font-medium">{c.label}</span>
                <span className="text-[10.5px] text-ink-3">{c.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        <span className="text-ink-2">힌트 · </span>
        {ROUND_HINT[round]}
      </p>

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!ready}
        onClick={() => onSubmit({ tmax: Number(tmax.toFixed(1)), precip: precip!, bonus: bonusPick })}
      >
        {ready ? '예보 제출하고 내일을 열어보기' : '모든 항목을 선택해 주세요'}
      </button>
    </section>
  )
}

function Legend({ title, points, badge }: { title: string; points: number; badge?: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-[13px] font-medium text-ink-1">{title}</h3>
      {badge && (
        <span className="rounded-full bg-act-1/18 px-1.5 py-px text-[10px] font-medium text-act-1">{badge}</span>
      )}
      <span className="tnum text-[11px] text-ink-3">{points}점</span>
    </div>
  )
}
