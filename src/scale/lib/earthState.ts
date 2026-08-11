/**
 * 대시보드에 상시 표시되는 '지구 상태' 모델.
 *
 * ⚠️ 교육용 단순화 모델이다. 실제 기후 모델(GCM)이 아니며, 화면에도 그렇게 표기한다.
 * 다만 아무 근거 없는 임의 함수는 쓰지 않는다 — 아래 두 항은 출처가 있는 식이다.
 *
 *  · CO₂ 복사강제력  ΔF = 5.35 · ln(C/C₀)      (Myhre et al. 1998, IPCC 관용식)
 *    여기에 기후민감도 λ 를 곱해 기온으로 옮긴다. λ = 0.8 K/(W/m²) 는 평형기후민감도
 *    3.0°C/2×CO₂ (IPCC AR6 best estimate) 에 대응하는 값이다.
 *
 *  · 궤도 기여      북위 65° 하지 일사량 편차를 전지구 평균기온으로 환산.
 *    이쪽은 실제 물리 계수가 아니라 **교육용 환산**이다. 빙기–간빙기의 기온 진폭
 *    (약 5°C)이 하지 일사량 진폭(약 110 W/m²)에 대응하도록 잡았다. 수만 년 규모의
 *    느린 변화를 하나의 숫자로 보여주기 위한 장치라는 점을 UI 에 명시할 것.
 *
 * 지자기 세기는 여기에 들어가지 않는다. 자기장은 우주방사선·오존을 통해 생물권에
 * 영향을 주지만 전지구 평균기온을 직접 움직이지는 않는다 — 넣으면 그것이 허위다.
 * 대시보드에서도 기온과 분리된 별도 지표로 다룬다.
 */
import { PRESENT_SUMMER, summerInsolation, type OrbitParams } from './milankovitch'

/** 산업화 이전(1850–1900) 전지구 평균기온 (°C) */
export const PREINDUSTRIAL_TEMP = 13.9
/** 산업화 이전 CO₂ 농도 (ppm) */
export const PREINDUSTRIAL_CO2 = 280
/** 현재 CO₂ 농도 (ppm) — 전지구 연평균, WMO 온실가스 회보 기준 */
export const PRESENT_CO2 = 421

/** 기후민감도 λ — K per W/m² */
const CLIMATE_SENSITIVITY = 0.8
/** 하지 일사량(W/m²) → 전지구 평균기온(°C) 환산 (교육용) */
const ORBIT_GAIN = 5 / 110

/** CO₂ 복사강제력 (W/m²) */
export const co2Forcing = (ppm: number): number => 5.35 * Math.log(ppm / PREINDUSTRIAL_CO2)

/** CO₂ 가 만든 기온 상승분 (°C) */
export const co2Warming = (ppm: number): number => CLIMATE_SENSITIVITY * co2Forcing(ppm)

/** 궤도 3요소가 만드는 기온 편차 (°C) — 현재 지구를 0 으로 둔다 */
export const orbitDelta = (p: OrbitParams): number =>
  ORBIT_GAIN * (summerInsolation(p) - PRESENT_SUMMER)

/** 전지구 평균기온 (°C) */
export const globalMeanTemp = (p: OrbitParams, co2: number): number =>
  PREINDUSTRIAL_TEMP + co2Warming(co2) + orbitDelta(p)

/** 산업화 이전 대비 기온 편차 (°C) — 대시보드의 주 지표 */
export const tempAnomaly = (p: OrbitParams, co2: number): number =>
  globalMeanTemp(p, co2) - PREINDUSTRIAL_TEMP

/**
 * 임계치 — 기획안 §6 의 확정값.
 * 판정은 여기 한 곳에서만 한다 (대시보드·S7 셰이더·룰 엔진이 같은 값을 봐야 한다).
 */
export const THRESHOLDS = {
  /** 이 값 이하면 자기권 붕괴 연출 */
  magneticCollapse: 20,
  /** 이 값 이상이면 궤도 극단화 경고 */
  eccentricityExtreme: 0.05,
} as const
