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

  /*
   * 카드마다 두 줄을 붙인다.
   *   what  이 숫자가 무엇을 잰 것인가 — 단위와 기준을 풀어서
   *   so    그래서 얼마나 달라졌는가 — 눈에 그려지는 크기로
   * 숫자만 크게 띄우면 "426 ppm" 이 큰지 작은지 알 수 없다.
   */
  const iceLost = ICE[0].extent - ICE[ICE.length - 1].extent
  /** 남한 면적 100,363 km² — 줄어든 얼음의 크기를 감으로 옮기는 자 */
  const KOREA_MKM2 = 0.100363

  const cards = [
    {
      key: 'temperature' as const,
      color: 'var(--color-bad)',
      points: TEMP.map((r) => ({ year: r.year, v: r.anomaly })),
      value: `${TEMP[TEMP.length - 1].anomaly > 0 ? '+' : ''}${TEMP[TEMP.length - 1].anomaly.toFixed(2)}℃`,
      what: '1951~1980년의 평균 기온을 0으로 놓고, 지금이 그보다 몇 도 높은지 잰 값입니다.',
      so: `${TEMP[0].year}년부터 재 왔고, 최근 30년 사이에 특히 가팔라졌어요.`,
    },
    {
      key: 'co2' as const,
      color: 'var(--color-warn)',
      points: CO2.map((r) => ({ year: r.year, v: r.ppm })),
      value: `${CO2[CO2.length - 1].ppm.toFixed(0)} ppm`,
      what: 'ppm 은 공기 알갱이 100만 개 중 이산화탄소가 몇 개인지를 뜻합니다.',
      so: `${CO2[0].year}년에는 ${CO2[0].ppm.toFixed(0)}개였으니, 그 사이 ${(CO2[CO2.length - 1].ppm - CO2[0].ppm).toFixed(0)}개가 늘었습니다.`,
    },
    {
      key: 'seaIce' as const,
      color: 'var(--color-act-1)',
      points: ICE.map((r) => ({ year: r.year, v: r.extent })),
      value: `${ICE[ICE.length - 1].extent.toFixed(2)} 백만 km²`,
      what: '북극 바다에서 얼음이 가장 적게 남는 9월에, 남은 얼음이 덮은 넓이입니다.',
      so: `${ICE[0].year}년보다 ${iceLost.toFixed(2)} 백만 km² 줄었어요 — 남한 넓이의 약 ${Math.round(iceLost / KOREA_MKM2)}배입니다.`,
      invert: true,
    },
  ]

  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em] text-ink-3">
          ④ 전 지구 · 한 지역에서 지구 전체로
        </div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          여기까지는 <span className="text-ink-1">한 곳의 이야기였습니다</span>
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          하루를 맞혀보고 40년을 쌓고 2100년까지 끌어본 것, 전부 <span className="text-ink-1">{climate.label}</span>{' '}
          한 곳에서였어요. 그런데 한 곳만 더워진 거라면 이유가 여럿입니다 — 건물이 늘고 아스팔트가 깔려도 기온은
          오르니까요. 그래서 <span className="text-ink-1">서로 상관없는 방법으로 잰 지구 전체의 기록 셋</span>을
          나란히 놓습니다. 기온계, 공기 성분 분석, 인공위성 사진 — 각각 다른 사람이 다른 도구로 잰 것들인데도 셋 다
          같은 방향을 가리킨다면, 우연이라고 하기 어렵겠죠.
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
              <p className="text-[10.5px] leading-relaxed text-ink-2">{c.what}</p>
              <p className="text-[10.5px] leading-relaxed text-ink-3">{c.so}</p>
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
          {/* 지명을 문장마다 되풀이하지 않는다 — Open-Meteo 지역은 "멕시코시티 북서쪽
              1227 km" 처럼 길어서, 그런 이름이 한 화면에 다섯 번 나오면 글이 읽히지 않는다.
              제목과 막대 라벨에만 쓰고 나머지는 '이 지역'으로 받는다. */}
          <h3 className="text-[13px] font-semibold text-ink-1">이 지역과 지구 전체를 나란히 놓으면</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">
            둘 다 {cmp.from}년부터 {cmp.to}년까지, 같은 {cmp.to - cmp.from}년을 잘라서 잰 값입니다. 기간이 다르면
            나란히 놓는 것 자체가 말이 안 되니까요.
          </p>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Bar
              label={`${climate.label}`}
              value={cmp.local}
              years={cmp.to - cmp.from}
              color="var(--color-act-2)"
              max={Math.max(Math.abs(cmp.local), Math.abs(cmp.global)) * 1.2}
            />
            <Bar
              label="지구 전체"
              value={cmp.global}
              years={cmp.to - cmp.from}
              color="var(--color-bad)"
              max={Math.max(Math.abs(cmp.local), Math.abs(cmp.global)) * 1.2}
            />
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-2">
            {/*
              지역이 왜 빠르냐/느리냐는 그 지역의 사정(내륙인지 해안인지, 도시인지)에
              달려 있는데, 사용자가 지구본 아무 데나 찍을 수 있으므로 여기서는 알 수 없다.
              한때 "바다에 붙은 곳은 천천히 오른다"고 단정했는데, 내륙을 찍은 사람에게는
              그냥 틀린 말이었다. 확인할 수 있는 것만 말한다.
            */}
            {Math.abs(cmp.local) > Math.abs(cmp.global) ? (
              <>
                이 지역이 지구 평균보다 <span className="text-ink-1">더 빨리</span> 더워졌습니다. 육지에서는 흔한
                일이에요 — 물은 데우기 어렵고 땅은 쉽게 데워지는데, 지구의 70%가 바다라 전 지구 평균이 그만큼
                낮게 나오거든요.
              </>
            ) : (
              <>
                이 지역은 지구 평균과 비슷하거나 조금 느리게 더워졌습니다. 지역마다 속도가 다른 건 자연스러운
                일이에요 — 바다가 가까우면 바다가 열을 가져가고, 지형이나 바람길에 따라서도 달라집니다.
              </>
            )}{' '}
            <span className="text-ink-1">중요한 건 두 막대가 같은 쪽을 가리킨다는 것입니다</span> — 속도는 달라도
            방향이 같다면, 내 동네만의 일이 아니라는 뜻이니까요.
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

/**
 * 10년당 상승폭 막대 — 두 값을 같은 척도에 놓아야 '빠르다/느리다'가 성립한다.
 *
 * 기간 전체의 합도 함께 적는다. "10년에 0.28℃"는 작아 보이지만 38년을 곱하면
 * 1℃가 넘는다 — 속도만 보여주면 그 크기가 전달되지 않는다.
 */
function Bar({
  label,
  value,
  years,
  color,
  max,
}: {
  label: string
  value: number
  years: number
  color: string
  max: number
}) {
  const pct = Math.min(100, (Math.abs(value) / (max || 1)) * 100)
  const total = (value * years) / 10
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-ink-2">{label}</span>
        <span className="tnum font-semibold" style={{ color }}>
          10년마다 {value > 0 ? '+' : ''}
          {value.toFixed(2)}℃
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="tnum mt-1 text-[10.5px] text-ink-3">
        {years}년 동안 모두 합치면 {total > 0 ? '+' : ''}
        {total.toFixed(2)}℃
      </div>
    </div>
  )
}
