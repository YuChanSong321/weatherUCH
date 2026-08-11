/**
 * S1(며칠 예측) 규칙 엔진 — 출제 / 채점 / "왜 어긋났는지" 해설.
 *
 * 설계 원칙
 *  - 출제는 매 플레이마다 랜덤이지만, 라운드마다 "가르치려는 규칙이 실제로 보이는 날"만
 *    골라낸다. 아무 날이나 뽑으면 해설이 데이터와 어긋나 교육 효과가 무너진다.
 *  - 채점 문구는 감점이 아니라 발견 프레임. 틀린 이유를 데이터의 실제 숫자로 말한다.
 */
import { getPastForecast } from '../data/loader'
import type { Advisory, DailyRecord, PastForecast, PrecipClass } from '../types'

export type RoundNumber = 1 | 2 | 3

/**
 * 라운드마다 묻는 것이 하나씩이다 (기획안 §3 S1).
 *   R1 내일 최고기온 50점 / R2 내일 강수 30점 / R3 3일 뒤 최고기온 20점 = 100점
 *
 * 세 라운드는 **같은 상황**을 본다. 사용자가 S0 에서 찍은 지역의 자료는 2주치뿐일
 * 수 있어(Open-Meteo) 라운드마다 다른 국면을 골라 줄 수가 없다. 대신 R3 에서
 * '3일 뒤'를 묻는 것이 그 자리를 대신한다 — 하루 뒤와 사흘 뒤의 난이도 차이가
 * 곧 이 콘텐츠의 주제(예측 가능성의 감소)다.
 */
export type RoundKind = 'tmax' | 'precip' | 'tmax3'

export const ROUND_KIND: Record<RoundNumber, RoundKind> = { 1: 'tmax', 2: 'precip', 3: 'tmax3' }
export const ROUND_MAX: Record<RoundNumber, number> = { 1: 50, 2: 30, 3: 20 }

/** S1 전체 배점 — 기획안 §6 의 확정값 100점 */
export const S1_TOTAL = ROUND_MAX[1] + ROUND_MAX[2] + ROUND_MAX[3]

/** 한 판에서 세 라운드가 공유하는 기상 상황 */
export type Situation = {
  /** 관측 3일 (마지막 원소가 '오늘' = 예보 기준일) */
  history: DailyRecord[]
  today: DailyRecord
  /** R1·R2 의 정답 — '내일' */
  answer: DailyRecord
  /** R3 의 정답 — '3일 뒤' */
  answer3: DailyRecord
  /** 종관 국면 요약 (해설 생성용) */
  features: CaseFeatures
  /** 그날 기상청이 실제로 냈던 예보 — 세 번째 플레이어. 번들 지역에만 있다. */
  kma: PastForecast | null
  /**
   * 라운드 시작에 띄우는 기상특보 배지.
   *
   * '오늘'(= 예보 기준일)의 특보다. 정답인 '내일'의 특보를 미리 보여주면
   * 호우주의보 한 줄이 강수 4지선다의 답을 그대로 알려주는 셈이 된다.
   */
  todayAdvisory: Advisory | null
}

export type ForecastCase = Situation & { round: RoundNumber; kind: RoundKind }

export const caseOf = (s: Situation, round: RoundNumber): ForecastCase => ({
  ...s,
  round,
  kind: ROUND_KIND[round],
})

export type CaseFeatures = {
  pressureTrend: number
  humidityTrend: number
  tmaxDelta: number
  answerDtr: number
}

/** 라운드마다 채워지는 칸이 하나뿐이다 */
export type Guess = {
  tmax?: number
  precip?: PrecipClass
  tmax3?: number
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
  kind: RoundKind
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
  // 강수 라운드에서는 기온 대결이 성립하지 않는다. 사용자가 기온을 찍지 않았으므로
  // '오늘과 같음'을 사용자의 암묵적 답으로 두면 이기지도 지지도 않은 값을 만든다 —
  // 대신 오차 비교를 무효(NaN 대신 동점)로 두고 화면이 강수만 비교하게 한다.
  const userError = guess.tmax === undefined ? error : Math.abs(guess.tmax - c.answer.tmax)
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

export const precipClassOf = (mm: number): PrecipClass =>
  mm < 0.1 ? 'none' : mm < 5 ? 'light' : mm < 20 ? 'rain' : 'heavy'

export const dtrOf = (r: DailyRecord): number => Number((r.tmax - r.tmin).toFixed(1))

export const skyOf = (cloud: number): string =>
  cloud <= 2.5 ? '맑음' : cloud <= 5.5 ? '구름 조금' : cloud <= 8 ? '구름 많음' : '흐림'

const labelOfPrecip = (c: PrecipClass) => PRECIP_CLASSES.find((p) => p.id === c)!.label

// ────────────────────────────────────────────────────────────── 출제

/** 두 날짜가 하루 차이인가 — 실측에는 결측일이 있어 배열이 연속을 보장하지 않는다 */
const isNextDay = (a: string, b: string): boolean =>
  Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z') === 86_400_000

/**
 * 한 상황이 되려면 **연속된 여섯 날**이 필요하다.
 *   i-2, i-1, i (관측 3일)  ·  i+1 (내일)  ·  i+2  ·  i+3 (3일 뒤)
 *
 * ⚠️ 배열 인덱스가 곧 '어제'라고 가정하면 안 된다. 실측 ASOS 에는 결측일이 있고
 * (예: 2023-05-24 는 최저기온이 -99 로 와서 통째로 빠졌다), 그 자리에서는
 * records[i-1] 이 실제로는 이틀 전이 된다. 그러면 "어제와 비슷하게 찍으면"이라는
 * S1 의 지속성 수업이 조용히 거짓이 된다. Open-Meteo 쪽도 결측일을 버리고 오므로
 * 같은 검사가 필요하다.
 */
function validWindows(records: DailyRecord[]): number[] {
  const out: number[] = []
  for (let i = 2; i + 3 < records.length; i++) {
    let ok = true
    for (let k = i - 2; k < i + 3; k++) {
      if (!isNextDay(records[k].date, records[k + 1].date)) {
        ok = false
        break
      }
    }
    if (ok) out.push(i)
  }
  return out
}

const featuresAt = (records: DailyRecord[], i: number): CaseFeatures => ({
  pressureTrend: Number((records[i].pressure - records[i - 1].pressure).toFixed(1)),
  humidityTrend: records[i].humidity - records[i - 1].humidity,
  tmaxDelta: Number((records[i + 1].tmax - records[i].tmax).toFixed(1)),
  answerDtr: dtrOf(records[i + 1]),
})

export type SituationOptions = {
  /**
   * 'recent' — 가장 최근 창을 쓴다. 2주치뿐인 Open-Meteo 지역에서 "지금 내 동네"
   *            느낌을 살리는 쪽.
   * 'random' — 40년 번들에서 무작위로 뽑는다. 다시 하기가 의미를 갖는다.
   */
  strategy: 'recent' | 'random'
  /** 그날 기상청이 냈던 예보를 붙일 수 있는가 (번들 지역만) */
  withKma: boolean
}

/**
 * 관측 배열에서 한 판의 상황을 만든다.
 *
 * 번들(부산)에서는 기상청 예보가 붙는 창을 우선한다 — 3자 대결이 이 콘텐츠의
 * 핵심 장면이라, 예보가 없는 날을 뽑으면 그 장면이 통째로 사라진다.
 */
export function buildSituation(records: DailyRecord[], opts: SituationOptions): Situation | null {
  const windows = validWindows(records)
  if (windows.length === 0) return null

  let i: number
  if (opts.strategy === 'recent') {
    i = windows[windows.length - 1]
  } else {
    const withForecast = opts.withKma
      ? windows.filter((w) => getPastForecast(records[w + 1].date))
      : []
    const pool = withForecast.length > 0 ? withForecast : windows
    i = pool[Math.floor(Math.random() * pool.length)]
  }

  return {
    history: [records[i - 2], records[i - 1], records[i]],
    today: records[i],
    answer: records[i + 1],
    answer3: records[i + 3],
    features: featuresAt(records, i),
    kma: opts.withKma ? (getPastForecast(records[i + 1].date) ?? null) : null,
    todayAdvisory: opts.withKma ? (getPastForecast(records[i].date)?.advisory ?? null) : null,
  }
}

// ────────────────────────────────────────────────────────────── 채점

const TMAX_MAX = ROUND_MAX[1]
const PRECIP_MAX = ROUND_MAX[2]
const TMAX3_MAX = ROUND_MAX[3]

/** 오차에 반비례하는 배점. 만점 폭(0.7℃)은 관측 반올림 오차보다 넉넉하게 잡았다. */
const tmaxScore = (error: number, max: number): number => {
  if (error <= 0.7) return max
  const decay = Math.min(1, ((error - 0.7) / 5) ** 1.1)
  return Math.max(0, Math.round(max * (1 - decay)))
}

const PRECIP_ORDER: PrecipClass[] = ['none', 'light', 'rain', 'heavy']

const stepScore = (max: number, distance: number): number =>
  distance === 0 ? max : distance === 1 ? Math.round(max * 0.4) : distance === 2 ? Math.round(max * 0.1) : 0

/** 라운드 하나 = 문항 하나. 그 라운드가 묻지 않은 것은 채점하지 않는다. */
export function scoreRound(c: ForecastCase, guess: Guess): RoundScore {
  const items: ItemScore[] =
    c.kind === 'tmax'
      ? [scoreTmax(c, guess.tmax ?? c.today.tmax)]
      : c.kind === 'precip'
        ? [scorePrecip(c, guess.precip ?? 'none')]
        : [scoreTmax3(c, guess.tmax3 ?? c.today.tmax)]

  // 기상청과의 비교는 기온·강수 라운드에서만 성립한다. 기상청 단기예보 과거자료에
  // '3일 뒤 기온'에 해당하는 항목이 없어, R3 를 비교에 넣으면 없는 값을 지어내게 된다.
  const kma = c.kind === 'tmax3' ? null : compareWithKma(c, guess)

  return {
    round: c.round,
    kind: c.kind,
    items,
    earned: items.reduce((s, i) => s + i.earned, 0),
    max: items.reduce((s, i) => s + i.max, 0),
    tmaxError:
      c.kind === 'tmax'
        ? Math.abs((guess.tmax ?? c.today.tmax) - c.answer.tmax)
        : c.kind === 'tmax3'
          ? Math.abs((guess.tmax3 ?? c.today.tmax) - c.answer3.tmax)
          : 0,
    lesson: lessonOf(c),
    kma,
  }
}

/**
 * 당신 vs 기상청 종합.
 *
 * ⚠️ 기온 대결에는 **기온을 물은 라운드만** 넣는다. 강수 라운드에서는 사용자가
 * 기온을 찍지 않았으므로 그 오차 0 을 평균에 섞으면 실제보다 정확했던 것처럼
 * 보인다 — 채점 결과를 부풀리는 거짓말이다. 강수는 등급 적중 여부로 따로 센다.
 */
export function kmaSeasonSummary(rounds: RoundScore[]): {
  tempRounds: number
  userMae: number
  kmaMae: number
  wins: number
  kmaMissedRounds: number
  /** 강수 대결 — 비교할 라운드가 없으면 null */
  precip: { userHit: boolean; kmaHit: boolean } | null
} | null {
  const temp = rounds.filter((r) => r.kind === 'tmax' && r.kma)
  const precipRound = rounds.find((r) => r.kind === 'precip' && r.kma)
  if (temp.length === 0 && !precipRound) return null

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
  return {
    tempRounds: temp.length,
    userMae: mean(temp.map((r) => r.tmaxError)),
    kmaMae: mean(temp.map((r) => r.kma!.error)),
    wins: temp.filter((r) => r.kma!.userWins).length,
    kmaMissedRounds: rounds.filter((r) => r.kma?.kmaMissed).length,
    precip: precipRound
      ? { userHit: precipRound.items[0].verdict === 'hit', kmaHit: precipRound.kma!.precipHit }
      : null,
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
        ? `거의 맞혔습니다 — 실제 ${actual.toFixed(1)}℃, ${error.toFixed(1)}℃ ${highOrLow} 찍으셨어요`
        : `어긋났습니다 — 실제 ${actual.toFixed(1)}℃, ${error.toFixed(1)}℃ ${highOrLow} 찍으셨어요`

  const persistence = `어제와 비슷하게 찍는 것(지속성)만으로도 ${Math.abs(delta).toFixed(1)}℃ 오차였을 날입니다.`
  const cause = causeOfTempChange(c)
  const why =
    Math.abs(delta) < 1.5
      ? `${persistence} 대기가 조용한 날은 어제가 곧 내일의 답입니다.`
      : `${persistence} ${cause}`

  return { label: '내일 최고기온', earned: tmaxScore(error, TMAX_MAX), max: TMAX_MAX, verdict, headline, why }
}

/**
 * R3 · 3일 뒤 최고기온 (보너스 20점).
 *
 * 같은 지속성 전략으로 찍어도 하루 뒤보다 사흘 뒤가 더 크게 어긋난다. 그 차이를
 * 숫자로 보여주는 것이 이 라운드의 전부다 — S8 의 U자 곡선이 여기서 시작한다.
 */
function scoreTmax3(c: ForecastCase, guess: number): ItemScore {
  const actual = c.answer3.tmax
  const error = Math.abs(guess - actual)
  const verdict = error <= 1 ? 'hit' : error <= 2.5 ? 'near' : 'miss'
  const highOrLow = guess > actual ? '높게' : '낮게'
  // 지속성 전략(오늘 값을 그대로 찍기)이 하루 뒤 / 사흘 뒤에 각각 얼마나 틀렸는가
  const persist1 = Math.abs(c.today.tmax - c.answer.tmax)
  const persist3 = Math.abs(c.today.tmax - actual)

  return {
    label: '3일 뒤 최고기온',
    earned: tmaxScore(error, TMAX3_MAX),
    max: TMAX3_MAX,
    verdict,
    headline:
      verdict === 'hit'
        ? `적중 — 실제 ${actual.toFixed(1)}℃, 오차 ${error.toFixed(1)}℃`
        : `실제 ${actual.toFixed(1)}℃ — ${error.toFixed(1)}℃ ${highOrLow} 찍으셨어요`,
    why:
      `오늘 값을 그대로 찍었다면 하루 뒤는 ${persist1.toFixed(1)}℃, 사흘 뒤는 ${persist3.toFixed(1)}℃ 어긋났을 날입니다. ` +
      (persist3 > persist1
        ? '같은 방법인데 사흘 뒤가 더 크게 빗나갑니다 — 오차는 시간이 갈수록 자랍니다.'
        : '이번 사흘은 조용했습니다. 하지만 조용할지 아닐지를 미리 아는 방법이 없다는 것이 문제예요.'),
  }
}

/** 기온이 왜 움직였는지를 실제 관측 숫자로 설명 */
function causeOfTempChange(c: ForecastCase): string {
  const { answer, features } = c
  const parts: string[] = []
  if (features.tmaxDelta <= -1.5) {
    if (answer.windFamily === 'N') parts.push(`다음날 ${answer.windDir}풍(${answer.windSpeed} m/s)이 들어오며 찬 공기가 남하했습니다`)
    if (features.pressureTrend > 1.5) parts.push(`기압이 ${features.pressureTrend > 0 ? '+' : ''}${features.pressureTrend} hPa 올라 고기압이 확장했습니다`)
    if (answer.precip >= 1) parts.push(`비(${answer.precip} mm)가 낮 기온을 눌렀습니다`)
    return `기온이 ${Math.abs(features.tmaxDelta).toFixed(1)}℃ 내려간 이유: ${parts.join(', ') || '한기가 유입됐습니다'}.`
  }
  if (features.tmaxDelta >= 1.5) {
    if (answer.windFamily === 'S') parts.push(`${answer.windDir}풍으로 따뜻한 공기가 밀려 올라왔습니다`)
    if (features.pressureTrend < -1.5) parts.push(`기압이 ${features.pressureTrend} hPa 내려가 저기압이 접근했습니다`)
    if (answer.cloud <= 3) parts.push('맑은 하늘에서 햇빛이 그대로 들어왔습니다')
    return `기온이 ${features.tmaxDelta.toFixed(1)}℃ 올라간 이유: ${parts.join(', ') || '남풍이 유입됐습니다'}.`
  }
  return '기온을 밀어올리거나 끌어내릴 만한 신호가 약했던 날입니다.'
}

function scorePrecip(c: ForecastCase, guess: PrecipClass): ItemScore {
  const actualClass = precipClassOf(c.answer.precip)
  const distance = Math.abs(PRECIP_ORDER.indexOf(guess) - PRECIP_ORDER.indexOf(actualClass))
  const verdict = distance === 0 ? 'hit' : distance === 1 ? 'near' : 'miss'
  const { pressureTrend, humidityTrend } = c.features

  const signal =
    pressureTrend < -1 && humidityTrend > 2
      ? `기압 ${pressureTrend} hPa 하강 + 습도 ${humidityTrend > 0 ? '+' : ''}${humidityTrend}%p 상승 — 저기압이 다가오는 전형적인 강수 신호였습니다.`
      : pressureTrend > 1 && humidityTrend < 0
        ? `기압 +${pressureTrend} hPa 상승 + 습도 ${humidityTrend}%p 하강 — 고기압권에서 비가 오기 어려운 상태였습니다.`
        : `기압 ${pressureTrend > 0 ? '+' : ''}${pressureTrend} hPa, 습도 ${humidityTrend > 0 ? '+' : ''}${humidityTrend}%p — 신호가 뚜렷하지 않은 애매한 날이었습니다.`

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

/** 라운드가 가르치려는 한 줄 */
function lessonOf(c: ForecastCase): string {
  switch (c.round) {
    case 1:
      return '규칙 1 · 지속성 — 하루 뒤의 대기는 오늘의 대기와 대체로 닮아 있습니다. 그래서 며칠은 맞힐 수 있어요.'
    case 2:
      return '규칙 2 · 기압과 바람은 한 몸 — 기압이 내려가면 남풍과 비, 올라가면 북풍과 한기. 지도를 읽으면 예측이 됩니다.'
    case 3:
      return Math.abs(c.features.tmaxDelta) >= 4
        ? '규칙 3 · 그런데 대기는 가끔 어제를 배신합니다 — 전선이 지나간 날, 지속성은 무너져요. 이 배신이 며칠만 지나면 예측 전체를 삼킵니다.'
        : '규칙 3 · 대기는 언제 어제를 배신할지 알려주지 않습니다 — 이 불확실성이 시간이 갈수록 커져요.'
  }
}

/** 총점에 대한 격려 문구 (감점이 아니라 발견 프레임) */
export function verdictOfTotal(earned: number, max: number): { title: string; body: string } {
  const ratio = max === 0 ? 0 : earned / max
  if (ratio >= 0.8)
    return {
      title: '며칠 앞을 읽어내셨습니다',
      body: '축하합니다 — 그리고 이건 우연이 아닙니다. 며칠 규모의 대기는 실제로 예측 가능하거든요. 그럼 이 실력으로 2주 뒤도 맞힐 수 있을까요?',
    }
  if (ratio >= 0.5)
    return {
      title: '절반은 읽어내셨습니다',
      body: '어긋난 쪽이 더 흥미롭습니다. 기압과 습도, 바람은 서로를 붙잡고 움직여요 — 그 사슬을 읽는 만큼 며칠은 맞힐 수 있습니다.',
    }
  return {
    title: '어긋났다면, 제대로 발견하신 겁니다',
    body: '세계 최고의 슈퍼컴퓨터도 며칠 뒤부터는 손을 듭니다. 지금 느끼신 그 어긋남이 바로 다음 단계의 주제예요.',
  }
}
