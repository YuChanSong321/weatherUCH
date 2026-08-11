/**
 * S1 우측 — 사용자의 예보 입력. 라운드마다 묻는 것이 하나뿐이다.
 *
 * 기온 슬라이더의 기본값이 '오늘과 같음'인 것 자체가 지속성 학습이다. 사용자가
 * 아무것도 하지 않고 제출하면 그게 곧 지속성 예보이고, 결과 화면이 그 전략이
 * 얼마나 통했는지 숫자로 알려준다.
 */
import { useMemo, useState } from 'react'
import { PRECIP_CLASSES, ROUND_MAX, type ForecastCase, type Guess } from '../../lib/forecast'
import type { PrecipClass } from '../../types'

const HINT: Record<string, string> = {
  tmax: '하루 뒤의 대기는 오늘의 대기와 대체로 닮아 있습니다 — 슬라이더를 그대로 두는 것도 하나의 전략이에요.',
  precip: '기압이 내려가고 습도가 오르면 저기압이 다가오는 신호입니다. 왼쪽 관측 3일치를 읽어보세요.',
  tmax3: '같은 방법으로 사흘 뒤를 찍어봅시다. 하루 뒤보다 얼마나 더 어려운지가 이 라운드의 질문입니다.',
}

export function GuessPanel({
  forecastCase,
  onSubmit,
}: {
  forecastCase: ForecastCase
  onSubmit: (g: Guess) => void
}) {
  const { today, kind, round } = forecastCase
  const [temp, setTemp] = useState<number>(today.tmax)
  const [precip, setPrecip] = useState<PrecipClass | null>(null)

  const range = useMemo(() => {
    // 3일 뒤는 하루 뒤보다 더 벌어질 수 있으니 폭을 넓힌다
    const span = kind === 'tmax3' ? 12 : 9
    return {
      lo: Math.round((today.tmax - span) * 2) / 2,
      hi: Math.round((today.tmax + span) * 2) / 2,
    }
  }, [today.tmax, kind])

  const anchorPct = ((today.tmax - range.lo) / (range.hi - range.lo)) * 100
  const diff = temp - today.tmax
  const isTemp = kind !== 'precip'
  const ready = isTemp || precip !== null

  const submit = () =>
    onSubmit(
      kind === 'tmax'
        ? { tmax: Number(temp.toFixed(1)) }
        : kind === 'precip'
          ? { precip: precip! }
          : { tmax3: Number(temp.toFixed(1)) },
    )

  return (
    <section className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {kind === 'tmax' ? '내일의 최고기온' : kind === 'precip' ? '내일의 강수' : '3일 뒤의 최고기온'}
        </h2>
        <span className="tnum text-[11px] text-ink-3">
          라운드 {round} / 3 · {ROUND_MAX[round]}점
        </span>
      </div>

      {isTemp ? (
        <div>
          <div className="flex items-end gap-3">
            <div className="tnum text-[36px] leading-none font-semibold tracking-tight">
              {temp.toFixed(1)}
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
              value={temp}
              onChange={(e) => setTemp(Number(e.target.value))}
              aria-label={kind === 'tmax' ? '내일 최고기온 예측' : '3일 뒤 최고기온 예측'}
            />
            {/* 오늘 값 앵커 — 지속성의 시각적 기준선 */}
            <div
              className="pointer-events-none absolute top-[13px] -translate-x-1/2"
              style={{ left: `${anchorPct}%` }}
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
      ) : (
        <div className="grid grid-cols-2 gap-2">
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
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        <span className="text-ink-2">힌트 · </span>
        {HINT[kind]}
      </p>

      <button type="button" className="btn btn-primary w-full" disabled={!ready} onClick={submit}>
        {ready ? '예보 제출하기' : '하나를 골라 주세요'}
      </button>
    </section>
  )
}
