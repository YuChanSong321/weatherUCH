/**
 * S1(며칠 예측) 규칙 엔진 — 출제 / 채점 / "왜 어긋났는지" 해설.
 *
 * 설계 원칙
 *  - 출제는 매 플레이마다 랜덤이지만, 라운드마다 "가르치려는 규칙이 실제로 보이는 날"만
 *    골라낸다. 아무 날이나 뽑으면 해설이 데이터와 어긋나 교육 효과가 무너진다.
 *  - 채점 문구는 감점이 아니라 발견 프레임. 틀린 이유를 데이터의 실제 숫자로 말한다.
 */
import { daily, getPastForecast } from '../data/loader'
import type { Advisory, DailyRecord, DtrClass, PastForecast, PrecipClass, WindFamily } from '../types'

export type RoundNumber = 1 | 2 | 3
export type BonusKind = 'dtr' | 'wind' | null

export type ForecastCase = {
  round: RoundNumber
  /** 관측 3일 (마지막 원소가 '오늘' = 예보 기준일) */
  history: DailyRecord[]
  today: DailyRecord
  /** 사용자가 맞혀야 하는 '내일' */
  answer: DailyRecord
  bonus: BonusKind
  /** 종관 국면 요약 (해설 생성용) */
  features: CaseFeatures
  /** 그날 기상청이 실제로 냈던 예보 — 세 번째 플레이어. 없는 날도 있다. */
  kma: PastForecast | null
  /**
   * 라운드 시작에 띄우는 기상특보 배지.
   *
   * '오늘'(= 예보 기준일)의 특보다. 정답인 '내일'의 특보를 미리 보여주면
   * 호우주의보 한 줄이 강수 4지선다의 답을 그대로 알려주는 셈이 된다.
   */
  todayAdvisory: Advisory | null
}

export type CaseFeatures = {
  pressureTrend: number
  humidityTrend: number
  tmaxDelta: number
  answerDtr: number
}

export type Guess = {
  tmax: number
  precip: PrecipClass
  bonus: DtrClass | WindFamily | null
}

export type ItemScore = {
  label: string
  earned: number
  max: number
  verdict: 'hit' | 'near' | 'miss'
  headline: string
  why: string
}

export type RoundScore = {
  round: RoundNumber
  items: ItemScore[]
  earned: number
  max: number
  tmaxError: number
  lesson: string
  /** 기상청과의 3자 대결. 그날 예보 자료가 없으면 null. */
  kma: KmaCompare | null
}

/** "당신 / 기상청 / 실제" 세 값의 비교 결과. */
export type KmaCompare = {
  tmax: number
  /** 기상청의 최고기온 오차 */
  error: number
  /** 사용자 오차 − 기상청 오차. 음수면 사용자가 이겼다. */
  margin: number
  userWins: boolean
  precipClass: PrecipClass
  precipHit: boolean
  precipProb: number | null
  /**
   * 기상청도 크게 어긋난 날. 이게 참이면 화면은 감점이 아니라 발견을 띄운다 —
   * 슈퍼컴퓨터와 수백 명의 예보관도 틀린다는 사실이 이 콘텐츠의 핵심이다.
   */
  kmaMissed: boolean
}

/** 기상청 예보도 함께 채점한다. 사용자와 같은 기준(최고기온 오차·강수 등급)으로. */
function compareWithKma(c: ForecastCase, guess: Guess): KmaCompare | null {
  if (!c.kma) return null
  const actualClass = precipClassOf(c.answer.precip)
  const error = Math.abs(c.kma.tmax - c.answer.tmax)
  const userError = Math.abs(guess.tmax - c.answer.tmax)
  const precipHit = c.kma.precipClass === actualClass
  return {
    tmax: c.kma.tmax,
    error,
    margin: userError - error,
    // 동점(0.05℃ 이내)은 사용자의 승리로 치지 않는다
    userWins: userError < error - 0.05,
    precipClass: c.kma.precipClass,
    precipHit,
    precipProb: c.kma.precipProb ?? null,
    kmaMissed: error >= 2 || !precipHit,
  }
}

export const PRECIP_CLASSES: { id: PrecipClass; label: string; range: string }[] = [
  { id: 'none', label: '비 없음', range: '0 mm' },
  { id: 'light', label: '약한 비', range: '0.1 – 5 mm' },
  { id: 'rain', label: '비', range: '5 – 20 mm' },
  { id: 'heavy', label: '많은 비', range: '20 mm 이상' },
]

export const DTR_CLASSES: { id: DtrClass; label: string; range: string }[] = [
  { id: 'small', label: '작다', range: '5℃ 미만' },
  { id: 'mid', label: '보통', range: '5 – 10℃' },
  { id: 'large', label: '크다', range: '10℃ 초과' },
]

export const WIND_FAMILIES: { id: WindFamily; label: string; hint: string }[] = [
  { id: 'N', label: '북풍 계열', hint: '차가운 공기 유입' },
  { id: 'E', label: '동풍 계열', hint: '해양성 습기' },
  { id: 'S', label: '남풍 계열', hint: '따뜻한 공기 유입' },
  { id: 'W', label: '서풍 계열', hint: '대륙 통과 기류' },
]

export const precipClassOf = (mm: number): PrecipClass =>
  mm < 0.1 ? 'none' : mm < 5 ? 'light' : mm < 20 ? 'rain' : 'heavy'

export const dtrClassOf = (dtr: number): DtrClass =>
  dtr < 5 ? 'small' : dtr <= 10 ? 'mid' : 'large'

export const dtrOf = (r: DailyRecord): number => Number((r.tmax - r.tmin).toFixed(1))

export const skyOf = (cloud: number): string =>
  cloud <= 2.5 ? '맑음' : cloud <= 5.5 ? '구름 조금' : cloud <= 8 ? '구름 많음' : '흐림'

const labelOfPrecip = (c: PrecipClass) => PRECIP_CLASSES.find((p) => p.id === c)!.label
const labelOfDtr = (c: DtrClass) => DTR_CLASSES.find((p) => p.id === c)!.label
const labelOfWind = (c: WindFamily) => WIND_FAMILIES.find((p) => p.id === c)!.label

// ────────────────────────────────────────────────────────────── 출제

type Candidate = { index: number; features: CaseFeatures }

/** 3일 관측 + 다음날 정답을 뽑을 수 있는 모든 위치 */
const candidates: Candidate[] = (() => {
  const out: Candidate[] = []
  for (let i = 2; i < daily.length - 1; i++) {
    const prev = daily[i - 1]
    const today = daily[i]
    const answer = daily[i + 1]
    out.push({
      index: i,
      features: {
        pressureTrend: Number((today.pressure - prev.pressure).toFixed(1)),
        humidityTrend: today.humidity - prev.humidity,
        tmaxDelta: Number((answer.tmax - today.tmax).toFixed(1)),
        answerDtr: dtrOf(answer),
      },
    })
  }
  return out
})()

/** 라운드별 조건 — 앞쪽이 이상적, 뒤로 갈수록 완화된 조건(폴백) */
const roundFilters: Record<RoundNumber, ((c: Candidate) => boolean)[]> = {
  // R1: 지속성이 통하는 조용한 날 + 하늘 상태가 일교차로 또렷하게 이어지는 날
  1: [
    (c) => {
      const answer = daily[c.index + 1]
      const quiet = Math.abs(c.features.tmaxDelta) <= 2.5
      const clearAndWide = c.features.pressureTrend > 1 && answer.cloud <= 3 && c.features.answerDtr > 10
      const cloudyAndNarrow = c.features.pressureTrend < -1 && answer.cloud >= 8 && c.features.answerDtr < 5
      return quiet && (clearAndWide || cloudyAndNarrow)
    },
    (c) => Math.abs(c.features.tmaxDelta) <= 3 && (c.features.answerDtr > 9 || c.features.answerDtr < 5.5),
    (c) => Math.abs(c.features.tmaxDelta) <= 3.5,
  ],
  // R2: 풍향과 기온 변화가 한 몸으로 움직이는 날 (북풍=하강 / 남풍=상승)
  2: [
    (c) => {
      const answer = daily[c.index + 1]
      const cold = answer.windFamily === 'N' && c.features.tmaxDelta <= -1.5 && c.features.pressureTrend > 0
      const warm = answer.windFamily === 'S' && c.features.tmaxDelta >= 1.5 && c.features.pressureTrend < 0
      return cold || warm
    },
    (c) => {
      const answer = daily[c.index + 1]
      return (
        (answer.windFamily === 'N' && c.features.tmaxDelta <= -1) ||
        (answer.windFamily === 'S' && c.features.tmaxDelta >= 1)
      )
    },
    (c) => daily[c.index + 1].windFamily === 'N' || daily[c.index + 1].windFamily === 'S',
  ],
  // R3: 지속성이 깨지는 날 — 전선 통과 / 한기 남하처럼 변동이 큰 날
  3: [
    // 기상특보가 걸려 있던 날을 우선한다. R3가 보여주려는 '대기가 어제를 배신하는
    // 날'이 곧 특보가 나가는 날이고, 그래야 배지가 죽은 기능이 되지 않는다.
    // 특보 자료가 없거나 후보가 모자라면 아래 조건들로 조용히 내려간다.
    (c) => Math.abs(c.features.tmaxDelta) >= 4 && !!getPastForecast(daily[c.index].date)?.advisory,
    (c) => Math.abs(c.features.tmaxDelta) >= 5 && Math.abs(c.features.pressureTrend) >= 3,
    (c) => Math.abs(c.features.tmaxDelta) >= 4,
    (c) => Math.abs(c.features.tmaxDelta) >= 3,
  ],
}

const BONUS_BY_ROUND: Record<RoundNumber, BonusKind> = { 1: 'dtr', 2: 'wind', 3: null }

/** 라운드 케이스를 랜덤으로 뽑는다. usedIndexes 로 같은 판에서 중복 출제를 막는다. */
export function pickCase(round: RoundNumber, usedIndexes: number[] = []): ForecastCase {
  const used = new Set(usedIndexes)
  let pool: Candidate[] = []
  for (const filter of roundFilters[round]) {
    pool = candidates.filter((c) => filter(c) && !used.has(c.index) && !nearAny(c.index, used))
    if (pool.length >= 5) break
  }
  if (pool.length === 0) pool = candidates.filter((c) => !used.has(c.index))

  const chosen = pool[Math.floor(Math.random() * pool.length)]
  const i = chosen.index
  return {
    round,
    history: [daily[i - 2], daily[i - 1], daily[i]],
    today: daily[i],
    answer: daily[i + 1],
    bonus: BONUS_BY_ROUND[round],
    features: chosen.features,
    kma: getPastForecast(daily[i + 1].date) ?? null,
    todayAdvisory: getPastForecast(daily[i].date)?.advisory ?? null,
  }
}

/** 이미 출제한 날과 붙어 있는 날은 피한다 (같은 기압골을 두 번 보여주지 않기) */
const nearAny = (index: number, used: Set<number>): boolean => {
  for (const u of used) if (Math.abs(u - index) <= 4) return true
  return false
}

export const caseIndexOf = (c: ForecastCase): number => daily.indexOf(c.today)

// ────────────────────────────────────────────────────────────── 채점

const TMAX_MAX = 50
const PRECIP_MAX = 30
const BONUS_MAX = 20

const tmaxScore = (error: number): number => {
  if (error <= 0.7) return TMAX_MAX
  const decay = Math.min(1, ((error - 0.7) / 5) ** 1.1)
  return Math.max(0, Math.round(TMAX_MAX * (1 - decay)))
}

const PRECIP_ORDER: PrecipClass[] = ['none', 'light', 'rain', 'heavy']
const DTR_ORDER: DtrClass[] = ['small', 'mid', 'large']

const stepScore = (max: number, distance: number): number =>
  distance === 0 ? max : distance === 1 ? Math.round(max * 0.4) : distance === 2 ? Math.round(max * 0.1) : 0

/** 풍향은 반대편(북↔남)이면 0, 인접(북↔동)이면 부분점수 */
const windDistance = (a: WindFamily, b: WindFamily): number => {
  const deg: Record<WindFamily, number> = { N: 0, E: 90, S: 180, W: 270 }
  const d = Math.abs(deg[a] - deg[b])
  const wrapped = Math.min(d, 360 - d)
  return wrapped === 0 ? 0 : wrapped === 90 ? 1 : 3
}

export function scoreRound(c: ForecastCase, guess: Guess): RoundScore {
  const items: ItemScore[] = [scoreTmax(c, guess.tmax), scorePrecip(c, guess.precip)]
  if (c.bonus === 'dtr') items.push(scoreDtr(c, guess.bonus as DtrClass))
  if (c.bonus === 'wind') items.push(scoreWind(c, guess.bonus as WindFamily))

  return {
    round: c.round,
    items,
    earned: items.reduce((s, i) => s + i.earned, 0),
    max: items.reduce((s, i) => s + i.max, 0),
    tmaxError: Math.abs(guess.tmax - c.answer.tmax),
    lesson: lessonOf(c),
    kma: compareWithKma(c, guess),
  }
}

/** 3라운드 종합 — 당신 vs 기상청 평균 오차. 비교 가능한 라운드만 센다. */
export function kmaSeasonSummary(rounds: RoundScore[]): {
  rounds: number
  userMae: number
  kmaMae: number
  wins: number
  kmaMissedRounds: number
} | null {
  const usable = rounds.filter((r) => r.kma)
  if (usable.length === 0) return null
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  return {
    rounds: usable.length,
    userMae: mean(usable.map((r) => r.tmaxError)),
    kmaMae: mean(usable.map((r) => r.kma!.error)),
    wins: usable.filter((r) => r.kma!.userWins).length,
    kmaMissedRounds: usable.filter((r) => r.kma!.kmaMissed).length,
  }
}

function scoreTmax(c: ForecastCase, guess: number): ItemScore {
  const actual = c.answer.tmax
  const error = Math.abs(guess - actual)
  const delta = c.features.tmaxDelta
  const verdict = error <= 1 ? 'hit' : error <= 2.5 ? 'near' : 'miss'
  const highOrLow = guess > actual ? '높게' : '낮게'

  const headline =
    verdict === 'hit'
      ? `적중 — 실제 ${actual.toFixed(1)}℃, 오차 ${error.toFixed(1)}℃`
      : verdict === 'near'
        ? `거의 맞혔다 — 실제 ${actual.toFixed(1)}℃, ${error.toFixed(1)}℃ ${highOrLow} 찍었다`
        : `어긋났다 — 실제 ${actual.toFixed(1)}℃, ${error.toFixed(1)}℃ ${highOrLow} 찍었다`

  const persistence = `어제와 비슷하게 찍는 것(지속성)만으로도 ${Math.abs(delta).toFixed(1)}℃ 오차였을 날이다.`
  const cause = causeOfTempChange(c)
  const why =
    Math.abs(delta) < 1.5
      ? `${persistence} 대기가 조용한 날은 어제가 곧 내일의 답이다.`
      : `${persistence} ${cause}`

  return { label: '최고기온', earned: tmaxScore(error), max: TMAX_MAX, verdict, headline, why }
}

/** 기온이 왜 움직였는지를 실제 관측 숫자로 설명 */
function causeOfTempChange(c: ForecastCase): string {
  const { answer, features } = c
  const parts: string[] = []
  if (features.tmaxDelta <= -1.5) {
    if (answer.windFamily === 'N') parts.push(`다음날 ${answer.windDir}풍(${answer.windSpeed} m/s)이 들어오며 찬 공기가 남하했다`)
    if (features.pressureTrend > 1.5) parts.push(`기압이 ${features.pressureTrend > 0 ? '+' : ''}${features.pressureTrend} hPa 올라 고기압이 확장했다`)
    if (answer.precip >= 1) parts.push(`비(${answer.precip} mm)가 낮 기온을 눌렀다`)
    return `기온이 ${Math.abs(features.tmaxDelta).toFixed(1)}℃ 내려간 이유: ${parts.join(', ') || '한기가 유입됐다'}.`
  }
  if (features.tmaxDelta >= 1.5) {
    if (answer.windFamily === 'S') parts.push(`${answer.windDir}풍으로 따뜻한 공기가 밀려 올라왔다`)
    if (features.pressureTrend < -1.5) parts.push(`기압이 ${features.pressureTrend} hPa 내려가 저기압이 접근했다`)
    if (answer.cloud <= 3) parts.push('맑은 하늘에서 햇빛이 그대로 들어왔다')
    return `기온이 ${features.tmaxDelta.toFixed(1)}℃ 올라간 이유: ${parts.join(', ') || '남풍이 유입됐다'}.`
  }
  return '기온을 밀어올리거나 끌어내릴 만한 신호가 약했던 날이다.'
}

function scorePrecip(c: ForecastCase, guess: PrecipClass): ItemScore {
  const actualClass = precipClassOf(c.answer.precip)
  const distance = Math.abs(PRECIP_ORDER.indexOf(guess) - PRECIP_ORDER.indexOf(actualClass))
  const verdict = distance === 0 ? 'hit' : distance === 1 ? 'near' : 'miss'
  const { pressureTrend, humidityTrend } = c.features

  const signal =
    pressureTrend < -1 && humidityTrend > 2
      ? `기압 ${pressureTrend} hPa 하강 + 습도 ${humidityTrend > 0 ? '+' : ''}${humidityTrend}%p 상승 — 저기압이 다가오는 전형적인 강수 신호였다.`
      : pressureTrend > 1 && humidityTrend < 0
        ? `기압 +${pressureTrend} hPa 상승 + 습도 ${humidityTrend}%p 하강 — 고기압권에서 비가 오기 어려운 상태였다.`
        : `기압 ${pressureTrend > 0 ? '+' : ''}${pressureTrend} hPa, 습도 ${humidityTrend > 0 ? '+' : ''}${humidityTrend}%p — 신호가 뚜렷하지 않은 애매한 날이었다.`

  const headline =
    distance === 0
      ? `적중 — 실제 ${labelOfPrecip(actualClass)} (${c.answer.precip} mm)`
      : `실제로는 ${labelOfPrecip(actualClass)} (${c.answer.precip} mm)`

  return {
    label: '강수',
    earned: stepScore(PRECIP_MAX, distance),
    max: PRECIP_MAX,
    verdict,
    headline,
    why: signal,
  }
}

function scoreDtr(c: ForecastCase, guess: DtrClass): ItemScore {
  const dtr = c.features.answerDtr
  const actualClass = dtrClassOf(dtr)
  const distance = Math.abs(DTR_ORDER.indexOf(guess) - DTR_ORDER.indexOf(actualClass))
  const verdict = distance === 0 ? 'hit' : distance === 1 ? 'near' : 'miss'

  const why =
    dtr > 10
      ? `다음날 운량은 ${c.answer.cloud}/10 — 하늘이 열려 있어 낮에는 햇빛이 그대로 들어오고 밤에는 열이 우주로 빠져나갔다. 구름 이불이 없으면 하루의 기온 폭이 벌어진다.`
      : dtr < 5
        ? `다음날 운량은 ${c.answer.cloud}/10 — 구름이 이불처럼 덮여 낮에는 햇빛을 막고 밤에는 열을 붙잡았다. 그래서 하루의 기온 폭이 좁아졌다.`
        : `다음날 운량은 ${c.answer.cloud}/10 — 구름 이불이 반쯤 걷힌 상태였다.`

  return {
    label: '일교차',
    earned: stepScore(BONUS_MAX, distance),
    max: BONUS_MAX,
    verdict,
    headline:
      distance === 0
        ? `적중 — 실제 ${labelOfDtr(actualClass)} (${dtr.toFixed(1)}℃)`
        : `실제로는 ${labelOfDtr(actualClass)} (${dtr.toFixed(1)}℃)`,
    why: `${why} 하루의 기온 폭을 정하는 건 구름이지만, 1년의 기온 폭(연교차)을 정하는 건 전혀 다른 것이다 — 3단계에서 만난다.`,
  }
}

function scoreWind(c: ForecastCase, guess: WindFamily): ItemScore {
  const actual = c.answer.windFamily
  const distance = windDistance(guess, actual)
  const verdict = distance === 0 ? 'hit' : distance === 1 ? 'near' : 'miss'
  const delta = c.features.tmaxDelta

  const why =
    actual === 'N'
      ? `실제 풍향 ${c.answer.windDir}(${c.answer.windDeg}°). 북풍 계열은 찬 공기를 실어 오는 컨베이어 벨트다 — 그래서 기온이 ${Math.abs(delta).toFixed(1)}℃ 내려갔다. 기압이 오르기 시작하면 북풍을 의심하라.`
      : actual === 'S'
        ? `실제 풍향 ${c.answer.windDir}(${c.answer.windDeg}°). 남풍 계열은 따뜻하고 습한 공기를 밀어 올린다 — 그래서 기온이 ${delta.toFixed(1)}℃ 올라갔다. 기압이 내려가면 남풍을 의심하라.`
        : `실제 풍향 ${c.answer.windDir}(${c.answer.windDeg}°). 기압계의 회전이 만드는 방향이다.`

  return {
    label: '풍향',
    earned: stepScore(BONUS_MAX, distance === 3 ? 3 : distance),
    max: BONUS_MAX,
    verdict,
    headline: distance === 0 ? `적중 — 실제 ${labelOfWind(actual)}` : `실제로는 ${labelOfWind(actual)}`,
    why,
  }
}

/** 라운드가 가르치려는 한 줄 */
function lessonOf(c: ForecastCase): string {
  switch (c.round) {
    case 1:
      return '규칙 1 · 지속성 — 하루 뒤의 대기는 오늘의 대기와 대체로 닮아 있다. 그래서 며칠은 맞힐 수 있다.'
    case 2:
      return '규칙 2 · 기압과 바람은 한 몸 — 기압이 내려가면 남풍과 비, 올라가면 북풍과 한기. 지도를 읽으면 예측이 된다.'
    case 3:
      return Math.abs(c.features.tmaxDelta) >= 4
        ? '규칙 3 · 그런데 대기는 가끔 어제를 배신한다 — 전선이 지나간 날, 지속성은 무너진다. 이 배신이 며칠만 지나면 예측 전체를 삼킨다.'
        : '규칙 3 · 대기는 언제 어제를 배신할지 알려주지 않는다 — 이 불확실성이 시간이 갈수록 커진다.'
  }
}

/** 총점에 대한 격려 문구 (감점이 아니라 발견 프레임) */
export function verdictOfTotal(earned: number, max: number): { title: string; body: string } {
  const ratio = max === 0 ? 0 : earned / max
  if (ratio >= 0.8)
    return {
      title: '당신은 며칠 앞을 읽어냈다',
      body: '축하한다 — 그리고 이건 우연이 아니다. 며칠 규모의 대기는 실제로 예측 가능하다. 그럼 이 실력으로 2주 뒤를 맞힐 수 있을까?',
    }
  if (ratio >= 0.5)
    return {
      title: '절반은 읽어냈다',
      body: '어긋난 쪽이 더 흥미롭다. 기압과 습도, 바람은 서로를 붙잡고 움직인다 — 그 사슬을 읽는 만큼 며칠은 맞힐 수 있다.',
    }
  return {
    title: '어긋났다면, 제대로 발견한 것이다',
    body: '세계 최고의 슈퍼컴퓨터도 며칠 뒤부터는 손을 든다. 지금 느낀 그 어긋남이 바로 다음 단계의 주제다.',
  }
}
