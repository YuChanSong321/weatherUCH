/**
 * S8 · 여정의 끝 — 두 시계를 겹쳐 보고, 처음의 질문을 회수한다.
 *
 * 한 단계 안의 두 국면이다.
 *   ① 탄소 대조 — 274년과 5만 년을 로그 시간축 한 화면에 겹친다 ([S6Carbon])
 *   ② U자 회수 — S0 의 질문에 답하고 총점을 낸다 ([S7Ending])
 *
 * 이 자리에 온 이유: 시간 규모가 단조로 커지는 여정에서 '전체를 겹쳐 보는 것'은
 * 되돌아가는 것이 아니라 가장 멀리 물러난 자리에서만 할 수 있는 일이다.
 */
import { useState } from 'react'
import { S6Carbon } from './S6Carbon'
import { S7Ending } from './S7Ending'

export function S8Ending() {
  const [step, setStep] = useState<'carbon' | 'result'>('carbon')
  return step === 'carbon' ? <S6Carbon onNext={() => setStep('result')} /> : <S7Ending />
}
