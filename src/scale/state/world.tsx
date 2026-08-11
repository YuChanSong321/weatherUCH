/**
 * 지구 상태 전역 스토어 — 상시 대시보드와 3D 지구가 함께 보는 단 하나의 진실.
 *
 * 기획안 §2 의 원칙 3: "사용자의 모든 조작이 이 수치를 실시간으로 갱신한다."
 * 그래서 궤도 3요소·자기장·CO₂ 는 단계별 로컬 state 가 아니라 여기에 산다.
 * 어떤 단계에서 슬라이더를 만지든 대시보드와 지구가 같은 값을 본다.
 *
 * 점수·진행도는 여기가 아니라 [state/journey] 다. 이쪽은 '지구가 지금 어떤
 * 상태인가' 만 담는다.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PRESENT, type OrbitParams } from '../lib/milankovitch'
import { PRESENT_CO2, THRESHOLDS, globalMeanTemp, tempAnomaly } from '../lib/earthState'

/** 지자기 세기 (%) — 현재 지구가 100 */
export const PRESENT_MAGNETIC = 100

type WorldValue = {
  orbit: OrbitParams
  magneticField: number
  co2: number
  /** 전지구 평균기온 (°C) */
  meanTemp: number
  /** 산업화 이전 대비 (°C) */
  anomaly: number
  /** 임계치를 넘었는가 */
  alerts: { magnetic: boolean; eccentricity: boolean }
  setOrbit: (patch: Partial<OrbitParams>) => void
  setMagneticField: (v: number) => void
  setCo2: (v: number) => void
  /** 현재 지구로 되돌린다 */
  resetWorld: () => void
}

const WorldContext = createContext<WorldValue | null>(null)

export function WorldProvider({ children }: { children: ReactNode }) {
  const [orbit, setOrbitState] = useState<OrbitParams>(PRESENT)
  const [magneticField, setMagneticField] = useState(PRESENT_MAGNETIC)
  const [co2, setCo2] = useState(PRESENT_CO2)

  const setOrbit = useCallback((patch: Partial<OrbitParams>) => {
    setOrbitState((p) => ({ ...p, ...patch }))
  }, [])

  const resetWorld = useCallback(() => {
    setOrbitState(PRESENT)
    setMagneticField(PRESENT_MAGNETIC)
    setCo2(PRESENT_CO2)
  }, [])

  const value = useMemo<WorldValue>(
    () => ({
      orbit,
      magneticField,
      co2,
      meanTemp: globalMeanTemp(orbit, co2),
      anomaly: tempAnomaly(orbit, co2),
      alerts: {
        magnetic: magneticField <= THRESHOLDS.magneticCollapse,
        eccentricity: orbit.eccentricity >= THRESHOLDS.eccentricityExtreme,
      },
      setOrbit,
      setMagneticField,
      setCo2,
      resetWorld,
    }),
    [orbit, magneticField, co2, setOrbit, resetWorld],
  )

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>
}

export function useWorld(): WorldValue {
  const ctx = useContext(WorldContext)
  if (!ctx) throw new Error('useWorld 는 WorldProvider 안에서만 쓸 수 있다')
  return ctx
}
