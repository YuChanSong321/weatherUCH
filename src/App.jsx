import React, { useState, useEffect } from 'react';
import CosmicCanvas from './components/CosmicCanvas';
import ReportPanel from './components/ReportPanel';
import { Info } from 'lucide-react';

// iOS 17 Control Center 스타일의 커스텀 캡슐 슬라이더 컴포넌트
function CapsuleSlider({ label, min, max, step, value, onChange, formatValue }) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">
        <span>{label}</span>
      </div>
      <div className="relative w-full h-[50px] bg-[#2C2C2E] rounded-2xl overflow-hidden select-none">
        {/* 채워지는 solid white 바 */}
        <div 
          className="absolute top-0 left-0 h-full bg-white transition-all duration-75 pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
        {/* 텍스트 라벨 및 현재 수치 값 */}
        <div className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none mix-blend-difference text-white font-semibold text-[13px]">
          <span>{label}</span>
          <span className="font-mono">{formatValue ? formatValue(value) : value}</span>
        </div>
        {/* 드래그 조작을 위한 보이지 않는 투명 range input */}
        <input 
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
      </div>
    </div>
  );
}

export default function App() {
  // 핵심 우주 매개변수 상태
  const [obliquity, setObliquity] = useState(23.5); // 자전축 기울기: 22.1° ~ 24.5°
  const [eccentricity, setEccentricity] = useState(0.016); // 공전 이심률: 0.005 ~ 0.06
  const [magneticField, setMagneticField] = useState(100); // 자기장 세기: 0% ~ 100%

  // 뷰 및 카메라 상태
  const [viewMode, setViewMode] = useState('system'); // 'system'(태양계 공전) 또는 'earth'(지구 집중)
  const [cameraDistance, setCameraDistance] = useState(30);

  // 활성 프리셋 세그먼트 ('default', 'ice-age', 'reversal', 'none')
  const [activeSegment, setActiveSegment] = useState('default');

  // 모달 상태 관리
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isPlaying = true;
  const simSpeed = 2;

  // 뷰 모드가 변경되면 카메라 거리를 적절한 기본값으로 세팅
  useEffect(() => {
    setCameraDistance(viewMode === 'earth' ? 5 : 30);
  }, [viewMode]);

  // 슬라이더 조작 시 세그먼트 상태 동기화
  useEffect(() => {
    if (obliquity === 23.5 && eccentricity === 0.016 && magneticField === 100) {
      setActiveSegment('default');
    } else if (obliquity === 22.1 && eccentricity === 0.06 && magneticField === 100) {
      setActiveSegment('ice-age');
    } else if (obliquity === 24.0 && eccentricity === 0.03 && magneticField === 0) {
      setActiveSegment('reversal');
    } else {
      setActiveSegment('none');
    }
  }, [obliquity, eccentricity, magneticField]);

  // 프리셋 피커 클릭 이벤트 핸들러
  const handleSelectSegment = (segment) => {
    setActiveSegment(segment);
    if (segment === 'default') {
      setObliquity(23.5);
      setEccentricity(0.016);
      setMagneticField(100);
      setViewMode('system');
    } else if (segment === 'ice-age') {
      setObliquity(22.1);
      setEccentricity(0.06);
      setMagneticField(100);
      setViewMode('system');
    } else if (segment === 'reversal') {
      setObliquity(24.0);
      setEccentricity(0.03);
      setMagneticField(0); // 0%에서 equator 경고 링이 렌더링되게 함
      setViewMode('earth');
    }
  };

  const zoomIn = () => {
    setCameraDistance(prev => {
      const minVal = viewMode === 'earth' ? 3 : 10;
      const step = viewMode === 'earth' ? 0.8 : 4;
      return Math.max(minVal, prev - step);
    });
  };

  const zoomOut = () => {
    setCameraDistance(prev => {
      const maxVal = viewMode === 'earth' ? 12 : 70;
      const step = viewMode === 'earth' ? 0.8 : 4;
      return Math.min(maxVal, prev + step);
    });
  };

  const resetZoom = () => {
    setCameraDistance(viewMode === 'earth' ? 5 : 30);
  };

  return (
    <div className="h-screen w-screen bg-[#000000] text-white flex flex-col overflow-hidden relative select-none">
      
      {/* 상단 네비게이션 바 */}
      <nav className="w-full flex justify-between items-center px-6 h-[60px] bg-[#1C1C1E] border-b border-[#2C2C2E] z-50">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[17px] tracking-tight text-white uppercase font-mono">Cosmic Climate Simulator</span>
        </div>

        {/* iOS 17 세그먼티드 스타일 프리셋 피커 */}
        <div className="bg-[#2C2C2E] p-1 rounded-xl flex items-center gap-1">
          <button 
            className={`px-5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
              activeSegment === 'default' 
                ? 'bg-white text-black shadow' 
                : 'text-[#8E8E93] hover:text-white'
            }`} 
            onClick={() => handleSelectSegment('default')}
          >
            기본 상태 (Normal)
          </button>
          <button 
            className={`px-5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
              activeSegment === 'ice-age' 
                ? 'bg-white text-black shadow' 
                : 'text-[#8E8E93] hover:text-white'
            }`} 
            onClick={() => handleSelectSegment('ice-age')}
          >
            극대 빙하기 (Ice Age)
          </button>
          <button 
            className={`px-5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
              activeSegment === 'reversal' 
                ? 'bg-white text-black shadow' 
                : 'text-[#8E8E93] hover:text-white'
            }`} 
            onClick={() => handleSelectSegment('reversal')}
          >
            지자기 역전 (Reversal)
          </button>
        </div>

        {/* 아이콘 메뉴 */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="material-symbols-outlined text-white p-2 hover:bg-[#2C2C2E] rounded-full transition-all"
          >
            settings
          </button>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="material-symbols-outlined text-white p-2 hover:bg-[#2C2C2E] rounded-full transition-all"
          >
            help
          </button>
        </div>
      </nav>

      {/* 데스크톱 와이드스크린 스플릿 뷰 레이아웃 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* [요구사항 3] 좌측 컨트롤 패널 (charcoal #1C1C1E, no blur) */}
        <aside className="w-[360px] bg-[#1C1C1E] border-r border-[#2C2C2E] flex flex-col p-6 z-40 overflow-y-auto select-none">
          <div className="flex flex-col gap-1 pb-6 border-b border-[#2C2C2E]">
            <h2 className="font-bold text-lg tracking-tight text-white uppercase font-mono">Control Center</h2>
            <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-widest">Cosmic Parameter Modulators</p>
          </div>

          {/* iOS 17 슬라이더 그룹 */}
          <div className="flex flex-col gap-6 mt-6">
            <CapsuleSlider
              label="Obliquity (Tilt)"
              min={22.1}
              max={24.5}
              step={0.1}
              value={obliquity}
              onChange={setObliquity}
              formatValue={(val) => `${val.toFixed(1)}°`}
            />

            <CapsuleSlider
              label="Eccentricity (Orbit)"
              min={0.005}
              max={0.06}
              step={0.001}
              value={eccentricity}
              onChange={setEccentricity}
              formatValue={(val) => val.toFixed(3)}
            />

            <CapsuleSlider
              label="Magnetic Field"
              min={0}
              max={100}
              step={1}
              value={magneticField}
              onChange={setMagneticField}
              formatValue={(val) => `${val}%`}
            />
          </div>

          {/* 카메라 관측 모드 컨트롤 */}
          <div className="mt-auto pt-6 border-t border-[#2C2C2E] flex flex-col gap-3">
            <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Camera View Lock</span>
            <div className="bg-[#2C2C2E] p-1 rounded-xl flex items-center gap-1 w-full">
              <button 
                onClick={() => setViewMode('system')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  viewMode === 'system' 
                    ? 'bg-white text-black shadow' 
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                Orbit View
              </button>
              <button 
                onClick={() => setViewMode('earth')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  viewMode === 'earth' 
                    ? 'bg-white text-black shadow' 
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                Earth Focus
              </button>
            </div>
          </div>
        </aside>

        {/* 우측 공간 (WebGL 뷰포트 + 하단 상태 보고서 패널) */}
        <div className="flex-1 flex flex-col h-full bg-black overflow-hidden relative">
          
          {/* 중앙 HTML WebGL Viewport (Three.js 3D 지구 캔버스) */}
          <div className="flex-1 relative bg-black">
            <CosmicCanvas
              obliquity={obliquity}
              eccentricity={eccentricity}
              magneticField={magneticField}
              isPlaying={isPlaying}
              simSpeed={simSpeed}
              viewMode={viewMode}
              cameraDistance={cameraDistance}
            />

            {/* 카메라 플로팅 줌 컨트롤 버튼 */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-30">
              <button 
                onClick={zoomIn}
                className="w-10 h-10 bg-[#1C1C1E] text-white flex items-center justify-center rounded-full border border-[#2C2C2E] hover:bg-[#2C2C2E] active:scale-95 transition-all shadow-lg"
              >
                <span className="material-symbols-outlined">add</span>
              </button>
              <button 
                onClick={zoomOut}
                className="w-10 h-10 bg-[#1C1C1E] text-white flex items-center justify-center rounded-full border border-[#2C2C2E] hover:bg-[#2C2C2E] active:scale-95 transition-all shadow-lg"
              >
                <span className="material-symbols-outlined">remove</span>
              </button>
              <button 
                onClick={resetZoom}
                className="w-10 h-10 bg-[#1C1C1E] text-white flex items-center justify-center rounded-full border border-[#2C2C2E] hover:bg-[#2C2C2E] active:scale-95 transition-all shadow-lg mt-2"
              >
                <span className="material-symbols-outlined">center_focus_strong</span>
              </button>
            </div>
          </div>

          {/* [요구사항 4] 하단 상태 패널 (Tabular Climate Impact Report) */}
          <div className="h-[210px] bg-[#1C1C1E] border-t border-[#2C2C2E] p-6 overflow-hidden">
            <ReportPanel
              obliquity={obliquity}
              eccentricity={eccentricity}
              magneticField={magneticField}
            />
          </div>

        </div>
      </div>

      {/* 도움말 팝업창 모달 */}
      {showHelp && (
        <div className="fixed inset-0 bg-[#000000]/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] max-w-lg w-full p-6 shadow-2xl text-left relative">
            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 font-mono">
              <Info className="w-5 h-5 text-white" />
              SIMULATOR INFORMATION
            </h3>
            <div className="text-[12px] leading-relaxed text-[#C4C7C8] space-y-3 font-normal">
              <p>
                본 시뮬레이터는 지구 기후에 장기적 영향을 끼치는 우주적 요인인 **밀란코비치 주기(Milankovitch Cycles)**와 **지구 자기장 역전(Geomagnetic Reversal)** 현상을 시각화한 교육 플랫폼입니다.
              </p>
              <p>
                - **자전축 기울기(Obliquity)**: 41,000년 주기로 22.1°에서 24.5° 사이를 변동합니다. 기울기가 작아지면 계절 온도 격차가 적어지며 극지 여름철 눈이 덜 녹아 장기적인 빙하기를 유도합니다.
              </p>
              <p>
                - **공전 이심률(Eccentricity)**: 약 100,000년 주기로 궤도가 원형에서 타원형으로 변동합니다. 이심률이 극대화되면 근일점과 원일점의 거리가 큰 차이를 보여 기후 계절 차이가 극단적으로 치솟습니다.
              </p>
              <p>
                - **자기장 세기(Magnetic Field)**: 지구의 보호막입니다. 자기장이 0%로 약화(지자기 역전기)되면 우주 방사선 차단막을 잃게 되고, 적도 부근에 경고 적색 링이 나타나 쉴드 상실 상태를 통보합니다.
              </p>
            </div>
            <button 
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-2.5 bg-white text-black hover:bg-[#E3E2E7] font-bold rounded-xl text-xs tracking-wider transition-all"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* 설정 팝업창 모달 */}
      {showSettings && (
        <div className="fixed inset-0 bg-[#000000]/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] max-w-sm w-full p-6 shadow-2xl text-left">
            <h3 className="text-base font-bold text-white mb-4 font-mono uppercase tracking-wider">Settings</h3>
            <div className="space-y-4 text-xs text-[#C4C7C8]">
              <div className="flex justify-between items-center border-b border-[#2C2C2E] pb-2">
                <span>시간 시뮬레이션 속도</span>
                <span className="text-white font-mono font-bold">{simSpeed}x (Fixed)</span>
              </div>
              <div className="flex justify-between items-center border-b border-[#2C2C2E] pb-2">
                <span>안티앨리어싱</span>
                <span className="text-white font-semibold">사용함 (FXAA 4x)</span>
              </div>
              <div className="flex justify-between items-center border-b border-[#2C2C2E] pb-2">
                <span>렌더링 모드</span>
                <span className="text-green-400 font-semibold font-mono">WEBGL_ACTIVE</span>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="mt-6 w-full py-2.5 bg-white text-black hover:bg-[#E3E2E7] font-bold rounded-xl text-xs tracking-wider transition-all"
            >
              APPLY & CLOSE
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
