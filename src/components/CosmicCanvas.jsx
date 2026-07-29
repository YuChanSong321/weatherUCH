import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import SpaceScene from './SpaceScene';
import { ShieldAlert } from 'lucide-react';

// 3D 캔버스 렌더링 실패에 대응하기 위한 간이 에러 경계(ErrorBoundary) 클래스
class CanvasErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CanvasErrorBoundary] WebGL / Canvas crash caught:', error, errorInfo);
    console.error('[CanvasErrorBoundary] Error message:', error?.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-red-950 text-red-400 border border-red-500 rounded p-6 text-center font-mono">
          <ShieldAlert className="w-12 h-12 mb-3 animate-bounce" />
          <h4 className="text-lg font-bold mb-2 uppercase">WebGL Context Error</h4>
          <p className="text-xs max-w-md leading-relaxed mb-4 text-red-300">
            {this.state.error?.message || 'The 3D simulator failed to initialize.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="py-1.5 px-4 bg-red-500/25 border border-red-500 text-red-200 hover:bg-red-500/40 rounded text-xs tracking-wider transition-all uppercase"
          >
            Reload Simulator
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CosmicCanvas({
  obliquity,
  eccentricity,
  magneticField,
  isPlaying,
  simSpeed,
  viewMode,
  cameraDistance
}) {
  const [webglSupported, setWebglSupported] = useState(true);

  // 마운트 시 브라우저의 WebGL 지원 여부 검사
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglSupported(false);
      }
    } catch (e) {
      setWebglSupported(false);
    }
  }, []);

  if (!webglSupported) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-hud-bg text-hud-warn border border-hud-warn/40 rounded p-6 text-center font-mono">
        <ShieldAlert className="w-12 h-12 mb-3" />
        <h4 className="text-lg font-bold mb-2 uppercase">WebGL Unsupported</h4>
        <p className="text-xs max-w-md leading-relaxed text-hud-text">
          Your browser or system does not support WebGL. Please enable WebGL or try using a different modern browser (Chrome, Firefox, Safari) to view the 3D orbit simulation.
        </p>
      </div>
    );
  }

  // 관측 뷰 모드(viewMode)와 줌 배율(cameraDistance)에 따른 카메라 위치 조정
  // useMemo로 감싸서 매 렌더마다 새 배열 객체가 생성되는 것을 방지 (R3F 카메라 재설정 방지)
  const cameraPosition = useMemo(() => (
    viewMode === 'earth'
      ? [0, cameraDistance * 0.4, cameraDistance]
      : [0, cameraDistance * 0.5, cameraDistance]
  ), [viewMode, cameraDistance]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* SF 오버레이 HUD 좌표 및 상태 표시기 */}
      <div className="absolute top-4 left-4 font-mono text-[9px] text-[#8E8E93] select-none z-10 pointer-events-none space-y-0.5">
        <div>VIEWPORT_LOC: LAT.0.0.0 // LNG.0.0.0</div>
        <div>CAM_FOV: 60.00° // APERTURE: F/4.0</div>
        <div>SHIELD_STATUS: ACTIVE</div>
      </div>

      <div className="absolute top-4 right-4 font-mono text-[9px] text-[#8E8E93] select-none z-10 pointer-events-none text-right">
        <div>TARGET: SOL-3 // SYS: HELIO-GRID</div>
        <div>TIME_FACTOR: {isPlaying ? `${simSpeed}.00x` : 'PAUSED'}</div>
      </div>

      <div className="absolute bottom-4 left-4 font-mono text-[9px] text-[#8E8E93] select-none z-10 pointer-events-none">
        <div>ORBIT_TYPE: ELLIPTICAL [E={eccentricity.toFixed(4)}]</div>
      </div>

      {/* 에러 경계와 로딩(Suspense) 폴백이 적용된 R3F 캔버스 */}
      <CanvasErrorBoundary>
        <Suspense fallback={
          <div className="w-full h-full flex flex-col items-center justify-center text-white font-mono text-xs">
            <span className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2" />
            INITIALIZING SPACE SIMULATION...
          </div>
        }>
          <Canvas
            camera={{ position: cameraPosition, fov: 60 }}
            gl={{ antialias: true, alpha: false }}
          >
            {/* 칠흑 같은 심우주 배경 색상 설정 (순수 블랙 #000000) */}
            <color attach="background" args={['#000000']} />

            {/* 우주 배경의 성단(별무리) 효과 */}
            <Stars radius={100} depth={50} count={2000} factor={4} saturation={0.5} fade speed={1} />

            {/* 은은한 우주 전체 광원 */}
            <ambientLight intensity={0.08} />

            {/* 3D 우주 씬 구성 요소 */}
            <SpaceScene
              obliquity={obliquity}
              eccentricity={eccentricity}
              magneticField={magneticField}
              isPlaying={isPlaying}
              simSpeed={simSpeed}
              viewMode={viewMode}
            />

            {/* 카메라 제어 컨트롤러 */}
            <OrbitControls 
              enableDamping 
              dampingFactor={0.05} 
              maxDistance={60} 
              minDistance={3}
              makeDefault
            />
          </Canvas>
        </Suspense>
      </CanvasErrorBoundary>
    </div>
  );
}
