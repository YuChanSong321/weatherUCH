/**
 * S7 예측 엔진 — 규칙 기반, 외부 호출 없음 (기획안 §4).
 *
 * 파라미터 3개(자전축·이심률·자기장)를 받아 시나리오 텍스트 배열을 돌려주는
 * 순수 함수다. 판정 문턱은 기존 TERRA 앱(src/components/ReportPanel.jsx)의 것을
 * 그대로 옮겼고, 임계값 자체는 [lib/earthState].THRESHOLDS 한 곳에서만 읽는다 —
 * 셰이더 연출과 텍스트가 서로 다른 문턱을 쓰면 화면이 자기모순에 빠진다.
 *
 * ⚠️ 여기 적힌 결과들은 실제 지구시스템 모델의 산출이 아니라, 널리 알려진
 * 인과관계를 교육용으로 정리한 규칙이다. 화면에도 그렇게 표기한다.
 */
import { THRESHOLDS } from './earthState'
import type { OrbitParams } from './milankovitch'

export type Severity = 'stable' | 'warning' | 'critical'

export type Diagnosis = {
  id: string
  /** 어떤 변수에 대한 진단인가 */
  subject: string
  status: string
  severity: Severity
  /** 이 상태가 지구에 무엇을 하는가 */
  impact: string
}

export type WorldParams = OrbitParams & { magneticField: number }

export const SEVERITY_COLOR: Record<Severity, string> = {
  stable: 'var(--color-good)',
  warning: 'var(--color-warn)',
  critical: 'var(--color-bad)',
}

/** 자기장 진단 */
function magneticDiagnosis(pct: number): Diagnosis {
  if (pct <= 0.5) {
    return {
      id: 'mag-down',
      subject: '지자기',
      status: '차폐 상실',
      severity: 'critical',
      impact: '자기장 소실 — 우주 방사선이 그대로 대기에 꽂히고, 오존층이 빠르게 무너집니다.',
    }
  }
  if (pct <= THRESHOLDS.magneticCollapse) {
    return {
      id: 'mag-critical',
      subject: '지자기',
      status: '임계 이하',
      severity: 'critical',
      impact: '오존 밀도 급감 — 지표 자외선 지수가 폭증하고, 저위도의 대기 이탈이 가속됩니다.',
    }
  }
  if (pct < 60) {
    return {
      id: 'mag-warning',
      subject: '지자기',
      status: '약화',
      severity: 'warning',
      impact: '자기 보호막이 얇아졌습니다. 상층 대기가 서서히 깎이고 전리층이 교란됩니다.',
    }
  }
  return {
    id: 'mag-stable',
    subject: '지자기',
    status: '안정',
    severity: 'stable',
    impact: '태양풍이 자기권에서 비껴 흐릅니다. 오존층과 대기가 정상적으로 보호됩니다.',
  }
}

/** 이심률 진단 */
function eccentricityDiagnosis(e: number): Diagnosis {
  if (e >= THRESHOLDS.eccentricityExtreme) {
    return {
      id: 'ecc-extreme',
      subject: '궤도',
      status: '극단화',
      severity: 'critical',
      impact: '궤도가 크게 찌그러졌습니다 — 원일점에서 받는 태양 에너지가 급감해 빙하화가 가속됩니다.',
    }
  }
  if (e > 0.03) {
    return {
      id: 'ecc-warning',
      subject: '궤도',
      status: '변동 확대',
      severity: 'warning',
      impact: '계절별 일사량 격차가 커집니다. 극지방을 중심으로 만년설이 쌓이기 시작합니다.',
    }
  }
  return {
    id: 'ecc-stable',
    subject: '궤도',
    status: '안정',
    severity: 'stable',
    impact: '연중 일사량이 고르게 분포합니다. 기온 주기가 안정적으로 유지됩니다.',
  }
}

/** 자전축 진단 */
function obliquityDiagnosis(deg: number): Diagnosis {
  if (deg < 22.5) {
    return {
      id: 'obl-min',
      subject: '자전축',
      status: '최소 부근',
      severity: 'warning',
      impact: '계절 차이가 줄어듭니다. 극지의 여름이 서늘해져 겨울눈이 녹지 않고 남습니다.',
    }
  }
  if (deg > 24.0) {
    return {
      id: 'obl-max',
      subject: '자전축',
      status: '최대 부근',
      severity: 'warning',
      impact: '계절이 극단으로 갈립니다. 극지 여름의 가열과 겨울의 혹한이 함께 심해집니다.',
    }
  }
  return {
    id: 'obl-stable',
    subject: '자전축',
    status: '안정',
    severity: 'stable',
    impact: '표준적인 계절 변동입니다. 극지의 융해와 결빙이 온화한 주기를 그립니다.',
  }
}

/** 세 변수를 함께 볼 때만 보이는 복합 위험 */
function combinedDiagnoses(p: WorldParams): Diagnosis[] {
  const out: Diagnosis[] = []
  if (p.magneticField <= THRESHOLDS.magneticCollapse && p.eccentricity >= THRESHOLDS.eccentricityExtreme) {
    out.push({
      id: 'combo-double',
      subject: '복합',
      status: '이중 임계',
      severity: 'critical',
      impact:
        '차폐 상실과 궤도 극단화가 겹쳤습니다. 대기는 위에서 깎이고 아래에서 얼어붙습니다 — 한 번 넘으면 되돌리기 어려운 조합입니다.',
    })
  }
  return out
}

/** 전체 진단. 심각한 것이 앞에 온다. */
export function diagnose(p: WorldParams): Diagnosis[] {
  const rank: Record<Severity, number> = { critical: 0, warning: 1, stable: 2 }
  return [
    magneticDiagnosis(p.magneticField),
    eccentricityDiagnosis(p.eccentricity),
    obliquityDiagnosis(p.obliquity),
    ...combinedDiagnoses(p),
  ].sort((a, b) => rank[a.severity] - rank[b.severity])
}

/** 화면 전체의 상태 등급 */
export function overallSeverity(list: Diagnosis[]): Severity {
  if (list.some((d) => d.severity === 'critical')) return 'critical'
  if (list.some((d) => d.severity === 'warning')) return 'warning'
  return 'stable'
}
