/**
 * S3 보조 레이어 — 부산 벚꽃 개화일.
 *
 * 연평균 기온 곡선 위에 개화일 점을 겹친다. "0.0몇 ℃"라는 숫자가 실제로는 며칠짜리
 * 사건인지 보여주는 것이 목적이다.
 *
 * ⚠️ 이중 축이다. ChartFrame 이 "축은 하나"를 원칙으로 세운 이유는 두 축의 눈금 정렬이
 * 임의여서 없는 상관을 만들어내기 때문이고, 그 위험은 여기서도 그대로다. 요청된
 * 표현을 그대로 내되, 오해를 만드는 부분만 셋으로 막았다.
 *
 *   1. 개화일은 선이 아니라 점으로만 그린다. 두 선이 나란히 달리면 "같이 움직인다"로
 *      읽히지만, 점은 "따로 있는 두 번째 사실"로 읽힌다.
 *   2. 오른쪽 축의 범위를 기온선에 맞춰 조정하지 않는다. 관측된 개화일 전체 범위에
 *      고정 여백만 준다 — 기울기를 맞추려고 눈금을 고르는 순간 그림이 거짓말이 된다.
 *   3. 축을 뒤집지 않는다. 따뜻해질수록 개화일 수치는 내려간다. 점들이 내려가고
 *      기온선이 올라가는 X자가 실제 관계이고, 억지로 같은 방향으로 세우지 않는다.
 *
 * 그리고 축 아래에 "두 축의 눈금은 서로 독립"이라고 적는다.
 */
import { linearScale } from '../lib/scales'
import type { ChartCtx } from './YearlyChart'
import type { BlossomRecord } from '../types'

const COLOR = 'var(--color-blossom)'

/** doy → "3/25" */
export function doyLabel(doy: number, year = 2001): string {
  const d = new Date(Date.UTC(year, 0, doy))
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/** 오른쪽 축의 범위 — 관측 전체를 담고 눈금이 예쁘게 떨어지도록 5일 격자에 맞춘다. */
export function blossomDomain(records: BlossomRecord[]): [number, number] {
  const doys = records.map((r) => r.doy)
  const lo = Math.floor((Math.min(...doys) - 3) / 5) * 5
  const hi = Math.ceil((Math.max(...doys) + 3) / 5) * 5
  return [lo, hi]
}

export function BlossomLayer({
  ctx,
  records,
  visible,
  revealCount = records.length,
}: {
  ctx: ChartCtx
  records: BlossomRecord[]
  visible: boolean
  revealCount?: number
}) {
  const { x, margins, width, height } = ctx
  const domain = blossomDomain(records)
  const yb = linearScale(domain, [height - margins.bottom, margins.top])
  // 5일 간격 눈금
  const ticks: number[] = []
  for (let t = domain[0]; t <= domain[1]; t += 5) ticks.push(t)

  // 오른쪽 여백 바깥쪽 끝. 추세선 라벨(width-88 부근)과 겹치지 않는 자리다.
  const axisX = width - 36

  return (
    <g
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 700ms ease' }}
      pointerEvents={visible ? undefined : 'none'}
    >
      {/* 오른쪽 축 */}
      <line
        x1={axisX - 8}
        x2={axisX - 8}
        y1={margins.top}
        y2={height - margins.bottom}
        stroke={COLOR}
        strokeWidth={1}
        opacity={0.35}
      />
      {ticks.map((t) => (
        <text
          key={`bt-${t}`}
          x={axisX}
          y={yb(t)}
          dominantBaseline="middle"
          className="tnum"
          fontSize={10}
          fill="var(--color-ink-3)"
        >
          {doyLabel(t)}
        </text>
      ))}
      <text x={axisX - 8} y={margins.top - 6} fontSize={10} fill={COLOR}>
        개화일
      </text>

      {/* 개화일 점 — 선으로 잇지 않는다 (위 주석 1번) */}
      {records.slice(0, revealCount).map((r, i) => (
        <circle
          key={r.year}
          cx={x(r.year)}
          cy={yb(r.doy)}
          r={3.4}
          fill={COLOR}
          stroke="var(--color-space-1)"
          strokeWidth={1.4}
          style={{
            // 왼쪽부터 차례로 내려앉는다
            opacity: visible ? 0.92 : 0,
            transition: `opacity 420ms ease ${visible ? i * 14 : 0}ms`,
          }}
        />
      ))}
    </g>
  )
}
