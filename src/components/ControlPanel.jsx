import React from 'react';
import { Play, Pause, RefreshCw, Eye, Orbit, Shield, Sparkles } from 'lucide-react';

export default function ControlPanel({
  obliquity,
  setObliquity,
  eccentricity,
  setEccentricity,
  magneticField,
  setMagneticField,
  isPlaying,
  setIsPlaying,
  simSpeed,
  setSimSpeed,
  viewMode,
  setViewMode,
  applyPreset,
  currentPreset
}) {
  return (
    <div className="flex flex-col h-full bg-hud-panel border border-hud-border rounded-lg p-5 relative overflow-y-auto scanlines shadow-hud-glow">
      {/* HUD 모서리 장식 데코레이션 */}
      <div className="hud-corner-tl" />
      <div className="hud-corner-tr" />
      <div className="hud-corner-bl" />
      <div className="hud-corner-br" />

      {/* 컨트롤 패널 헤더 */}
      <div className="border-b border-hud-border pb-3 mb-5">
        <h2 className="font-display font-bold text-lg text-hud-title tracking-wider flex items-center gap-2 uppercase">
          <Orbit className="w-5 h-5 text-hud-accent animate-pulse" />
          Control Diagnostics
        </h2>
        <p className="font-mono text-xs text-hud-accent/60 mt-1">SYSTEM_STATUS: ONLINE // VERSION: 1.0.4</p>
      </div>

      {/* 프리셋 시나리오 */}
      <div className="mb-6">
        <span className="font-mono text-xs text-hud-accent uppercase tracking-wider block mb-2 font-semibold">
          // 프리셋 우주 환경 설정
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => applyPreset('ice-age')}
            className={`py-2 px-3 border rounded text-xs font-mono tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 uppercase ${
              currentPreset === 'ice-age'
                ? 'bg-hud-accent/20 border-hud-accent text-hud-title shadow-[0_0_10px_rgba(0,242,254,0.3)]'
                : 'bg-hud-bg/60 border-hud-border text-hud-text hover:border-hud-accent/60 hover:text-hud-accent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ice Age Mode
          </button>
          <button
            onClick={() => applyPreset('reversal')}
            className={`py-2 px-3 border rounded text-xs font-mono tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 uppercase ${
              currentPreset === 'reversal'
                ? 'bg-hud-warn/20 border-hud-warn text-hud-title shadow-[0_0_10px_rgba(255,42,95,0.3)]'
                : 'bg-hud-bg/60 border-hud-border text-hud-text hover:border-hud-warn/60 hover:text-hud-warn'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Reversal (42k)
          </button>
        </div>
        <button
          onClick={() => applyPreset('default')}
          className="w-full mt-2 py-1.5 px-3 bg-hud-bg/40 border border-hud-border/50 hover:border-hud-accent/60 hover:text-hud-accent rounded text-[11px] font-mono tracking-wider text-hud-text/80 transition-all flex items-center justify-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          RESTORE BALANCED INTERGLACIAL
        </button>
      </div>

      {/* 매개변수 슬라이더 조절기 */}
      <div className="space-y-6 flex-1">
        {/* 매개변수 1: 자전축 기울기 (Obliquity) */}
        <div className="space-y-2">
          <div className="flex justify-between items-end font-mono">
            <div>
              <span className="text-xs text-hud-accent uppercase tracking-wider block font-semibold">
                Obliquity (Tilt)
              </span>
              <span className="text-[10px] text-hud-text/70 block">Milankovitch Factor 1</span>
            </div>
            <span className="text-sm font-bold text-hud-title">
              {obliquity.toFixed(1)}°
            </span>
          </div>
          <input
            type="range"
            min="22.1"
            max="24.5"
            step="0.1"
            value={obliquity}
            onChange={(e) => setObliquity(parseFloat(e.target.value))}
            className="w-full cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-hud-text/50">
            <span>MIN [22.1°: Milder Seasons]</span>
            <span>MAX [24.5°: Extreme Seasons]</span>
          </div>
        </div>

        {/* 매개변수 2: 공전궤도 이심률 (Eccentricity) */}
        <div className="space-y-2">
          <div className="flex justify-between items-end font-mono">
            <div>
              <span className="text-xs text-hud-accent uppercase tracking-wider block font-semibold">
                Eccentricity
              </span>
              <span className="text-[10px] text-hud-text/70 block">Milankovitch Factor 2</span>
            </div>
            <span className="text-sm font-bold text-hud-title">
              {eccentricity.toFixed(4)}
            </span>
          </div>
          <input
            type="range"
            min="0.005"
            max="0.06"
            step="0.001"
            value={eccentricity}
            onChange={(e) => setEccentricity(parseFloat(e.target.value))}
            className="w-full cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-hud-text/50">
            <span>CIRCULAR [0.005]</span>
            <span>ELLIPTICAL [0.06]</span>
          </div>
        </div>

        {/* 매개변수 3: 자기장 보호막 세기 (Magnetic Field Strength) */}
        <div className="space-y-2">
          <div className="flex justify-between items-end font-mono">
            <div>
              <span className="text-xs text-hud-accent uppercase tracking-wider block font-semibold">
                Magnetic Field
              </span>
              <span className="text-[10px] text-hud-text/70 block">Geomagnetic Shield</span>
            </div>
            <span className={`text-sm font-bold ${magneticField < 20 ? 'text-hud-warn font-black animate-pulse' : 'text-hud-title'}`}>
              {magneticField}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={magneticField}
            onChange={(e) => setMagneticField(parseInt(e.target.value))}
            className="w-full cursor-pointer"
          />
          <div className="flex justify-between items-center text-[9px] font-mono">
            <span className="text-hud-warn/80">REVERSAL STATE [0%]</span>
            <span className="text-hud-success/80">MAX SHIELD [100%]</span>
          </div>
        </div>
      </div>

      {/* 시뮬레이터 제어 및 관측 뷰 모드 */}
      <div className="border-t border-hud-border/40 pt-4 mt-6 space-y-4">
        {/* 뷰 모드 전환 스위처 */}
        <div>
          <span className="font-mono text-[11px] text-hud-accent/80 uppercase block mb-2">// 우주 관측 뷰 모드 설정</span>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <button
              onClick={() => setViewMode('system')}
              className={`py-1.5 px-2 border rounded flex items-center justify-center gap-1 transition-all ${
                viewMode === 'system'
                  ? 'bg-hud-accent/15 border-hud-accent text-hud-title shadow-[0_0_8px_rgba(0,242,254,0.25)]'
                  : 'bg-hud-bg/40 border-hud-border/40 text-hud-text hover:border-hud-accent/60'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" />
              Helio Orbit
            </button>
            <button
              onClick={() => setViewMode('earth')}
              className={`py-1.5 px-2 border rounded flex items-center justify-center gap-1 transition-all ${
                viewMode === 'earth'
                  ? 'bg-hud-accent/15 border-hud-accent text-hud-title shadow-[0_0_8px_rgba(0,242,254,0.25)]'
                  : 'bg-hud-bg/40 border-hud-border/40 text-hud-text hover:border-hud-accent/60'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Earth Focus
            </button>
          </div>
        </div>

        {/* 재생/일시정지 및 배속 제어 */}
        <div className="flex items-center justify-between border-t border-hud-border/20 pt-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`py-2 px-4 rounded font-mono text-xs tracking-wider flex items-center gap-2 border uppercase transition-all duration-300 ${
              isPlaying
                ? 'bg-hud-accent/20 border-hud-accent text-hud-accent shadow-[0_0_8px_rgba(0,242,254,0.2)]'
                : 'bg-hud-bg border-hud-border/60 text-hud-text hover:border-hud-accent/60 hover:text-hud-accent'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                PAUSE SIM
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                RUN SIM
              </>
            )}
          </button>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] text-hud-text/70 uppercase mr-1">Time Scale:</span>
            {[1, 2, 5].map((speed) => (
              <button
                key={speed}
                onClick={() => setSimSpeed(speed)}
                className={`w-6 h-6 rounded border font-mono text-[10px] flex items-center justify-center transition-all ${
                  simSpeed === speed
                    ? 'border-hud-accent bg-hud-accent/10 text-hud-accent font-bold'
                    : 'border-hud-border/40 text-hud-text/60 hover:border-hud-accent/60'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
