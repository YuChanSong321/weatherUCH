/** /data JSON 4종의 스키마 타입. 로더만 이 타입에 의존한다. */

export type DailyRecord = {
  date: string
  tavg: number
  tmax: number
  tmin: number
  precip: number
  humidity: number
  pressure: number
  windDeg: number
  windDir: string
  windFamily: WindFamily
  windSpeed: number
  cloud: number
}

export type WindFamily = 'N' | 'E' | 'S' | 'W'

export type MonthlyNormal = {
  month: number
  tavg: number
  tmax: number
  tmin: number
  dtr: number
  precip: number
  humidity: number
}

export type YearlyRecord = {
  year: number
  tavg: number
  tmaxMean: number
  tminMean: number
  precip: number
  fromDaily: boolean
}

export type ScenarioPoint = {
  year: number
  anomaly: number
  tavg: number
  low: number
  high: number
}

export type Scenario = {
  id: 'ssp126' | 'ssp245' | 'ssp585'
  label: string
  description: string
  color: string
  points: ScenarioPoint[]
}

export type MonthlyMean = { month: string; tavg: number; precip: number }

export type DataMeta = {
  schemaVersion: number
  source: string
  station?: { name: string; stnId: number; lat: number; lon: number }
  [key: string]: unknown
}

/** 강수 등급 — S1 4지선다 / 채점 공용. */
export type PrecipClass = 'none' | 'light' | 'rain' | 'heavy'

/** 그날 발효됐던 기상특보. 특보가 없던 날에는 필드 자체가 없다. */
export type Advisory = {
  /** 호우주의보 / 강풍주의보 / 폭염주의보 … */
  kind: string
  headline: string
}

/**
 * 기상청이 전날 발표했던 그날의 예보 — S1의 세 번째 플레이어.
 * 관측 날짜 전부에 대해 존재한다는 보장이 없으므로, 없는 날은 조용히 비교를 뺀다.
 */
export type PastForecast = {
  /** 예보 대상일 (관측 date 와 같은 날) */
  date: string
  /** 발표일 · 발표 시각 */
  baseDate: string
  baseTime: string
  tmax: number
  tmin?: number
  precipClass: PrecipClass
  precipProb?: number
  /** 선택 — 그날 발효됐던 기상특보 (S1 R3 배지) */
  advisory?: Advisory
  /** 'dummy' 면 합성값이다. 화면이 정직하게 표시한다. */
  _source?: string
}

/** 벚꽃(왕벚나무) 개화일 — S3 보조 레이어. doy 가 작을수록 일찍 폈다. */
export type BlossomRecord = {
  year: number
  /** 연중 일수 (1 = 1월 1일) */
  doy: number
  date: string
}

/** 일교차 등급 — S1 R1 보너스. */
export type DtrClass = 'small' | 'mid' | 'large'
