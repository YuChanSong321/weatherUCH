/**
 * "예측의 스케일" — S0 → S7 하나의 연속된 줌아웃 여정.
 * 단계별 화면은 stages/ 아래, 데이터 접근은 data/loader 만 사용한다.
 */
import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ScaleRail } from './components/ScaleRail'
import { StarField } from './components/StarField'
import { caseIndexOf, pickCase, type ForecastCase, type RoundNumber } from './lib/forecast'
import { S0Intro } from './stages/S0Intro'
import { S1Forecast } from './stages/S1'
import { S2Transition } from './stages/S2Transition'
import { S3Climate } from './stages/S3Climate'
import { S4YearGuess } from './stages/S4YearGuess'
import { S5Future } from './stages/S5Future'
import { S6Orbital } from './stages/S6'
import { S7Ending } from './stages/S7Ending'
import { JourneyProvider, STAGE_SCALE, useJourney } from './state/journey'

export default function App() {
  return (
    <JourneyProvider>
      <Journey />
    </JourneyProvider>
  )
}

/** 3라운드 출제를 한 번에 뽑는다 (같은 기압골 중복 출제 방지) */
function makeCases(): ForecastCase[] {
  const used: number[] = []
  return ([1, 2, 3] as RoundNumber[]).map((round) => {
    const c = pickCase(round, used)
    used.push(caseIndexOf(c))
    return c
  })
}

function Journey() {
  const { stage, runId, next, totals } = useJourney()
  const cases = useMemo(() => makeCases(), [runId])
  const act = STAGE_SCALE[stage].act
  // S1에서 예측했던 그 해를 S2·S3까지 끌고 간다 (여정의 연결선)
  const focusYear = Number(cases[0].today.date.slice(0, 4))

  return (
    <div className="flex h-full flex-col">
      <StarField act={act} />
      <ScaleRail stage={stage} score={totals} />

      <main className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.995 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            {stage === 's0' && <S0Intro firstCase={cases[0]} onStart={next} />}
            {stage === 's1' && <S1Forecast cases={cases} />}
            {stage === 's2' && <S2Transition year={focusYear} onNext={next} />}
            {stage === 's3' && <S3Climate highlightYear={focusYear} onNext={next} />}
            {stage === 's4' && <S4YearGuess onNext={next} />}
            {stage === 's5' && <S5Future onNext={next} />}
            {stage === 's6' && <S6Orbital onNext={next} />}
            {stage === 's7' && <S7Ending />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
