/**
 * 데이터 로더 — 앱에서 데이터에 접근하는 유일한 통로.
 *
 * ⚠️ 원칙: 브라우저에서 외부 API를 절대 호출하지 않는다.
 * /data 아래 JSON을 빌드 시점에 번들로 정적 import 하는 것만 허용한다.
 * (fetch / XHR / API 키 사용 금지 — 배포본은 완전 오프라인으로 동작해야 한다.)
 *
 * 실데이터 교체는 scripts/fetch_asos.py 가 같은 스키마로 /data 를 덮어쓰면
 * 끝나도록 설계되어 있다. 아래 import 4줄 외에는 데이터 출처를 몰라야 한다.
 */
import dailyJson from '../../../data/busan_daily.json'
import monthlyJson from '../../../data/busan_monthly.json'
import yearlyJson from '../../../data/busan_yearly.json'
import sspJson from '../../../data/future_ssp.json'
import pastForecastJson from '../../../data/busan_past_forecast.json'
import blossomJson from '../../../data/busan_blossom.json'
import type {
  BlossomRecord,
  DailyRecord,
  DataMeta,
  MonthlyMean,
  MonthlyNormal,
  PastForecast,
  Scenario,
  YearlyRecord,
} from '../types'

type DailyFile = { meta: DataMeta; records: DailyRecord[]; monthlySeries: MonthlyMean[] }
type MonthlyFile = { meta: DataMeta; normals: MonthlyNormal[] }
type YearlyFile = { meta: DataMeta; records: YearlyRecord[] }
type SspFile = {
  meta: DataMeta & { baseline: { period: string; tavg: number }; region: string }
  scenarios: Scenario[]
}

type PastForecastFile = { meta: DataMeta; records: PastForecast[] }
type BlossomFile = {
  meta: DataMeta & { species: string; phenomenon: string }
  records: BlossomRecord[]
}

const dailyFile = dailyJson as unknown as DailyFile
const monthlyFile = monthlyJson as unknown as MonthlyFile
const yearlyFile = yearlyJson as unknown as YearlyFile
const sspFile = sspJson as unknown as SspFile
const pastForecastFile = pastForecastJson as unknown as PastForecastFile
const blossomFile = blossomJson as unknown as BlossomFile

export const CITY = dailyFile.meta.station?.name ?? '부산'

/** 일별 관측 (S1 출제 풀, S2 압축 애니메이션) */
export const daily: DailyRecord[] = dailyFile.records
export const dailyMonthlyMeans: MonthlyMean[] = dailyFile.monthlySeries

/** 월별 평년값 1991-2020 (S2 계절 곡선) */
export const monthlyNormals: MonthlyNormal[] = monthlyFile.normals

/** 연평균 기온 (S3 점 누적, S4 빈 해 예측) */
export const yearly: YearlyRecord[] = yearlyFile.records

/** SSP 시나리오 (S5 부채꼴) */
export const scenarios: Scenario[] = sspFile.scenarios
export const sspBaseline = sspFile.meta.baseline
export const sspRegion = sspFile.meta.region

/**
 * 기상청 과거 예보 (S1의 세 번째 플레이어).
 *
 * 실데이터 수집이 부분적으로만 성공할 수 있으므로 — 단기예보 과거자료는 날짜별로
 * 구멍이 난다 — 없는 날은 `undefined` 를 돌려주고, 화면은 조용히 2자 대결로
 * 돌아간다. 예보가 없다고 출제가 막히면 안 된다.
 */
const forecastByDate = new Map(pastForecastFile.records.map((r) => [r.date, r]))
export const getPastForecast = (date: string): PastForecast | undefined => forecastByDate.get(date)
export const hasPastForecast = forecastByDate.size > 0

/** 벚꽃 개화일 (S3 보조 레이어) */
export const blossom: BlossomRecord[] = blossomFile.records
export const blossomSpecies = blossomFile.meta.species
const blossomByYear = new Map(blossom.map((r) => [r.year, r]))
export const getBlossom = (year: number): BlossomRecord | undefined => blossomByYear.get(year)

/** 데이터 출처 배지용 — 더미인지 실데이터인지 화면에 정직하게 표시한다. */
export const dataSources = {
  daily: dailyFile.meta.source,
  monthly: monthlyFile.meta.source,
  yearly: yearlyFile.meta.source,
  ssp: sspFile.meta.source,
  pastForecast: pastForecastFile.meta.source,
  blossom: blossomFile.meta.source,
}
export const isDummyData = Object.values(dataSources).some((s) => s === 'SYNTHETIC_DUMMY')

/**
 * 화면에 띄우는 출처 표기 — 대회 규정이 데이터 원출처 표기를 필수로 둔다.
 *
 * 값을 코드에 적어두지 않고 **각 JSON 의 meta 에서 읽는다.** 파일이 실측으로 바뀌면
 * 화면도 반드시 따라 바뀌어야 하고, 반대로 합성 데이터를 실측처럼 보이게 만드는 일이
 * 절대 없어야 하기 때문이다.
 */
export type DatasetCredit = {
  file: string
  label: string
  provider: string
  dataset: string
  fetchedAt: string | null
  license: string
  synthetic: boolean
}

const creditOf = (
  file: string,
  label: string,
  meta: DataMeta,
  fallbackDataset: string,
): DatasetCredit => {
  const synthetic = meta.source === 'SYNTHETIC_DUMMY'
  return {
    file,
    label,
    provider: synthetic ? '합성 생성기 (scripts/make_dummy_data.py)' : String(meta._provider ?? '기상청'),
    dataset: synthetic ? '' : String(meta._dataset ?? fallbackDataset),
    fetchedAt: typeof meta._fetched_at === 'string' ? meta._fetched_at.slice(0, 10) : null,
    license: String(meta._license ?? '공공누리 유형 확인 필요'),
    synthetic,
  }
}

export const datasetCredits: DatasetCredit[] = [
  creditOf('busan_daily.json', '일별 관측', dailyFile.meta, '종관기상관측(ASOS) 일자료'),
  creditOf('busan_monthly.json', '월 평년값', monthlyFile.meta, '기후통계 평년값'),
  creditOf('busan_yearly.json', '연평균 기온', yearlyFile.meta, '기후통계 연자료'),
  creditOf('busan_past_forecast.json', '과거 예보·특보', pastForecastFile.meta, '단기예보 과거자료 / 기상특보 이력'),
  creditOf('busan_blossom.json', '벚꽃 개화일', blossomFile.meta, '계절관측(생물계절)'),
  creditOf('future_ssp.json', 'SSP 시나리오', sspFile.meta, '기후변화 시나리오'),
]

const byDate = new Map(daily.map((r) => [r.date, r]))
export const getDay = (date: string): DailyRecord | undefined => byDate.get(date)

/** 인덱스 기반 조회 (연속된 날짜 창을 잡을 때 사용) */
export const dailyIndexOf = (date: string): number => daily.findIndex((r) => r.date === date)

export const yearlyRange = {
  first: yearly[0].year,
  last: yearly[yearly.length - 1].year,
}

/** 관측 기간 선형 추세 (S3 추세선, S4 채점 기준) */
export function yearlyTrend(): { slope: number; intercept: number; perDecade: number } {
  const n = yearly.length
  const mx = yearly.reduce((s, r) => s + r.year, 0) / n
  const my = yearly.reduce((s, r) => s + r.tavg, 0) / n
  let num = 0
  let den = 0
  for (const r of yearly) {
    num += (r.year - mx) * (r.tavg - my)
    den += (r.year - mx) ** 2
  }
  const slope = num / den
  return { slope, intercept: my - slope * mx, perDecade: slope * 10 }
}

export const trendValueAt = (year: number): number => {
  const { slope, intercept } = yearlyTrend()
  return slope * year + intercept
}
