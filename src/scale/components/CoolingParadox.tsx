/**
 * 반전 ① — "지금 지구는 원래 식어야 합니다".
 *
 * 이 콘텐츠가 피하려는 것은 "탄소를 줄입시다"라는 훈계다. 훈계 대신 **모순 하나**를
 * 앞에 세운다: 궤도만 놓고 보면 지금 지구는 식는 방향에 서 있는데, 실제 기온은
 * 오르고 있다. 그 간극이 곧 인류의 몫이고, 그 사실은 설득이 아니라 계산으로 나온다.
 *
 * 여기서는 **첫 번째 절반만** 증명한다 — 궤도가 식는 방향이라는 것. 나머지 절반
 * (탄소가 그 냉각을 통째로 덮는다)은 여정의 끝에서 같은 축 위에 겹쳐진다
 * (→ stages/S6Carbon). 두 화면이 하나의 논증이므로 문구를 서로 맞춰 둘 것.
 *
 * 곡선은 사용자의 다이얼과 무관하다. 다이얼 값에서 뽑으면 "원래 어느 방향인가"가
 * 사용자가 만진 결과에 좌우되어 증명이 성립하지 않는다 (→ lib/orbitalHistory).
 */
import { useMemo, useState } from 'react'
import { ChartFrame } from './ChartFrame'
import {
  BENCHMARKS,
  HOLOCENE_PEAK_YEAR,
  insolationAt,
  insolationDropFromPeak,
  insolationTrendPerMillennium,
  orbitalSeries,
} from '../lib/orbitalHistory'
import { carbonWarmingNow } from '../lib/longTermClimate'
import { linearScale, niceTicks, smoothPath } from '../lib/scales'

const W = 700
const H = 300
const M = { top: 22, right: 24, bottom: 36, left: 52 }

/** 보여줄 구간 — 마지막 빙기부터 다음 2만 년까지 */
const FROM = -30_000
const TO = 20_000

const TONE = 'var(--color-act-3)'

const kyr = (t: number) => (t === 0 ? '지금' : `${t > 0 ? '+' : '−'}${Math.abs(t) / 1000}천 년`)

export function CoolingParadox({ onNext }: { onNext: () => void }) {
  /** 근거를 펼쳐 보는 사람을 위한 자리 — 접어 두되 숨기지는 않는다 */
  const [showCheck, setShowCheck] = useState(false)

  const series = useMemo(() => orbitalSeries(FROM, TO, 220), [])
  const now = insolationAt(0)
  const peak = insolationAt(HOLOCENE_PEAK_YEAR)

  /*
   * "1000년에 −0.9 W/m²" 는 숫자로만 보면 크기를 가늠할 수 없다. 사람의 한평생
   * (80년) 동안 바뀌는 양이 정점 이후 깎인 양의 몇 분의 1인지로 옮기면, 궤도가
   * 얼마나 느리게 움직이는지가 곧바로 읽힌다.
   */
  const lifetimeRatio = Math.round(
    Math.abs(insolationDropFromPeak) / Math.abs(insolationTrendPerMillennium * 0.08),
  )

  const yDomain: [number, number] = [440, 545]
  const x = linearScale([FROM, TO], [M.left, W - M.right])
  const y = linearScale(yDomain, [H - M.bottom, M.top])
  const pts = series.map((s) => [x(s.t), y(s.insolation)] as [number, number])

  return (
    /*
     * pointer-events-auto 를 빼먹으면 이 화면은 통째로 안 눌린다.
     * S6·S7 의 무대(App.tsx <main>)는 pointer-events-none 이다 — 패널이 없는 빈
     * 자리를 끌면 그대로 지구가 돌게 하려는 것이고, 그래서 각 패널이 스스로
     * 되살려야 한다. 실제로 '손잡이를 직접 돌려보기' 버튼이 죽어 있었다.
     */
    <div className="pointer-events-auto mx-auto flex w-full max-w-6xl flex-col gap-3.5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em]" style={{ color: TONE }}>
          3단계 · 시작하기 전에 · 궤도가 말하는 것
        </div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          지금 지구는 <span style={{ color: TONE }}>원래 식어야 합니다</span>
        </h1>
      </div>

      <section className="panel grid grid-cols-1 items-start gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <ChartFrame
            width={W}
            height={H}
            margins={M}
            x={x}
            y={y}
            xTicks={[-30_000, -20_000, -10_000, 0, 10_000, 20_000]}
            yTicks={niceTicks(yDomain[0], yDomain[1], 5)}
            xTickFormat={(v) => kyr(v)}
            yTickFormat={(v) => `${v}`}
            yUnit="W/m²"
          >
            {/* 지금 이 순간 */}
            <line x1={x(0)} x2={x(0)} y1={M.top} y2={H - M.bottom} stroke="rgb(255 255 255 / 0.28)" strokeWidth={1} />
            <text x={x(0) + 5} y={M.top + 11} fontSize={10.5} fill="var(--color-ink-2)">
              지금
            </text>

            {/* 정점에서 지금까지 내려온 폭 — 이 화면의 주장 그 자체 */}
            <line
              x1={x(HOLOCENE_PEAK_YEAR)}
              x2={x(0)}
              y1={y(peak)}
              y2={y(peak)}
              stroke="var(--color-ink-3)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <line
              x1={x(0)}
              x2={x(0)}
              y1={y(peak)}
              y2={y(now)}
              stroke="var(--color-bad)"
              strokeWidth={2}
            />
            <text
              x={x(0) + 6}
              y={(y(peak) + y(now)) / 2 + 4}
              fontSize={11.5}
              fontWeight={600}
              fill="var(--color-bad)"
              className="tnum"
            >
              {insolationDropFromPeak.toFixed(0)} W/m²
            </text>

            <path d={smoothPath(pts)} fill="none" stroke={TONE} strokeWidth={2.5} strokeLinecap="round" />

            <circle cx={x(HOLOCENE_PEAK_YEAR)} cy={y(peak)} r={4.5} fill="var(--color-ink-1)" />
            <text
              x={x(HOLOCENE_PEAK_YEAR)}
              y={y(peak) - 10}
              fontSize={11}
              textAnchor="middle"
              fill="var(--color-ink-2)"
            >
              1만 1천 년 전 정점
            </text>
            <circle cx={x(0)} cy={y(now)} r={5} fill={TONE} stroke="var(--color-space-1)" strokeWidth={2} />
          </ChartFrame>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-3">
            <span className="text-ink-2">세로축 W/m²</span> — 1㎡ 넓이에 쏟아지는 햇빛의 세기입니다. 북위 65°의
            한여름 값만 봅니다. 이 위도의 여름이 서늘하면 겨울에 쌓인 눈이 다 녹지 못하고 남고, 그게 해마다 겹쳐
            빙하가 자라거든요 — 빙하기가 켜지고 꺼지는 스위치라 학계가 이 값을 봅니다. 곡선은 Berger(1978)
            표준식에 궤도 3요소의 시간 변화를 넣어 계산한 <span className="text-ink-2">단순화 모델</span>입니다.
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <Fact
            n={1}
            title="여름 햇빛의 10분의 1이 사라졌습니다"
            body={
              <>
                고위도 여름 햇빛은 <span className="text-ink-1">1만 1천 년 전</span>에 가장 강했습니다. 그 뒤로 계속
                줄어 지금은{' '}
                <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                  {Math.abs(insolationDropFromPeak).toFixed(0)} W/m²
                </span>{' '}
                낮은데, 그때 값의{' '}
                <span className="font-semibold" style={{ color: 'var(--color-bad)' }}>
                  약 {Math.round((Math.abs(insolationDropFromPeak) / peak) * 100)}%
                </span>
                가 깎여 나간 셈이에요.
              </>
            }
          />
          <Fact
            n={2}
            title="너무 느려서 느낄 수가 없습니다"
            body={
              <>
                지금도 줄고 있지만 속도가{' '}
                <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                  1000년에 {insolationTrendPerMillennium.toFixed(1)} W/m²
                </span>
                . 사람이 <span className="text-ink-1">80년을 꼬박 살아도</span> 바뀌는 양은{' '}
                <span className="tnum">{Math.abs(insolationTrendPerMillennium * 0.08).toFixed(2)} W/m²</span>{' '}
                — 위에서 깎인 양의 <span className="tnum">{lifetimeRatio}분의 1</span>도 안 됩니다. 궤도는 이런
                속도로 움직여요.
              </>
            }
          />
          <Fact
            n={3}
            title="그런데 기온은 반대로 갔습니다"
            body={
              <>
                햇빛은 줄어드는 중인데, 실제 기온은{' '}
                <span className="text-ink-1">산업화 이후 270년 만에</span>{' '}
                <span className="tnum font-semibold" style={{ color: 'var(--color-bad)' }}>
                  +{carbonWarmingNow().toFixed(2)}℃
                </span>{' '}
                올랐습니다. <span className="text-ink-1">방향이 반대입니다.</span> 궤도가 식히려고 미는 힘을 무언가가
                덮어쓰고 있다는 뜻이고, 그 무언가를 찾는 것이 이 여정의 나머지 절반입니다.
              </>
            }
          />

          <button
            type="button"
            onClick={() => setShowCheck((v) => !v)}
            aria-expanded={showCheck}
            className="self-start text-[11px] text-ink-3 underline-offset-2 transition-colors hover:text-ink-1 hover:underline"
          >
            {showCheck ? '검산 접기' : '이 곡선이 맞는지 검산해보기'}
          </button>
          {showCheck && (
            <div className="panel-quiet px-3 py-2.5">
              <div className="text-[10.5px] text-ink-3">공표된 일사량과 이 모델의 값</div>
              <div className="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[11px]">
                <span className="text-ink-3">시점</span>
                <span className="text-right text-ink-3">공표</span>
                <span className="text-right text-ink-3">이 모델</span>
                {BENCHMARKS.map((b) => (
                  <div key={b.t} className="contents">
                    <span className="text-ink-2">{b.note}</span>
                    <span className="tnum text-right text-ink-3">{b.published}</span>
                    <span className="tnum text-right text-ink-1">{insolationAt(b.t).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-3">
                네 시점 모두 오차 8 W/m² 이내입니다. 곡선의 정점 위치(1만 1천 년 전)가 이 화면 주장의 핵심이라
                거기를 특히 맞췄습니다.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-6">
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-ink-2">
          이 곡선은 <span className="text-ink-1">당신의 다이얼과 무관합니다</span> — 시간만 넣어 계산한 값이에요.
          그럼 이 손잡이들이 실제로 무엇을 하는지, 직접 돌려서 확인해볼까요.
        </p>
        <button type="button" className="btn btn-primary shrink-0" onClick={onNext}>
          손잡이를 직접 돌려보기
        </button>
      </div>
    </div>
  )
}

function Fact({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span
        className="tnum mt-[2px] flex h-[1.15rem] w-[1.15rem] shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold"
        style={{ background: `color-mix(in oklab, ${TONE} 24%, transparent)`, color: TONE }}
      >
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-ink-1">{title}</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2">{body}</p>
      </div>
    </div>
  )
}
