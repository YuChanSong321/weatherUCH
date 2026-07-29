import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import * as THREE from 'three';

// 1. 오프라인/폴백용 절차적 지구 표면 텍스처 생성 함수
const createProceduralEarthTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // 해양: 짙은 스페이스 블루
  ctx.fillStyle = '#050c18';
  ctx.fillRect(0, 0, 1024, 512);
  
  // 위경도 그리드선
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.1)';
  ctx.lineWidth = 1;
  const grid = 32;
  for (let x = 0; x < 1024; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y < 512; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }

  // 가상의 대륙 그리기
  ctx.fillStyle = '#0a3a5c';
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 1.5;

  const continents = [
    { cx: 280, cy: 160, rx: 130, ry: 95 },  // 북아메리카
    { cx: 360, cy: 340, rx: 90, ry: 130 },  // 남아메리카
    { cx: 680, cy: 150, rx: 190, ry: 100 }, // 유라시아
    { cx: 580, cy: 300, rx: 120, ry: 130 }, // 아프리카
    { cx: 880, cy: 360, rx: 80, ry: 60 },   // 오스트레일리아
    { cx: 512, cy: 485, rx: 450, ry: 25 }   // 남극
  ];

  continents.forEach(c => {
    ctx.beginPath();
    const steps = 100;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const noise = 1 + 
        Math.sin(angle * 8) * 0.1 + 
        Math.cos(angle * 14) * 0.04 + 
        Math.sin(angle * 27) * 0.02;
      const x = c.cx + c.rx * Math.cos(angle) * noise;
      const y = c.cy + c.ry * Math.sin(angle) * noise;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  return new THREE.CanvasTexture(canvas);
};

// 2. 오프라인/폴백용 절차적 구름 텍스처 생성 함수
const createProceduralCloudTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // 투명 배경으로 초기화
  ctx.clearRect(0, 0, 512, 256);
  
  // 무작위로 흐릿한 구름 밴드들 그리기
  for (let i = 0; i < 35; i++) {
    const x = Math.random() * 512;
    const y = 40 + Math.random() * 176;
    const r = 25 + Math.random() * 45;
    
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  return new THREE.CanvasTexture(canvas);
};

// 3. 오프라인/폴백용 절차적 도시 야경 불빛 텍스처 생성 함수
const createProceduralNightLightsTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // 검은 배경 (밤 영역)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 512, 256);
  
  // 가상 대륙의 경계나 중심부에 야경 노란색 불빛 밀집군 배치
  const cities = [
    { cx: 280, cy: 150, count: 18 }, // 북미
    { cx: 360, cy: 320, count: 8 },  // 남미
    { cx: 650, cy: 140, count: 28 }, // 유럽 및 서아시아
    { cx: 740, cy: 160, count: 22 }, // 동아시아
    { cx: 580, cy: 280, count: 6 },  // 아프리카
    { cx: 880, cy: 350, count: 8 }   // 호주
  ];
  
  cities.forEach(city => {
    for (let i = 0; i < city.count; i++) {
      const x = city.cx + (Math.random() - 0.5) * 50;
      const y = city.cy + (Math.random() - 0.5) * 40;
      const r = Math.random() * 1.5 + 0.3;
      
      ctx.fillStyle = `rgba(255, 225, 120, ${Math.random() * 0.9 + 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  
  return new THREE.CanvasTexture(canvas);
};

// 4. Fresnel 아우라 효과를 위한 대기 발광 셰이더 재질 (팩토리 함수로 변경 - 모듈 레벨 공유 상태 버그 방지)
const createAtmosphereShader = () => ({
  uniforms: {
    color: { value: new THREE.Color('#00f2fe') }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    uniform vec3 color;
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float dotProduct = dot(normal, viewDir);
      float intensity = pow(0.65 - max(dotProduct, 0.0), 3.0);
      gl_FragColor = vec4(color, intensity);
    }
  `
});

export default function EarthSystem({ obliquity, magneticField, rotationRef, viewMode }) {
  const earthGlobeRef = useRef();
  const cloudsGlobeRef = useRef();
  const axisRef = useRef();
  const atmosphereRef = useRef();
  const magneticLinesRefs = useRef([]);
  // 자체적인 elapsed time 추적 ref (state.clock.getElapsedTime() 직접 호출은 getDelta()와 충돌 발생)
  const elapsedRef = useRef(0);
  // 컴포넌트별 고유 shader uniform 인스턴스 (모듈 레벨 공유 방지)
  const atmosphereShader = useRef(createAtmosphereShader()).current;

  const [textures, setTextures] = useState({
    earth: null,
    clouds: null,
    lights: null
  });

  // 3개 레이어 텍스처 로딩 및 오류 시 로컬 폴백 적용
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let loadedCount = 0;
    const tempTextures = { earth: null, clouds: null, lights: null };

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount === 3) {
        setTextures(tempTextures);
      }
    };

    // 1. 지구 표면 텍스처 로드
    loader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        tempTextures.earth = texture;
        checkAllLoaded();
      },
      undefined,
      () => {
        tempTextures.earth = createProceduralEarthTexture();
        checkAllLoaded();
      }
    );

    // 2. 구름 텍스처 로드
    loader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        tempTextures.clouds = texture;
        checkAllLoaded();
      },
      undefined,
      () => {
        tempTextures.clouds = createProceduralCloudTexture();
        checkAllLoaded();
      }
    );

    // 3. 야경 텍스처 로드
    loader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_lights_2048.png',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        tempTextures.lights = texture;
        checkAllLoaded();
      },
      undefined,
      () => {
        tempTextures.lights = createProceduralNightLightsTexture();
        checkAllLoaded();
      }
    );
  }, []);

  // 매 렌더링 프레임마다 자전축을 반영하여 회전 및 자기선 흐름 갱신
  useFrame((state, delta) => {
    // state.clock.getElapsedTime()은 getDelta()와 내부 상태를 공유하므로 직접 누적
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;

    // 1. 지구본 자전
    if (earthGlobeRef.current) {
      earthGlobeRef.current.rotation.y = rotationRef.current;
    }

    // 2. 구름층은 지구보다 약 1.05배 빠르게 독립적으로 회전하여 대기 흐름 표현
    if (cloudsGlobeRef.current) {
      cloudsGlobeRef.current.rotation.y = rotationRef.current * 1.05 + 0.02 * elapsed;
    }

    // 3. 자기선 점선 흐름 속도 제어
    magneticLinesRefs.current.forEach((lineMesh) => {
      if (lineMesh && lineMesh.material) {
        const flowSpeed = 1.0 + (magneticField / 100) * 1.5;
        lineMesh.material.dashOffset = -elapsed * flowSpeed;
      }
    });

    // 4. 오존층(대기) 발광 색상 선형 보간 (100% 하늘색 -> 0% 위험 핑크적색)
    if (atmosphereRef.current) {
      const shieldRatio = magneticField / 100;
      const targetColor = new THREE.Color().lerpColors(
        new THREE.Color('#ff2a5f'), // 방사선 노출 붉은색
        new THREE.Color('#00f2fe'), // 안전한 푸른색
        shieldRatio
      );
      atmosphereRef.current.material.uniforms.color.value = targetColor;
    }
  });

  // 자전축 사각 각도를 라디안으로 변환 (Z축 기울기 적용)
  const tiltRad = useMemo(() => (obliquity * Math.PI) / 180, [obliquity]);

  // 자기장 0%일 때 표시할 flat 적도 벡터 링 포인트 목록 (XY 평면상 원)
  const equatorPoints = useMemo(() => {
    const points = [];
    const segments = 64;
    const r = 1.25; // 지구 표면 반지름 1.2보다 살짝 넓게 설정
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle)));
    }
    return points;
  }, []);

  // 지자기 자력선 베지에 커브 데이터
  const fieldCurves = useMemo(() => {
    const curves = [];
    const loopsCount = 8;
    const earthRadius = 1.2;

    for (let i = 0; i < loopsCount; i++) {
      const angle = (i / loopsCount) * Math.PI * 2;
      const bulgeX1 = 2.0;
      const bulgeX2 = 3.6;

      const curve1 = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, earthRadius, 0),
        new THREE.Vector3(bulgeX1 * Math.cos(angle), earthRadius * 1.4, bulgeX1 * Math.sin(angle)),
        new THREE.Vector3(bulgeX1 * Math.cos(angle), -earthRadius * 1.4, bulgeX1 * Math.sin(angle)),
        new THREE.Vector3(0, -earthRadius, 0)
      );

      const curve2 = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, earthRadius, 0),
        new THREE.Vector3(bulgeX2 * Math.cos(angle), earthRadius * 1.8, bulgeX2 * Math.sin(angle)),
        new THREE.Vector3(bulgeX2 * Math.cos(angle), -earthRadius * 1.8, bulgeX2 * Math.sin(angle)),
        new THREE.Vector3(0, -earthRadius, 0)
      );

      curves.push({
        points1: curve1.getPoints(40),
        points2: curve2.getPoints(45)
      });
    }
    return curves;
  }, []);

  // 자기장 세기에 따라 선 투명도 및 활성화 여부 조절
  const { lineOpacity, lineColor, showShield } = useMemo(() => {
    const active = magneticField > 0;
    const ratio = magneticField / 100;
    const opacity = ratio * 0.75;
    const color = new THREE.Color().lerpColors(
      new THREE.Color('#10b981'), // 녹색
      new THREE.Color('#00f2fe'), // 사이언
      ratio
    );

    return { lineOpacity: opacity, lineColor: color, showShield: active };
  }, [magneticField]);

  return (
    <group>
      {/* 지구 기준 항상 오른쪽(우측)에서 비추는 강한 태양 광원 */}
      <directionalLight
        position={[10, 0, 0]}
        intensity={3.5}
      />
      {/* 자전축 사각에 맞추어 그룹 회전 */}
      <group rotation={[0, 0, tiltRad]}>
      
      {/* 1. 자전축을 뚫는 얇은 흰색 점선 인디케이터 */}
      <group>
        <Line
          points={[new THREE.Vector3(0, -2.6, 0), new THREE.Vector3(0, 2.6, 0)]}
          color="#ffffff"
          lineWidth={1.0}
          dashed
          dashSize={0.15}
          gapSize={0.12}
          opacity={0.65}
          transparent
        />
        <Text
          position={[0, 2.75, 0]}
          color="#ffffff"
          fontSize={0.18}
          anchorX="center"
          anchorY="middle"
        >
          N_AXIS
        </Text>
        <Text
          position={[0, -2.75, 0]}
          color="#ffffff"
          fontSize={0.18}
          anchorX="center"
          anchorY="middle"
        >
          S_AXIS
        </Text>
      </group>

      {/* 2. 지구본 메쉬 레이어 (Base Earth + Emissive Night Lights) */}
      <mesh ref={earthGlobeRef}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <meshStandardMaterial 
          map={textures.earth}
          emissiveMap={textures.lights}
          emissive={new THREE.Color(magneticField < 20 ? '#ff8844' : '#e2ab3d')} // 자기장 상태에 따라 불빛 톤 조절
          emissiveIntensity={magneticField < 20 ? 1.8 : 1.2}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>

      {/* 3. 구름 메쉬 레이어 (Atmospheric Clouds Layer) */}
      {textures.clouds && (
        <mesh ref={cloudsGlobeRef} scale={[1.015, 1.015, 1.015]}>
          <sphereGeometry args={[1.2, 64, 64]} />
          <meshStandardMaterial 
            alphaMap={textures.clouds}
            transparent={true}
            opacity={0.35}
            color="#ffffff"
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </mesh>
      )}

      {/* 4. 대기 아우라 발광 셰이더 (Ozone Layer) */}
      <mesh ref={atmosphereRef} scale={[1.12, 1.12, 1.12]}>
        <sphereGeometry args={[1.2, 32, 32]} />
        <shaderMaterial
          attach="material"
          args={[atmosphereShader]}
          transparent
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* 5. 자기장 세기 0%일 때의 Apple Warning Red (#FF453A) 적도 벡터 링 */}
      {magneticField === 0 && (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <Line
            points={equatorPoints}
            color="#FF453A"
            lineWidth={2.0}
            transparent
            opacity={0.95}
          />
          <Text
            position={[0, 1.4, 0]}
            color="#FF453A"
            fontSize={0.12}
            anchorX="center"
            anchorY="middle"
          >
            SHIELD_DOWN_DANGER
          </Text>
        </group>
      )}

      {/* 6. 지자기 자기장 벡터 선 (Neon Cyan Curves) */}
      {showShield && (
        <group>
          {fieldCurves.map((curve, idx) => (
            <group key={idx}>
              {/* 내측 1차 자력선 */}
              <Line
                ref={el => (magneticLinesRefs.current[idx * 2] = el)}
                points={curve.points1}
                color={lineColor}
                lineWidth={1.0}
                dashed
                dashSize={0.2}
                gapSize={0.15}
                transparent
                opacity={lineOpacity}
                blending={THREE.AdditiveBlending}
              />
              {/* 외측 2차 자력선 */}
              <Line
                ref={el => (magneticLinesRefs.current[idx * 2 + 1] = el)}
                points={curve.points2}
                color={lineColor}
                lineWidth={0.6}
                dashed
                dashSize={0.25}
                gapSize={0.22}
                transparent
                opacity={lineOpacity * 0.6}
                blending={THREE.AdditiveBlending}
              />
            </group>
          ))}
        </group>
      )}

    </group>
    </group>
  );
}
