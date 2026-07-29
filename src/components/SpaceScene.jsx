import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import EarthSystem from './EarthSystem';

export default function SpaceScene({
  obliquity,
  eccentricity,
  magneticField,
  isPlaying,
  simSpeed,
  viewMode
}) {
  // 애니메이션 프레임 루프 시 React 재렌더링 방지를 위해 가변 상태(ref)에 각도 변수 저장
  const thetaRef = useRef(0);
  const rotationRef = useRef(0);

  // 공전 궤도 기초 매개변수 설정
  const a = 14; // 지구 공전 궤도의 장반경 (공전 궤도 스케일)

  // 현재 이심률을 반영하여 공전 타원 궤도 성분 계산
  // 초점 거리 c = a * e
  // 단반경 b = a * sqrt(1 - e^2)
  const { b, c } = useMemo(() => {
    const semiMinor = a * Math.sqrt(1 - eccentricity * eccentricity);
    const focusDist = a * eccentricity;
    return { b: semiMinor, c: focusDist };
  }, [eccentricity]);

  // 공전 궤도 실선을 구성할 타원 좌표점 목록 생성
  const orbitPoints = useMemo(() => {
    const points = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // 초점(태양)이 [0, 0, 0]에 위치할 수 있도록 중심을 [-c, 0, 0]으로 지정
      const x = a * Math.cos(angle) - c;
      const z = b * Math.sin(angle);
      points.push(new THREE.Vector3(x, 0, z));
    }
    return points;
  }, [b, c, eccentricity]);

  // 프레임 렌더링마다 3D 객체의 위치를 동적으로 업데이트하기 위한 Ref 구조
  const sunRef = useRef();
  const orbitLineRef = useRef();
  const earthGroupRef = useRef();

  useFrame((state, delta) => {
    // 1. 시뮬레이션이 활성화된 경우 시간 경과 처리
    if (isPlaying) {
      // 설정된 시뮬레이션 배속(simSpeed)이 공전 및 자전 속도에 영향
      const dt = delta * simSpeed;
      thetaRef.current += dt * 0.15; // 지구 공전 진행 속도
      rotationRef.current += dt * 0.75; // 지구 일일 자전 속도
    }

    // 2. 태양[0,0,0] 기준 지구의 현재 궤도상 물리적 3D 좌표 산출
    const theta = thetaRef.current;
    const earthX = a * Math.cos(theta) - c;
    const earthZ = b * Math.sin(theta);

    // 3. 선택한 관측 뷰 모드에 따라 3D 엔진 구성 요소 위치 갱신
    if (viewMode === 'system') {
      // 태양계 공전(Helio Orbit) 모드: 태양이 중심에 위치하며 지구가 공전합니다.
      if (sunRef.current) sunRef.current.position.set(0, 0, 0);
      if (orbitLineRef.current) orbitLineRef.current.position.set(0, 0, 0);
      if (earthGroupRef.current) {
        earthGroupRef.current.position.set(earthX, 0, earthZ);
      }
    } else {
      // 지구 집중(Earth Focus) 모드: 지구가 원점 [0,0,0]에 오도록 고정하고, 태양과 궤도선을 반대로 오프셋 시킵니다.
      if (earthGroupRef.current) earthGroupRef.current.position.set(0, 0, 0);
      if (sunRef.current) sunRef.current.position.set(-earthX, 0, -earthZ);
      if (orbitLineRef.current) {
        // 원래 태양 대비 공전 타원의 중심 위치는 [-c, 0, 0]이었습니다.
        // 따라서 중심 좌표는 지구 대비 [-c - earthX, 0, -earthZ]가 됩니다.
        orbitLineRef.current.position.set(-earthX, 0, -earthZ);
      }
    }
  });

  return (
    <group>
      {/* 1. 이글거리는 태양 */}
      <group ref={sunRef}>
        {/* 태양핵 구체 */}
        <mesh>
          <sphereGeometry args={[1.8, 32, 32]} />
          <meshBasicMaterial 
            color="#ffaa00" 
            toneMapped={false} 
          />
        </mesh>
        
        {/* 태양 코로나 가스층 발광 레이어 */}
        <mesh scale={[1.15, 1.15, 1.15]}>
          <sphereGeometry args={[1.8, 32, 32]} />
          <meshBasicMaterial 
            color="#ff5500" 
            transparent 
            opacity={0.3} 
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        {/* 태양 대기 광휘 잔상 효과 */}
        <mesh scale={[1.35, 1.35, 1.35]}>
          <sphereGeometry args={[1.8, 32, 32]} />
          <meshBasicMaterial 
            color="#ffeedd" 
            transparent 
            opacity={0.1} 
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        {/* 태양 중심에서 사방으로 뻗어나가는 점광원 */}
        <pointLight position={[0, 0, 0]} intensity={5.0} distance={150} decay={1.5} />
      </group>

      {/* 2. 지구 공전 궤도선 (1px 흰색 타원) */}
      <group ref={orbitLineRef}>
        <Line
          points={orbitPoints}
          color="#ffffff"
          lineWidth={1.0}
          opacity={0.5}
          transparent
        />
      </group>

      {/* 3. 지구 시스템 (자전축, 지구, 자기장 등) */}
      <group ref={earthGroupRef}>
        <EarthSystem
          obliquity={obliquity}
          magneticField={magneticField}
          rotationRef={rotationRef}
          viewMode={viewMode}
        />
      </group>
    </group>
  );
}
