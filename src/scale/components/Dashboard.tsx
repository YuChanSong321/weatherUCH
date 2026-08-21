/**
 * 상시 지구 상태 대시보드 (기획안 §2 원칙 3).
 *
 * 화면 하단에 늘 떠 있고, 어느 단계에서 무엇을 만지든 여기 숫자가 즉시 따라온다.
 * 값은 전부 [state/world] 에서 읽는다 — 이 컴포넌트는 계산하지 않는다.
 *
 * 기온이 교육용 모델의 산출값이라는 사실을 숨기지 않는다. 데이터 표기 원칙상
 * 관측값과 모델값이 같은 얼굴로 나란히 서면 안 된다.
 */
import { useMemo } from 'react'
import { useWorld } from '../state/world'
import { PREINDUSTRIAL_CO2, THRESHOLDS } from '../lib/earthState'
import { activeScenarios } from '../lib/thresholdEngine'
import { ScenarioBand } from './ScenarioReadout'
import { useJourney } from '../state/journey'

export function Dashboard() {
  const { orbit, magneticField, co2, meanTemp, anomaly, alerts } = useWorld()
  const { stage } = useJourney()

  /*
   * 규칙 엔진을 대시보드에 붙인다 (기획안 §4).
   *
   * 엔진은 원래 S7 오른쪽 패널에서만 돌았는데, 그러면 다른 단계에서 다이얼을
   * 넘겨도 아무 일이 없다. 임계를 넘는 **그 순간** 화면 아래가 반응해야 "내가
   * 방금 선을 넘었다"가 조작으로 전달된다. 값은 state/world 에서 오므로 슬라이더를
   * 미는 동안 프레임마다 다시 맞춰진다.
   */
  const scenarios = useMemo(
    () => activeScenarios({ ...orbit, magneticField }),
    [orbit, magneticField],
  )

  /*
   * S6·S7 은 이 띠를 지구본 위로 올려 따로 띄운다 (→ components/ScenarioReadout 의
   * ScenarioFocus). 여기까지 함께 뜨면 같은 말이 한 화면에 두 번 적힌다.
   */
  return (
    <div className="relative z-20 flex flex-col">
      {stage !== 's6' && stage !== 's7' && <ScenarioBand scenarios={scenarios} />}
      <footer className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-4 md:px-8 lg:flex lg:items-stretch">
      <Metric
        label="전지구 평균기온"
        value={meanTemp.toFixed(1)}
        unit="°C"
        note={`산업화 이전 대비 ${anomaly >= 0 ? '+' : ''}${anomaly.toFixed(2)}°C`}
        tone={anomaly >= 1.5 ? 'warn' : 'normal'}
      />
      <Metric
        label="지자기 세기"
        value={magneticField.toFixed(0)}
        unit="%"
        note={alerts.magnetic ? `임계 ${THRESHOLDS.magneticCollapse}% 이하 — 차폐 상실` : '현재 지구 = 100%'}
        tone={alerts.magnetic ? 'bad' : 'normal'}
      />
      <Metric
        label="궤도 이심률"
        value={orbit.eccentricity.toFixed(3)}
        unit=""
        note={
          alerts.eccentricity
            ? `임계 ${THRESHOLDS.eccentricityExtreme} 이상 — 궤도 극단화`
            : `자전축 ${orbit.obliquity.toFixed(2)}°`
        }
        tone={alerts.eccentricity ? 'warn' : 'normal'}
      />
      <Metric
        label="CO₂ 농도"
        value={co2.toFixed(0)}
        unit="ppm"
        note={`산업화 이전 ${PREINDUSTRIAL_CO2} ppm`}
        tone={co2 > PREINDUSTRIAL_CO2 * 1.4 ? 'warn' : 'normal'}
      />

      {/* 이 줄이 없으면 모델값이 관측값인 척하게 된다 */}
      <div className="col-span-2 hidden items-center text-[9.5px] leading-snug text-ink-3/80 sm:col-span-4 lg:flex lg:min-w-[9.5rem] lg:max-w-[13rem]">
        기온은 관측값이 아니라 CO₂ 복사강제력 + 궤도 일사량으로 계산한 교육용 단순화 모델의 산출값입니다.
      </div>
      </footer>
    </div>
  )
}

const TONE_COLOR = {
  normal: 'var(--color-ink-1)',
  warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',
} as const

function Metric({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string
  value: string
  unit: string
  note: string
  tone: keyof typeof TONE_COLOR
}) {
  return (
    <div
      className="panel-quiet px-3 py-1.5 backdrop-blur-md transition-colors lg:flex-1"
      style={
        tone === 'normal'
          ? undefined
          : { borderColor: `color-mix(in oklab, ${TONE_COLOR[tone]} 45%, transparent)` }
      }
    >
      <div className="text-[9.5px] tracking-[0.1em] text-ink-3">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className="tnum text-[19px] leading-tight font-semibold transition-colors"
          style={{ color: TONE_COLOR[tone] }}
        >
          {value}
        </span>
        <span className="text-[10.5px] text-ink-3">{unit}</span>
      </div>
      <div className="truncate text-[9.5px] text-ink-3" title={note}>
        {note}
      </div>
    </div>
  )
}
