/**
 * 선택한 지역과 그 지역의 관측 자료.
 *
 * 하이브리드다 (기획안 §3 S0 + 이 저장소의 오프라인 원칙을 둘 다 지키는 방식):
 *
 *   부산 근처를 찍으면  → 번들된 기상청 ASOS 실측. 40년치가 있고, 그날 기상청이
 *                        실제로 냈던 예보까지 있어 S1 의 3자 대결이 가능하다.
 *   그 밖을 찍으면      → Open-Meteo 최근 2주. 기상청 예보 비교는 빠지고 2자 대결이
 *                        된다 (S1 은 예보가 없는 경우를 원래 견디도록 만들어져 있다).
 *   호출이 실패하면    → 부산 번들로 되돌아간다. 네트워크 없이도 콘텐츠가 끝까지 돈다.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CITY, daily as busanDaily, stationCoord } from '../data/loader'
import { distanceKm, placeLabel } from '../lib/geo'
import { fetchDaily } from '../lib/openMeteo'
import type { DailyRecord } from '../types'

/** 이 반경 안이면 번들된 부산 실측을 그대로 쓴다 */
const BUNDLE_RADIUS_KM = 45

export type PlaceSource = 'kma-bundle' | 'open-meteo'

export type Place = {
  label: string
  lat: number
  lon: number
  source: PlaceSource
  /** 실제 자료가 붙어 있는 지점 (관측소 또는 예보 격자 중심) */
  gridLat: number
  gridLon: number
  records: DailyRecord[]
  /** Open-Meteo 가 실패해 부산으로 되돌아왔는가 */
  fellBack: boolean
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

type PlaceValue = {
  place: Place | null
  status: Status
  /** 폴백까지 실패하지는 않지만, 무슨 일이 있었는지는 화면에 알린다 */
  notice: string | null
  select: (lat: number, lon: number) => Promise<void>
  selectBusan: () => void
  clear: () => void
}

const PlaceContext = createContext<PlaceValue | null>(null)

const busanPlace = (fellBack: boolean): Place => ({
  label: CITY,
  lat: stationCoord.lat,
  lon: stationCoord.lon,
  source: 'kma-bundle',
  gridLat: stationCoord.lat,
  gridLon: stationCoord.lon,
  records: busanDaily,
  fellBack,
})

export function PlaceProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [notice, setNotice] = useState<string | null>(null)

  const selectBusan = useCallback(() => {
    setPlace(busanPlace(false))
    setStatus('ready')
    setNotice(null)
  }, [])

  const select = useCallback(async (lat: number, lon: number) => {
    setNotice(null)
    if (distanceKm(lat, lon, stationCoord.lat, stationCoord.lon) <= BUNDLE_RADIUS_KM) {
      setPlace(busanPlace(false))
      setStatus('ready')
      return
    }

    setStatus('loading')
    try {
      const obs = await fetchDaily(lat, lon)
      setPlace({
        label: placeLabel(lat, lon),
        lat,
        lon,
        source: 'open-meteo',
        gridLat: obs.gridLat,
        gridLon: obs.gridLon,
        records: obs.records,
        fellBack: false,
      })
      setStatus('ready')
    } catch {
      // 어디를 찍었든 콘텐츠는 계속 돌아야 한다. 대신 무엇으로 되돌아갔는지 밝힌다.
      setPlace(busanPlace(true))
      setStatus('ready')
      setNotice(`이 지역의 실시간 자료를 받지 못했습니다 — 번들된 ${CITY} 실측으로 진행합니다.`)
    }
  }, [])

  const clear = useCallback(() => {
    setPlace(null)
    setStatus('idle')
    setNotice(null)
  }, [])

  const value = useMemo<PlaceValue>(
    () => ({ place, status, notice, select, selectBusan, clear }),
    [place, status, notice, select, selectBusan, clear],
  )

  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>
}

export function usePlace(): PlaceValue {
  const ctx = useContext(PlaceContext)
  if (!ctx) throw new Error('usePlace 는 PlaceProvider 안에서만 쓸 수 있다')
  return ctx
}
