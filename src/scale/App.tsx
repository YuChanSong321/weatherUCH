/**
 * "예측의 스케일" — S0 → S8 하나의 연속된 여정.
 *
 * 화면 구성은 세 겹이다 (기획안 §2 의 공통 설계 원칙).
 *   z-0   3D 지구 — 단계가 바뀌어도 사라지지 않는다 (GlobeProvider 가 body 로 포털)
 *   z-1   암막 — 글이 많은 단계에서만 짙어진다
 *   z-10+ 무대와 HUD — 상단 시간 규모 자, 단계 화면, 하단 상시 대시보드
 *
 * 단계별 화면은 stages/ 아래, 관측 데이터 접근은 data/loader, 지구 상태는
 * state/world 만 사용한다.
 */
import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dashboard } from './components/Dashboard'
import { GlobeProvider, GlobeScrim } from './components/GlobeLayer'
import { ScaleRail } from './components/ScaleRail'
import { CITY, yearlyRange } from './data/loader'
import { buildSituation } from './lib/forecast'
import { S0Intro } from './stages/S0Intro'
import { S1Forecast } from './stages/S1'
import { S2Transition } from './stages/S2Transition'
import { S3Climate } from './stages/S3Climate'
import { S4YearGuess } from './stages/S4YearGuess'
import { S5Future } from './stages/S5Future'
import { S5Orbital } from './stages/S5Orbital'
import { S7Threshold } from './stages/S7Threshold'
import { S8Ending } from './stages/S8Ending'
import { ClimateProvider, useClimate } from './state/climate'
import { JourneyProvider, useJourney } from './state/journey'
import { PlaceProvider, usePlace } from './state/place'
import { WorldProvider } from './state/world'

export default function App() {
  return (
    <JourneyProvider>
      <WorldProvider>
        <PlaceProvider>
          {/* 40년 기후 시계열은 지역이 정해지는 순간 백그라운드로 받기 시작한다.
              S1 을 푸는 동안 끝나므로 S2 에서 기다릴 일이 없다. */}
          <ClimateProvider>
            {/* 지구는 여정·지구상태·지역 위에 얹힌다 — 셋 다 봐야 하기 때문 */}
            <GlobeProvider>
              <Journey />
            </GlobeProvider>
          </ClimateProvider>
        </PlaceProvider>
      </WorldProvider>
    </JourneyProvider>
  )
}

function Journey() {
  const { stage, runId, next, totals } = useJourney()
  const { place } = usePlace()
  const climate = useClimate()

  /*
   * S1 출제. 선택한 지역의 관측에서 만든다.
   *
   * 번들(부산)은 40년치라 매번 다른 날을 뽑아도 되지만, Open-Meteo 지역은 2주치뿐이라
   * 가장 최근 창을 쓴다 — "지금 내 동네" 라는 S0 의 몰입을 이어받는 쪽이기도 하다.
   */
  const situation = useMemo(() => {
    if (!place) return null
    return buildSituation(place.records, {
      strategy: place.source === 'kma-bundle' ? 'random' : 'recent',
      withKma: place.source === 'kma-bundle',
    })
    // runId 가 바뀌면(다시하기) 같은 지역이라도 새로 뽑는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, runId])

  /*
   * S1에서 예측했던 그 해를 S2·S3까지 끌고 간다 (여정의 연결선).
   *
   * 범위는 지금 쓰는 기후 시계열에서 읽는다 — 지역마다 자료 구간이 다르고, 구간
   * 밖의 해를 넘기면 차트가 NaN 으로 무너진다. 지역을 고르지 않고 #s2 로 바로
   * 들어오는 발표용 경로도 여기서 함께 막힌다.
   */
  const span = climate.yearly.length
    ? { first: climate.yearly[0].year, last: climate.yearly[climate.yearly.length - 1].year }
    : yearlyRange
  const focusYear = situation
    ? Math.min(span.last, Math.max(span.first, Number(situation.today.date.slice(0, 4))))
    : span.last

  // 40년 자료가 아직 오는 중이면 그 위에 세워진 세 단계를 기다리게 한다. 번들을
  // 잠깐 보여줬다가 바꿔 끼우면 사용자가 본 40년이 자기 지역이 아니게 된다.
  const climatePending = climate.status === 'loading' && (stage === 's2' || stage === 's3' || stage === 's4')

  return (
    <div className="flex h-full flex-col">
      <GlobeScrim stage={stage} />
      <ScaleRail stage={stage} score={totals} placeLabel={place?.label ?? CITY} />

      {/*
        z-10 — 지구본 캔버스가 body 에 fixed 로 깔리기 때문에, 무대가 그 위에 있다고
        명시해두지 않으면 지구본이 UI 를 덮는다.
        pointer-events — 지구를 직접 조작하는 단계에서는 무대를 통과시켜, 패널이 없는
        빈 곳을 끌면 시점이 돌아가게 한다 (패널은 각자 pointer-events-auto 로 되살린다).
        S0 이 여기 포함되지 않으면 "지구를 찍어라"가 아예 동작하지 않는다 — 무대가
        화면 전체를 덮고 있어 클릭이 캔버스까지 내려가지 못한다.
      */}
      <main
        className={`relative z-10 flex flex-1 items-center justify-center overflow-y-auto px-8 py-5 ${
          stage === 's0' || stage === 's6' || stage === 's7' ? 'pointer-events-none' : ''
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.995 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            {stage === 's0' && <S0Intro onStart={next} />}
            {/* 지역을 고르지 않고 #s1 로 바로 들어온 경우(발표용 딥링크)에도 화면이
                비지 않도록, 출제가 없으면 S0 으로 되돌린다 */}
            {stage === 's1' && (situation ? <S1Forecast situation={situation} /> : <S0Intro onStart={next} />)}
            {climatePending && <ClimateLoading label={climate.label} />}
            {stage === 's2' && !climatePending && <S2Transition year={focusYear} onNext={next} />}
            {stage === 's3' && !climatePending && <S3Climate highlightYear={focusYear} onNext={next} />}
            {stage === 's4' && !climatePending && <S4YearGuess onNext={next} />}
            {/* 규모 순: 100년(SSP) → 수만 년(궤도) → 임계 → 전체 겹쳐보기 */}
            {stage === 's5' && <S5Future onNext={next} />}
            {stage === 's6' && <S5Orbital onNext={next} />}
            {stage === 's7' && <S7Threshold onNext={next} />}
            {stage === 's8' && <S8Ending />}
          </motion.div>
        </AnimatePresence>
      </main>

      <Dashboard />
    </div>
  )
}

/** 지역의 40년 자료를 기다리는 동안. 보통은 S1 을 푸는 사이에 끝나 뜨지 않는다. */
function ClimateLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
      <div className="pulse-soft text-[13px] text-ink-2">{label}의 40년 기후 자료를 받는 중…</div>
      <p className="text-[11.5px] leading-relaxed text-ink-3">
        1985년부터의 일별 기온 약 14,600일을 한 번에 내려받고 있습니다.
      </p>
    </div>
  )
}
