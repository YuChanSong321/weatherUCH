/**
 * 북위 65°의 1년 일사량 곡선. 현재 지구(회색 점선)와 사용자가 만든 지구(흰 선)를 겹쳐
 * 여름 값과 '연교차 진폭'을 동시에 읽게 한다 — S1의 일교차를 여기서 회수한다.
 */
import { ChartFrame } from '../../components/ChartFrame'
import { linearScale, niceTicks, smoothPath } from '../../lib/scales'
import {
  MISSION_LAT,
  PRESENT,
  seasonalCurve,
  type Mission,
  type OrbitParams,
} from '../../lib/milankovitch'

/** 기본 크기. 좁은 HUD 열에 넣을 때는 width/height 로 줄인다. */
const W = 600
const H = 196
/** 오른쪽 여백은 목표선 라벨('목표 478')이 들어갈 자리다 — 좁혀도 이 아래로는 못 간다 */
const marginsFor = (w: number) =>
  w >= 480
    ? { top: 20, right: 74, bottom: 34, left: 46 }
    : { top: 16, right: 58, bottom: 30, left: 38 }

const SEASON_TICKS = [
  { lambda: 0, label: '춘분' },
  { lambda: 90, label: '하지' },
  { lambda: 180, label: '추분' },
  { lambda: 270, label: '동지' },
  { lambda: 360, label: '춘분' },
]

export function InsolationChart({
  params,
  mission,
  summer,
  met,
  width = W,
  height = H,
}: {
  params: OrbitParams
  mission: Mission
  summer: number
  met: boolean
  width?: number
  height?: number
}) {
  const curve = seasonalCurve(params)
  const presentCurve = seasonalCurve(PRESENT)

  const M = marginsFor(width)
  const x = linearScale([0, 360], [M.left, width - M.right])
  const y = linearScale([0, 620], [height - M.bottom, M.top])
  const yTicks = niceTicks(0, 620, 4)

  const toPts = (c: Array<{ lambda: number; q: number }>) =>
    c.map((p) => [x(p.lambda), y(p.q)] as [number, number])

  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">북위 {MISSION_LAT}° 의 1년 일사량</h3>
        <div className="flex items-center gap-3 text-[10.5px] text-ink-3">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3.5 rounded-full bg-series-obs" /> 당신의 지구
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3.5 rounded-full bg-ink-3" /> 현재 지구
          </span>
        </div>
      </div>

      <ChartFrame
        width={width}
        height={height}
        margins={M}
        x={x}
        y={y}
        xTicks={SEASON_TICKS.map((t) => t.lambda)}
        yTicks={yTicks}
        xTickFormat={(v) => SEASON_TICKS.find((t) => t.lambda === v)?.label ?? ''}
        yTickFormat={(v) => `${v}`}
        yUnit="W/m²"
      >
        {/* 목표선 */}
        <line
          x1={M.left}
          x2={width - M.right}
          y1={y(mission.threshold)}
          y2={y(mission.threshold)}
          stroke={met ? 'var(--color-good)' : 'var(--color-act-3)'}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <text
          x={width - M.right + 6}
          y={y(mission.threshold) + 4}
          fontSize={10}
          fill={met ? 'var(--color-good)' : 'var(--color-act-3)'}
          className="tnum"
        >
          목표 {mission.threshold.toFixed(0)}
        </text>

        {/* 현재 지구 */}
        <path d={smoothPath(toPts(presentCurve))} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.5} strokeDasharray="4 4" />
        {/* 사용자의 지구 */}
        <path d={smoothPath(toPts(curve))} fill="none" stroke="var(--color-series-obs)" strokeWidth={2.5} strokeLinecap="round" />

        {/* 하지 지점 강조 */}
        <line
          x1={x(90)}
          x2={x(90)}
          y1={y(summer)}
          y2={height - M.bottom}
          stroke="rgb(255 255 255 / 0.14)"
          strokeWidth={1}
        />
        <circle
          cx={x(90)}
          cy={y(summer)}
          r={6}
          fill={met ? 'var(--color-good)' : 'var(--color-act-3)'}
          stroke="var(--color-space-1)"
          strokeWidth={2}
        />
      </ChartFrame>
    </div>
  )
}
