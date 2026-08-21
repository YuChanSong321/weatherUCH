/**
 * 규칙 엔진이 지금 매칭한 시나리오 — 실시간 표시.
 *
 * 두 자리에 같은 컴포넌트가 선다.
 *   compact  하단 대시보드의 한 줄 띠 (여정 어디서든)
 *   focus    S7 조종석의 지구본 위 (다이얼을 잡고 있는 동안 보는 자리)
 *
 * 왜 자리를 나눴나. 하단 띠는 화면 맨 아래라 주변시에 들어간다. 그런데 S6·S7 은
 * 사용자가 **다이얼을 잡고 값을 흔들면서 결과를 지켜보는** 화면이라, 값이 바뀌는
 * 순간을 놓치면 안 된다.
 *
 * 한때 지구본 한복판에 얹어 봤다. 눈에는 확실히 띄었지만 지구본을 통째로 가려서,
 * 정작 이 화면의 절반인 '지구가 어떻게 변하는가'가 보이지 않았다. 그래서 오른쪽
 * 진단 칸의 **맨 위**로 옮겼다 — 지구본을 가리지 않으면서 진단 내용과 같은 흐름에
 * 선다. 짧은 결론이 위, 긴 설명이 아래다.
 *
 * focus 는 걸린 것이 없을 때도 **자리를 지키고 '안정'을 보여준다.** 이 화면의
 * 목적이 "무엇이 언제 바뀌는지 지켜보는 것"이라, 평소에 비어 있으면 방금 사라진
 * 것인지 원래 없던 것인지 알 수 없다. compact 는 반대다 — 늘 떠 있는 경고는
 * 경고가 아니므로 걸린 것이 없으면 자리를 비운다.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { SEVERITY_COLOR, type Severity } from '../lib/thresholdEngine'

export type ScenarioHit = { id: string; text: string; severity: Severity }

const worstOf = (list: ScenarioHit[]): Severity =>
  list.some((s) => s.severity === 'critical') ? 'critical' : list.length > 0 ? 'warning' : 'stable'

const NOTE = '규칙 기반 교육용 예측 — 지구시스템 모델의 계산이 아닙니다'

/*
 * 한때 하단 대시보드에도 같은 띠를 두었다가 뺐다. [state/world] 의 값은 단계를 넘어
 * 살아남기 때문에, S7 에서 자기장을 0 으로 만들고 나오면 부산 날씨를 맞히는 화면
 * 하단에 "오존층 파괴로 인한 UV 자외선 폭증"이 계속 떠 있었다. 그 값을 만질 수 있는
 * 화면은 S6·S7 뿐이므로 판도 거기에만 둔다.
 */

/** S6·S7 오른쪽 진단 칸 맨 위 — 항목이 들고 날 때 눈에 걸리도록 */
export function ScenarioFocus({ scenarios }: { scenarios: ScenarioHit[] }) {
  const worst = worstOf(scenarios)
  const tone = SEVERITY_COLOR[worst]
  return (
    <div
      className="hud-panel pointer-events-auto w-full shrink-0 px-4 py-3"
      role="status"
      aria-live="polite"
      style={{
        borderColor: `color-mix(in oklab, ${tone} 45%, transparent)`,
        background: `color-mix(in oklab, ${tone} 10%, rgb(10 15 24 / 0.82))`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="hud-title" style={{ color: tone }}>
          실시간 예측 시나리오
        </span>
        <span className="hud-badge" style={{ color: tone, borderColor: `color-mix(in oklab, ${tone} 45%, transparent)` }}>
          {worst === 'critical' ? '위험' : worst === 'warning' ? '주의' : '안정'}
        </span>
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        {/*
          popLayout — 항목이 빠지면 남은 것들이 그 자리로 미끄러진다. 그냥 사라지면
          목록이 툭 튀어 무엇이 없어졌는지 눈이 따라가지 못한다.
        */}
        <AnimatePresence initial={false} mode="popLayout">
          {scenarios.length === 0 ? (
            <motion.div
              key="stable"
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-2.5 text-[13px]"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: SEVERITY_COLOR.stable, boxShadow: `0 0 8px ${SEVERITY_COLOR.stable}` }}
              />
              <span className="text-ink-2">세 값 모두 안전 구간입니다 — 걸린 시나리오가 없습니다.</span>
            </motion.div>
          ) : (
            scenarios.map((s) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.22 }}
                className="flex items-center gap-2.5 text-[13.5px] leading-snug"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: SEVERITY_COLOR[s.severity],
                    boxShadow: `0 0 8px ${SEVERITY_COLOR[s.severity]}`,
                  }}
                />
                <span className="font-medium text-ink-1">{s.text}</span>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <p className="mt-2 text-[9.5px] text-ink-3">{NOTE}</p>
    </div>
  )
}
