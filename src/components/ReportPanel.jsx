import React from 'react';

export default function ReportPanel({ obliquity, eccentricity, magneticField }) {
  // 1. 자기장 상태 진단
  const isShieldDown = magneticField < 20;
  let shieldStatus = 'STABLE';
  let shieldColor = 'text-emerald-400';
  let shieldImpact = '대기 오존층 완전 보호 및 우주 방사선 정상 차단';

  if (magneticField === 0) {
    shieldStatus = 'DOWN';
    shieldColor = 'text-[#FF453A] font-bold animate-pulse';
    shieldImpact = '자기장 소실! 우주 방사선 폭격으로 오존층 급격한 붕괴 진행 중';
  } else if (isShieldDown) {
    shieldStatus = 'CRITICAL';
    shieldColor = 'text-[#FF453A] font-bold';
    shieldImpact = '오존 밀도 극단적 감소, 지표 UV 지수 300% 이상 폭발적 증가';
  } else if (magneticField < 60) {
    shieldStatus = 'WARNING';
    shieldColor = 'text-amber-400';
    shieldImpact = '자기 보호막 약화. 상층 대기 점진적 침식 및 전리층 교란 감지';
  }

  // 2. 공전 이심률 상태 진단
  let orbitStatus = 'STABLE';
  let orbitColor = 'text-emerald-400';
  let orbitImpact = '일사량의 고른 분포로 안정적인 기온 주기 유지';

  if (eccentricity > 0.05) {
    orbitStatus = 'EXTREME';
    orbitColor = 'text-[#FF453A] font-bold';
    orbitImpact = '극단적 타원 궤도. 원일점에서의 태양 복사 에너지 격감으로 빙하기 가속화';
  } else if (eccentricity > 0.03) {
    orbitStatus = 'WARNING';
    orbitColor = 'text-amber-400';
    orbitImpact = '계절성 일사량 변동폭 20% 증가. 극지방 중심의 영구 설빙 축적 개시';
  }

  // 3. 자전축 기울기 상태 진단
  let tiltStatus = 'STABLE';
  let tiltColor = 'text-emerald-400';
  let tiltImpact = '표준 계절적 변동. 온화한 극지방 융해/결빙 주기';

  if (obliquity < 22.5) {
    tiltStatus = 'MINIMUM';
    tiltColor = 'text-amber-400';
    tiltImpact = '계절 차이 최소화. 서늘한 극지 여름으로 인해 연간 강설 잔존량 증가';
  } else if (obliquity > 24.0) {
    tiltStatus = 'MAXIMUM';
    tiltColor = 'text-amber-400';
    tiltImpact = '계절적 극한 기후. 여름철 극지 가열 심화 및 겨울철 영하 폭설 극대화';
  }

  return (
    <div className="w-full h-full bg-[#1C1C1E] text-white flex flex-col font-sans select-none">
      
      {/* 보고서 타이틀바 및 쉴드 위험 뱃지 */}
      <div className="flex justify-between items-center mb-4 border-b border-[#2C2C2E] pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-white rounded-full"></span>
          <h3 className="font-bold text-sm tracking-wider uppercase text-white font-mono">
            CLIMATE DIAGNOSTIC REPORT (SOL-3)
          </h3>
        </div>

        {/* [요구사항] 자기장 20% 미만일 때: solid red dot + "CRITICAL: Shield Down" */}
        {isShieldDown ? (
          <div className="flex items-center gap-2 bg-[#FF453A]/10 border border-[#FF453A]/30 px-3 py-1 rounded-full">
            <span className="w-2.5 h-2.5 bg-[#FF453A] rounded-full animate-ping"></span>
            <span className="w-2.5 h-2.5 bg-[#FF453A] rounded-full absolute"></span>
            <span className="text-[11px] font-bold text-[#FF453A] tracking-wider uppercase font-mono">
              CRITICAL: Shield Down
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            <span className="text-[11px] font-medium text-emerald-400 tracking-wider uppercase font-mono">
              SHIELD SECURE
            </span>
          </div>
        )}
      </div>

      {/* [요구사항] Tabular (표 형식) 데이터 렌더링 */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2C2C2E] text-[#8E8E93] font-mono uppercase tracking-wider">
              <th className="pb-2 font-medium w-1/4">Cosmic Parameter</th>
              <th className="pb-2 font-medium w-1/6">Telemetry Value</th>
              <th className="pb-2 font-medium w-1/6">Risk Factor</th>
              <th className="pb-2 font-medium">Environmental Impact Diagnostic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2C2C2E]/50 font-mono text-white">
            <tr>
              <td className="py-3 font-semibold text-white">Geomagnetic Field Strength</td>
              <td className="py-3 text-white">{magneticField}%</td>
              <td className={`py-3 ${shieldColor}`}>{shieldStatus}</td>
              <td className="py-3 text-[#C4C7C8] text-[11px] font-sans leading-relaxed">{shieldImpact}</td>
            </tr>
            <tr>
              <td className="py-3 font-semibold text-white">Orbital Eccentricity</td>
              <td className="py-3 text-white">{eccentricity.toFixed(3)}</td>
              <td className={`py-3 ${orbitColor}`}>{orbitStatus}</td>
              <td className="py-3 text-[#C4C7C8] text-[11px] font-sans leading-relaxed">{orbitImpact}</td>
            </tr>
            <tr>
              <td className="py-3 font-semibold text-white">Axial Obliquity (Tilt)</td>
              <td className="py-3 text-white">{obliquity.toFixed(1)}°</td>
              <td className={`py-3 ${tiltColor}`}>{tiltStatus}</td>
              <td className="py-3 text-[#C4C7C8] text-[11px] font-sans leading-relaxed">{tiltImpact}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}

