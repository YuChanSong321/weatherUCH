# 지구본 텍스처 출처 · 라이선스

이 폴더의 이미지 6장은 **전부 NASA 가 공개한 퍼블릭 도메인 영상**에서 만들었다.
`src/sim/terra-engine.js` 의 지구본(메인 화면 S5·S6, 그리고 `/terra-orbital-sim.html`)이 읽는다.

## 이용 조건

NASA 가 제작한 영상은 저작권으로 보호되지 않으며 별도 허락 없이 사용·재배포할 수
있다(NASA Media Usage Guidelines). 다만 **제작 기관을 밝히는 크레딧 표기를 요구**하므로
아래 표의 크레딧을 그대로 유지한다.

> NASA Media Usage Guidelines — https://www.nasa.gov/nasa-brand-center/images-and-media/

## 파일별 출처

| 파일 | 원본 | 제공 · 크레딧 | 원본 URL |
| --- | --- | --- | --- |
| `day.jpg` | Blue Marble Next Generation (2004년 12월, 지형·수심 포함) | NASA Earth Observatory — Reto Stöckli, NASA Goddard Space Flight Center | `eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg` |
| `bump.jpg` | Blue Marble: Topography (고도 램프) | NASA Earth Observatory — Jesse Allen, GEBCO(British Oceanographic Data Centre) 자료 사용 | `eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png` |
| `water.png` | 위 `bump.jpg` 원본에서 **직접 파생** (해수면 고도 0 을 물로 판정한 마스크) | 파생물 제작: 본 프로젝트 / 원자료: 위와 동일 | — |
| `clouds.png` | Blue Marble: Clouds (구름 합성) | NASA Earth Observatory | `eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg` |
| `night.jpg` | Black Marble 2012 — 야간 도시 불빛 (Suomi NPP / VIIRS) | NASA Earth Observatory — NASA/NOAA | `eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg` |
| `sky.jpg` | Tycho Catalog Skymap v2.0 (약 240만 개 항성) | NASA/Goddard Space Flight Center Scientific Visualization Studio — Tom Bridgman, Ernie Wright / Hipparcos·Tycho-2 성표 | `svs.gsfc.nasa.gov/vis/a000000/a003500/a003572/TychoSkymapII.t5_04096x02048.jpg` |

## 원본에 가한 변형

원본을 그대로 쓰지 않고 아래처럼 가공했다. 전부 형식·크기 변환이며 내용을 지어내지 않았다.

- **공통** — 렌더링 해상도에 맞춰 축소(Lanczos3), JPEG/PNG 재인코딩
- **`bump.jpg`** — 21600×10800 → 4096×2048 축소 후 그레이스케일
- **`water.png`** — 고도맵에서 값 0(해수면)을 흰색, 나머지를 검정으로 이진화한 뒤 해안선을
  0.7px 블러. 스펙큘러 경계의 계단 현상을 없애기 위한 것이다
- **`clouds.png`** — 휘도를 알파 채널로 옮기고(감마 1.35), **위도 70°~86° 구간에서 알파를
  0.22배까지 감쇠**시켰다. 원본이 극관의 얼음·눈을 구름으로 잡아 남극에 불투명한 흰 고리가
  생기고 그 아래 빙상이 통째로 가려지기 때문이다
- **`sky.jpg`** — 톤 커브 `out = in^3.6 × 1.6` 으로 **중간톤(은하수 확산광)을 눌렀다.**
  원본을 그대로 깔면 화면 전체가 회색으로 뿌옇게 덮여 배경이 전경을 밀어낸다. 별의 위치와
  밝기 순서는 그대로이고, 어두운 성운기만 검게 내려앉는다

## 재현 방법

`docs/TEXTURES.md` 에 원본 다운로드부터 가공까지의 스크립트가 있다.
