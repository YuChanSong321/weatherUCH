/**
 * 지역에서 전 지구로 — 내가 본 40년이 지구 전체에서는 무엇이었나.
 *
 * 여기까지 사용자는 **한 지역**만 봤다. 그 지역의 하루를 맞혀보고, 그 지역의 40년
 * 추세를 손으로 쌓았다. 그런데 "부산이 더워졌다"만으로는 그것이 이 도시의 사정인지
 * 지구 전체의 일인지 알 수 없다 — 도시화나 관측 환경 변화로도 같은 그림이 나온다.
 *
 * 그래서 같은 기간의 **전 지구 지표 셋**을 나란히 놓는다. 기온만으로는 "그럴 수도
 * 있다"에서 멈추지만, CO₂ 가 함께 오르고 북극 해빙이 함께 줄었다는 세 개의 서로
 * 독립된 관측이 같은 방향을 가리키면 다른 설명이 남지 않는다.
 *
 * 값은 번들된 공표 자료를 그대로 읽는다 (→ data/global_indicators.json).
 */
import { useMemo } from 'react'
import globalJson from '../../../data/global_indicators.json'
import { linearScale, smoothPath } from '../lib/scales'
import { trendOf, useClimate } from '../state/climate'

type Series = { label: string; unit: string; provider: string; dataset: string; license: string; url: string; period: string }
const META = globalJson.meta.series as Record<'temperature' | 'co2' | 'seaIce', Series>

const TEMP = globalJson.temperature as Array<{ year: number; anomaly: number }>
const CO2 = globalJson.co2 as Array<{ year: number; ppm: number }>
const ICE = globalJson.seaIce as Array<{ year: number; extent: number }>

/** 10년당 변화율 — 지역과 전 지구를 같은 자로 재기 위한 공통 지표 */
function perDecade(points: Array<{ year: number; v: number }>): number {
  const n = points.length
  if (n < 2) return 0
  const mx = points.reduce((s, p) => s + p.year, 0) / n
  const my = points.reduce((s, p) => s + p.v, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.year - mx) * (p.v - my)
    den += (p.year - mx) ** 2
  }
  return den === 0 ? 0 : (num / den) * 10
}

const SW = 200
const SH = 62

/** 작은 추세 그래프 하나 — 값이 아니라 방향을 읽는 자리라 축을 달지 않는다 */
function Spark({
  points,
  color,
  invert,
}: {
  points: Array<{ year: number; v: number }>
  color: string
  invert?: boolean
}) {
  const xs = points.map((p) => p.year)
  const vs = points.map((p) => p.v)
  const x = linearScale([Math.min(...xs), Math.max(...xs)], [3, SW - 3])
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const pad = (hi - lo) * 0.12 || 1
  const y = linearScale([lo - pad, hi + pad], invert ? [4, SH - 4] : [SH - 4, 4])
  const path = smoothPath(points.map((p) => [x(p.year), y(p.v)] as [number, number]))
  return (
    <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(xs[xs.length - 1])} cy={y(vs[vs.length - 1])} r={2.6} fill={color} />
    </svg>
  )
}

export function GlobalContext() {
  const climate = useClimate()

  /**
   * 지역과 전 지구를 **같은 기간**으로 잘라 비교한다.
   * 기간이 다르면 두 숫자를 나란히 놓는 것 자체가 거짓말이 된다.
   */
  const cmp = useMemo(() => {
    const s = climate.yearly
    if (s.length < 10) return null
    const from = s[0].year
    const to = s[s.length - 1].year
    const local = trendOf(s).perDecade
    const globalPts = TEMP.filter((r) => r.year >= from && r.year <= to).map((r) => ({ year: r.year, v: r.anomaly }))
    if (globalPts.length < 10) return null
    return { from, to, local, global: perDecade(globalPts) }
  }, [climate.yearly])

  const cards = [
    {
      key: 'temperature' as const,
      color: 'var(--color-bad)',
      points: TEMP.map((r) => ({ year: r.year, v: r.anomaly })),
      value: `${TEMP[TEMP.length - 1].anomaly > 0 ? '+' : ''}${TEMP[TEMP.length - 1].anomaly.toFixed(2)}℃`,
      caption: `${TEMP[0].year}년 이후 · 1951–1980 평균 대비`,
    },
    {
      key: 'co2' as const,
      color: 'var(--color-warn)',
      points: CO2.map((r) => ({ year: r.year, v: r.ppm })),
      value: `${CO2[CO2.length - 1].ppm.toFixed(0)} ppm`,
      caption: `${CO2[0].year}년 ${CO2[0].ppm.toFixed(0)} ppm 에서 출발`,
    },
    {
      key: 'seaIce' as const,
      color: 'var(--color-act-1)',
      points: ICE.map((r) => ({ year: r.year, v: r.extent })),
      value: `${ICE[ICE.length - 1].extent.toFixed(2)} 백만 km²`,
      caption: `${ICE[0].year}년 ${ICE[0].extent.toFixed(2)} 에서 줄어드는 중`,
      invert: true,
    },
  ]

  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em] text-ink-3">③ 전 지구 · 내 지역 밖에서는</div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          {climate.label}에서 본 것이 <span className="text-ink-1">지구 전체에서도 보입니다</span>
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          한 지역만 보면 "이 동네 사정"일 수도 있습니다 — 도시가 커져도 기온은 오르니까요. 그래서 서로 독립적으로
          관측되는 전 지구 지표 셋을 같이 봅니다. 셋이 같은 방향을 가리키면 남는 설명이 하나뿐이에요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const m = META[c.key]
          return (
            <div key={c.key} className="panel-quiet flex flex-col gap-1 px-3.5 py-3">
              <div className="text-[10.5px] tracking-[0.06em] text-ink-3">{m.label}</div>
              <div className="tnum text-[19px] leading-none font-semibold text-ink-1">{c.value}</div>
              <div className="mt-1.5">
                <Spark points={c.points} color={c.color} invert={c.invert} />
              </div>
              <div className="text-[10px] leading-snug text-ink-3">{c.caption}</div>
              <div className="mt-0.5 text-[9.5px] text-ink-3">
                {m.provider} · {m.period}
              </div>
            </div>
          )
        })}
      </div>

      {cmp && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-act-2) 38%, transparent)',
            background: 'color-mix(in oklab, var(--color-act-2) 8%, transparent)',
          }}
        >
          <h3 className="text-[13px] font-semibold text-ink-1">
            같은 기간({cmp.from}–{cmp.to})을 같은 자로 재면
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Bar label={`${climate.label} 연평균기온`} value={cmp.local} color="var(--color-act-2)" max={Math.max(Math.abs(cmp.local), Math.abs(cmp.global)) * 1.2} />
            <Bar label="전 지구 평균기온" value={cmp.global} color="var(--color-bad)" max={Math.max(Math.abs(cmp.local), Math.abs(cmp.global)) * 1.2} />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">
            {Math.abs(cmp.local) > Math.abs(cmp.global) ? (
              <>
                {climate.label}이 전 지구 평균보다 <span className="text-ink-1">빠르게</span> 더워졌습니다. 육지는
                바다보다 빨리 데워지고, 도시는 그보다 더 빠릅니다 — 그래서 내가 사는 곳의 변화는 전 지구 평균보다
                크게 느껴지는 것이 보통입니다.
              </>
            ) : (
              <>
                {climate.label}의 상승 폭이 전 지구 평균과 비슷하거나 그보다 완만합니다. 바다에 접한 지역은 바다가
                열을 흡수해 주어 상승이 느린 편이에요. 방향이 같다는 것이 핵심입니다.
              </>
            )}
          </p>
        </div>
      )}

      <div className="border-t border-white/8 pt-2.5 text-[10.5px] leading-relaxed text-ink-3">
        전 지구 지표 출처 —{' '}
        {(['temperature', 'co2', 'seaIce'] as const).map((k, i) => (
          <span key={k}>
            {i > 0 && ' · '}
            <span className="text-ink-2">{META[k].provider}</span> {META[k].dataset}
          </span>
        ))}
        . 모두 퍼블릭 도메인(미국 정부 저작물)이며 출처 표기 조건으로 사용합니다.
      </div>
    </section>
  )
}

/** 10년당 상승폭 막대 — 두 값을 같은 척도에 놓아야 '빠르다/느리다'가 성립한다 */
function Bar({ label, value, color, max }: { label: string; value: number; color: string; max: number }) {
  const pct = Math.min(100, (Math.abs(value) / (max || 1)) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-ink-2">{label}</span>
        <span className="tnum font-semibold" style={{ color }}>
          {value > 0 ? '+' : ''}
          {value.toFixed(2)}℃ / 10년
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
