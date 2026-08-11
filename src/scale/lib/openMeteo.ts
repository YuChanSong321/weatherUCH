/**
 * Open-Meteo 일자료 클라이언트 — S0 에서 사용자가 찍은 임의의 좌표용.
 *
 * ⚠️ 이 파일은 브라우저에서 외부 API 를 부르는 **유일한** 통로다.
 * [data/loader] 의 "브라우저에서 외부 API 를 절대 호출하지 않는다" 원칙은 번들된
 * 기상청 자료에 대해 그대로 유효하다. 사용자가 부산 밖을 찍었을 때만 이쪽이 열린다.
 * 실패하면 조용히 부산 번들로 되돌아간다 — 발표 현장에서 네트워크가 끊겨도
 * 콘텐츠는 끝까지 돈다.
 *
 * API 키가 없다(무료·비인증). 그래서 키 취급 규칙에 걸리는 것이 없다.
 * 출처 표기는 화면의 자료 출처 패널이 실제 사용된 출처를 읽어 표시한다.
 *
 * 왜 과거 날짜만 쓰는가: S1 은 퀴즈다. 사용자가 찍은 답을 채점하려면 '정답'이
 * 이미 관측된 값이어야 한다. 그래서 예보 구간이 아니라 지난 날들만 가져온다.
 */
import type { DailyRecord, WindFamily } from '../types'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

const DAILY_FIELDS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'temperature_2m_mean',
  'precipitation_sum',
  'relative_humidity_2m_mean',
  'surface_pressure_mean',
  'wind_speed_10m_max',
  'wind_direction_10m_dominant',
  'cloud_cover_mean',
].join(',')

/** 요청할 과거 일수. S1 은 관측 3일 + 내일 + 3일 뒤까지 필요하다. */
const PAST_DAYS = 14

export type PlaceObservation = {
  /** Open-Meteo 가 실제로 매칭한 격자 중심 */
  gridLat: number
  gridLon: number
  timezone: string
  records: DailyRecord[]
}

type OpenMeteoResponse = {
  latitude: number
  longitude: number
  timezone: string
  daily: Record<string, (number | null)[]> & { time: string[] }
}

const WIND_DIRS = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동',
                   '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'] as const

const dirOf = (deg: number): string => WIND_DIRS[Math.round((deg % 360) / 22.5) % 16]

/** 풍향 4계열. 경계는 45° 씩 — 기존 기상청 자료 변환과 같은 규칙이다. */
export const familyOf = (deg: number): WindFamily => {
  const d = ((deg % 360) + 360) % 360
  if (d < 45 || d >= 315) return 'N'
  if (d < 135) return 'E'
  if (d < 225) return 'S'
  return 'W'
}

/**
 * 좌표의 최근 일자료를 가져온다.
 * @throws 네트워크 실패·응답 이상 시. 호출부가 폴백을 책임진다.
 */
export async function fetchDaily(lat: number, lon: number, signal?: AbortSignal): Promise<PlaceObservation> {
  const url =
    `${ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=${DAILY_FIELDS}&past_days=${PAST_DAYS}&forecast_days=1&timezone=auto&wind_speed_unit=ms`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const json = (await res.json()) as OpenMeteoResponse
  const d = json.daily
  if (!d?.time?.length) throw new Error('Open-Meteo: 일자료 없음')

  const records: DailyRecord[] = []
  for (let i = 0; i < d.time.length; i++) {
    const tmax = d.temperature_2m_max[i]
    const tmin = d.temperature_2m_min[i]
    // 하나라도 비면 그날은 통째로 버린다. 결측을 0 으로 메우면 S1 의 해설이
    // 데이터와 어긋난다 (loader 의 결측 처리와 같은 원칙).
    if (tmax === null || tmin === null) continue
    const deg = d.wind_direction_10m_dominant[i] ?? 0
    records.push({
      date: d.time[i],
      tavg: round1(d.temperature_2m_mean[i] ?? (tmax + tmin) / 2),
      tmax: round1(tmax),
      tmin: round1(tmin),
      precip: round1(d.precipitation_sum[i] ?? 0),
      humidity: Math.round(d.relative_humidity_2m_mean[i] ?? 0),
      pressure: round1(d.surface_pressure_mean[i] ?? 0),
      windDeg: Math.round(deg),
      windDir: dirOf(deg),
      windFamily: familyOf(deg),
      windSpeed: round1(d.wind_speed_10m_max[i] ?? 0),
      // 기상청 운량은 0~10 할, Open-Meteo 는 0~100%. 화면·해설이 전부 할 기준이라
      // 여기서 맞춰 넣는다.
      cloud: round1((d.cloud_cover_mean[i] ?? 0) / 10),
    })
  }
  if (records.length < 6) throw new Error('Open-Meteo: 쓸 수 있는 날이 모자람')

  return { gridLat: json.latitude, gridLon: json.longitude, timezone: json.timezone, records }
}

const round1 = (v: number): number => Number(v.toFixed(1))

/* ────────────────────────────────────────────── 40년 기후 시계열 (S2·S3·S4) */

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'

/** 번들 부산 관측과 같은 구간을 쓴다 — 두 지역을 같은 눈으로 보게 하기 위해서다 */
export const CLIMATE_START_YEAR = 1985

export type YearMean = { year: number; tavg: number }
export type DayMean = { date: string; tavg: number }

export type ClimateSeries = {
  /** 연평균 기온 — S3 스크러빙, S4 빈 해 예측 */
  yearly: YearMean[]
  /** 일평균 기온 — S2 시간 압축 레버가 한 해를 골라 쓴다 */
  daily: DayMean[]
}

/**
 * 재분석 자료(ERA5) 기반 40년 일평균 기온.
 *
 * 한 번에 14,600일(약 250KB)이 온다. 6초쯤 걸리므로 **지역을 고르는 순간 미리
 * 받아둔다** — S2 에 도착했을 때 기다리게 하면 "레버를 당겨보세요"가 무너진다.
 *
 * ⚠️ 이건 관측소 실측이 아니라 재분석 격자값이다. 부산 번들(기상청 ASOS 실측)과
 * 성격이 다르므로 화면의 출처 표기가 둘을 구분해서 말해야 한다.
 */
export async function fetchClimate(
  lat: number,
  lon: number,
  endYear: number,
  signal?: AbortSignal,
): Promise<ClimateSeries> {
  const url =
    `${ARCHIVE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&start_date=${CLIMATE_START_YEAR}-01-01&end_date=${endYear}-12-31` +
    `&daily=temperature_2m_mean&timezone=auto`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`)
  const json = (await res.json()) as { daily: { time: string[]; temperature_2m_mean: (number | null)[] } }
  const time = json.daily?.time
  const mean = json.daily?.temperature_2m_mean
  if (!time?.length || !mean?.length) throw new Error('Open-Meteo archive: 자료 없음')

  const daily: DayMean[] = []
  const sums = new Map<number, { sum: number; n: number }>()
  for (let i = 0; i < time.length; i++) {
    const v = mean[i]
    if (v === null || v === undefined) continue // 결측일은 버린다 (0 으로 메우지 않는다)
    daily.push({ date: time[i], tavg: round1(v) })
    const year = Number(time[i].slice(0, 4))
    const acc = sums.get(year) ?? { sum: 0, n: 0 }
    acc.sum += v
    acc.n++
    sums.set(year, acc)
  }

  const yearly: YearMean[] = [...sums.entries()]
    // 관측이 성긴 해는 연평균이라고 부를 수 없다. 300일 미만은 통째로 버린다 —
    // 반쪽짜리 해가 시계열에 섞이면 S3 의 추세선이 조용히 거짓말을 한다.
    .filter(([, a]) => a.n >= 300)
    .map(([year, a]) => ({ year, tavg: Number((a.sum / a.n).toFixed(2)) }))
    .sort((a, b) => a.year - b.year)

  if (yearly.length < 20) throw new Error('Open-Meteo archive: 연평균을 만들 해가 모자람')
  return { yearly, daily }
}
