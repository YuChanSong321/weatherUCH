/**
 * 선택 지역의 40년 기후 시계열 (S2·S3·S4 가 읽는다).
 *
 * [state/place] 와 같은 하이브리드 규칙을 따른다.
 *   부산       → 번들된 기상청 ASOS 실측 (즉시, 벚꽃 개화일 레이어까지 있음)
 *   그 밖      → Open-Meteo 아카이브(ERA5 재분석) 40년
 *   실패하면   → 부산 번들로 되돌아가고, 그 사실을 화면에 밝힌다
 *
 * 아카이브 호출은 6초쯤 걸린다. 그래서 **지역이 정해지는 즉시** 받기 시작한다 —
 * 사용자가 S1 세 라운드를 푸는 동안 끝나므로, S2 에 도착하면 이미 준비돼 있다.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CITY, daily as busanDaily, yearly as busanYearly } from '../data/loader'
import { fetchClimate, type DayMean, type YearMean } from '../lib/openMeteo'
import { usePlace } from './place'

export type ClimateSource = 'kma-bundle' | 'open-meteo-archive'

type ClimateValue = {
  status: 'idle' | 'loading' | 'ready'
  source: ClimateSource
  yearly: YearMean[]
  daily: DayMean[]
  /** 벚꽃 개화일 레이어를 얹어도 되는가 — 번들 부산에만 있는 자료다 */
  hasBlossom: boolean
  /** 지역 이름 (차트 캡션용) */
  label: string
  notice: string | null
}

const BUNDLE: Pick<ClimateValue, 'source' | 'yearly' | 'daily' | 'hasBlossom'> = {
  source: 'kma-bundle',
  yearly: busanYearly.map((r) => ({ year: r.year, tavg: r.tavg })),
  daily: busanDaily.map((r) => ({ date: r.date, tavg: r.tavg })),
  hasBlossom: true,
}

const ClimateContext = createContext<ClimateValue | null>(null)

export function ClimateProvider({ children }: { children: ReactNode }) {
  const { place } = usePlace()
  const [state, setState] = useState<{
    status: ClimateValue['status']
    data: typeof BUNDLE
    notice: string | null
  }>({ status: 'idle', data: BUNDLE, notice: null })

  // 지역이 바뀌면 이전 요청은 버린다 — 늦게 도착한 응답이 새 지역을 덮어쓰면 안 된다
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    if (!place || place.source === 'kma-bundle') {
      setState({ status: place ? 'ready' : 'idle', data: BUNDLE, notice: null })
      return
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState({ status: 'loading', data: BUNDLE, notice: null })

    // 올해는 아직 끝나지 않았으므로 연평균에 넣지 않는다
    const endYear = new Date().getFullYear() - 1
    fetchClimate(place.gridLat, place.gridLon, endYear, ctrl.signal)
      .then((series) => {
        if (ctrl.signal.aborted) return
        setState({
          status: 'ready',
          data: {
            source: 'open-meteo-archive',
            yearly: series.yearly,
            daily: series.daily,
            hasBlossom: false,
          },
          notice: null,
        })
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return
        setState({
          status: 'ready',
          data: BUNDLE,
          notice: `이 지역의 40년 기후 자료를 받지 못했습니다 — 번들된 ${CITY} 실측으로 보여드립니다.`,
        })
      })

    return () => ctrl.abort()
  }, [place])

  const value = useMemo<ClimateValue>(() => {
    const usingBundle = state.data.source === 'kma-bundle'
    return {
      status: state.status,
      ...state.data,
      label: usingBundle ? CITY : (place?.label ?? CITY),
      notice: state.notice,
    }
  }, [state, place])

  return <ClimateContext.Provider value={value}>{children}</ClimateContext.Provider>
}

export function useClimate(): ClimateValue {
  const ctx = useContext(ClimateContext)
  if (!ctx) throw new Error('useClimate 는 ClimateProvider 안에서만 쓸 수 있다')
  return ctx
}

/** 시계열에서 추세선을 뽑는다 (S3 추세선, S4 채점 기준) */
export function trendOf(series: YearMean[]): { slope: number; intercept: number; perDecade: number } {
  const n = series.length
  const mx = series.reduce((s, r) => s + r.year, 0) / n
  const my = series.reduce((s, r) => s + r.tavg, 0) / n
  let num = 0
  let den = 0
  for (const r of series) {
    num += (r.year - mx) * (r.tavg - my)
    den += (r.year - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return { slope, intercept: my - slope * mx, perDecade: slope * 10 }
}
