/**
 * 좌표 → 사람이 읽는 지명.
 *
 * 기획안 S0 은 "가장 가까운 관측소/예보 격자를 매칭"하라고 한다. 예보 격자는
 * Open-Meteo 응답이 알려주지만(요청 좌표와 다른 격자 중심 좌표를 돌려준다), 그
 * 격자에는 이름이 없다. 지명은 따로 필요하다.
 *
 * 역지오코딩 API 를 하나 더 부르는 대신 목록을 번들에 넣는다 — 네트워크 왕복이
 * 늘면 "10초 안에 첫 조작"이 무너지고, 오프라인에서는 지명이 통째로 사라진다.
 * 정확한 행정구역명이 목적이 아니라 "여기가 어디쯤인지" 알려주는 것이 목적이므로
 * 이 정도 해상도로 충분하다.
 *
 * 국내는 기상청 ASOS 주요 지점, 해외는 대륙별 대표 도시를 담았다.
 */

export type City = { name: string; lat: number; lon: number }

/** 국내 — 기상청 ASOS 주요 관측 지점 */
const KR: City[] = [
  { name: '서울', lat: 37.5714, lon: 126.9658 },
  { name: '인천', lat: 37.4776, lon: 126.6249 },
  { name: '수원', lat: 37.2723, lon: 126.9853 },
  { name: '춘천', lat: 37.9026, lon: 127.7357 },
  { name: '강릉', lat: 37.7515, lon: 128.891 },
  { name: '대전', lat: 36.372, lon: 127.3721 },
  { name: '청주', lat: 36.6392, lon: 127.4407 },
  { name: '안동', lat: 36.5729, lon: 128.7073 },
  { name: '대구', lat: 35.8853, lon: 128.6535 },
  { name: '전주', lat: 35.8214, lon: 127.1547 },
  { name: '광주', lat: 35.1729, lon: 126.8916 },
  { name: '목포', lat: 34.8172, lon: 126.3814 },
  { name: '여수', lat: 34.7392, lon: 127.7405 },
  { name: '울산', lat: 35.5601, lon: 129.3199 },
  { name: '부산', lat: 35.1047, lon: 129.032 },
  { name: '제주', lat: 33.5141, lon: 126.5297 },
  { name: '울릉도', lat: 37.4813, lon: 130.8986 },
]

/** 해외 — 대륙별 대표 도시 */
const WORLD: City[] = [
  { name: '도쿄', lat: 35.68, lon: 139.69 },
  { name: '오사카', lat: 34.69, lon: 135.5 },
  { name: '삿포로', lat: 43.06, lon: 141.35 },
  { name: '베이징', lat: 39.9, lon: 116.4 },
  { name: '상하이', lat: 31.23, lon: 121.47 },
  { name: '홍콩', lat: 22.32, lon: 114.17 },
  { name: '타이베이', lat: 25.03, lon: 121.57 },
  { name: '마닐라', lat: 14.6, lon: 120.98 },
  { name: '하노이', lat: 21.03, lon: 105.85 },
  { name: '방콕', lat: 13.76, lon: 100.5 },
  { name: '싱가포르', lat: 1.35, lon: 103.82 },
  { name: '자카르타', lat: -6.21, lon: 106.85 },
  { name: '뉴델리', lat: 28.61, lon: 77.21 },
  { name: '뭄바이', lat: 19.08, lon: 72.88 },
  { name: '다카', lat: 23.81, lon: 90.41 },
  { name: '카라치', lat: 24.86, lon: 67.0 },
  { name: '테헤란', lat: 35.69, lon: 51.39 },
  { name: '두바이', lat: 25.2, lon: 55.27 },
  { name: '이스탄불', lat: 41.01, lon: 28.98 },
  { name: '모스크바', lat: 55.76, lon: 37.62 },
  { name: '노보시비르스크', lat: 55.03, lon: 82.92 },
  { name: '베를린', lat: 52.52, lon: 13.4 },
  { name: '파리', lat: 48.86, lon: 2.35 },
  { name: '런던', lat: 51.51, lon: -0.13 },
  { name: '마드리드', lat: 40.42, lon: -3.7 },
  { name: '로마', lat: 41.9, lon: 12.5 },
  { name: '스톡홀름', lat: 59.33, lon: 18.07 },
  { name: '레이캬비크', lat: 64.15, lon: -21.94 },
  { name: '카이로', lat: 30.04, lon: 31.24 },
  { name: '라고스', lat: 6.52, lon: 3.38 },
  { name: '나이로비', lat: -1.29, lon: 36.82 },
  { name: '킨샤사', lat: -4.44, lon: 15.27 },
  { name: '요하네스버그', lat: -26.2, lon: 28.05 },
  { name: '케이프타운', lat: -33.92, lon: 18.42 },
  { name: '뉴욕', lat: 40.71, lon: -74.01 },
  { name: '시카고', lat: 41.88, lon: -87.63 },
  { name: '로스앤젤레스', lat: 34.05, lon: -118.24 },
  { name: '밴쿠버', lat: 49.28, lon: -123.12 },
  { name: '토론토', lat: 43.65, lon: -79.38 },
  { name: '앵커리지', lat: 61.22, lon: -149.9 },
  { name: '멕시코시티', lat: 19.43, lon: -99.13 },
  { name: '하바나', lat: 23.11, lon: -82.37 },
  { name: '보고타', lat: 4.71, lon: -74.07 },
  { name: '리마', lat: -12.05, lon: -77.04 },
  { name: '상파울루', lat: -23.55, lon: -46.63 },
  { name: '부에노스아이레스', lat: -34.6, lon: -58.38 },
  { name: '산티아고', lat: -33.45, lon: -70.67 },
  { name: '시드니', lat: -33.87, lon: 151.21 },
  { name: '멜버른', lat: -37.81, lon: 144.96 },
  { name: '퍼스', lat: -31.95, lon: 115.86 },
  { name: '오클랜드', lat: -36.85, lon: 174.76 },
  { name: '호놀룰루', lat: 21.31, lon: -157.86 },
  { name: '누크', lat: 64.18, lon: -51.72 },
]

export const CITIES: City[] = [...KR, ...WORLD]

const RAD = Math.PI / 180
const EARTH_R_KM = 6371

/** 대권 거리 (km) */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD
  const dLon = (bLon - aLon) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 가장 가까운 도시와 그 거리. 목록이 성기므로 거리도 함께 돌려준다. */
export function nearestCity(lat: number, lon: number): { city: City; km: number } {
  let best = CITIES[0]
  let bestKm = Infinity
  for (const c of CITIES) {
    const km = distanceKm(lat, lon, c.lat, c.lon)
    if (km < bestKm) {
      bestKm = km
      best = c
    }
  }
  return { city: best, km: bestKm }
}

/** 위경도를 북위/동경 표기로 */
export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? '북위' : '남위'
  const ew = lon >= 0 ? '동경' : '서경'
  return `${ns} ${Math.abs(lat).toFixed(2)}° · ${ew} ${Math.abs(lon).toFixed(2)}°`
}

/**
 * 지명 표기. 가까운 도시가 있으면 그 이름을, 멀면 "○○에서 남서쪽 420 km" 처럼
 * 방위와 거리로 적는다. 바다 한가운데를 찍고 도시 이름이 뜨면 그게 거짓말이다.
 */
export function placeLabel(lat: number, lon: number): string {
  const { city, km } = nearestCity(lat, lon)
  if (km <= 45) return city.name
  const bearing = bearingLabel(city.lat, city.lon, lat, lon)
  return `${city.name} ${bearing} ${Math.round(km)} km`
}

const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']

function bearingLabel(fromLat: number, fromLon: number, toLat: number, toLon: number): string {
  const y = Math.sin((toLon - fromLon) * RAD) * Math.cos(toLat * RAD)
  const x =
    Math.cos(fromLat * RAD) * Math.sin(toLat * RAD) -
    Math.sin(fromLat * RAD) * Math.cos(toLat * RAD) * Math.cos((toLon - fromLon) * RAD)
  const deg = (Math.atan2(y, x) / RAD + 360) % 360
  return `${COMPASS[Math.round(deg / 45) % 8]}쪽`
}
