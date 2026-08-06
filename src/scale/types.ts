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

/** 일교차 등급 — S1 R1 보너스. */
export type DtrClass = 'small' | 'mid' | 'large'
