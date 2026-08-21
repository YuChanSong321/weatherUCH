# 예측의 스케일 (Scales of Prediction)

며칠에서 수만 년까지 시간 규모를 넓혀가며 직접 예측해보는 **인터랙티브 기후 교육 콘텐츠**.
정적 웹사이트이고 서버가 없다.

이 문서는 두 가지만 다룬다 — **실행·배포 방법**과

| | |
| --- | --- |
| 실행 | `npm ci && npm run dev` → http://localhost:5173 |
| 배포 | `npm run build` → `dist/` 를 정적 호스팅에 업로드 |
| 필요 환경 | Node 20.19+ 또는 22.13+, WebGL 2 브라우저 |
| 외부 API | 없음 — 부산 밖 지역을 고를 때만 Open-Meteo (아래 '예외' 참고) |
| 비밀값 | 없음 — 빌드 시크릿도 환경변수도 쓰지 않는다 |

---

## 구동 환경

| 항목 | 요구 사항 |
| --- | --- |
| **Node.js** | **20.19+ 또는 22.13+** (Vite 8 요구). `node -v` 로 확인 |
| 패키지 매니저 | npm (저장소에 `package-lock.json` 동봉) |
| 브라우저 | **WebGL 2** 지원 최신 브라우저. Chrome 정식 지원 |
| 화면 | 데스크톱 **1280×720 이상** 기준 설계. 좁으면 세로로 쌓이며 스크롤된다 |
| 네트워크 | **불필요.** 데이터·텍스처·폰트 전부 번들. 아래 '외부 요청' 참고 |
| OS | 무관 (Windows / macOS / Linux) |

Python 은 **실행에 필요 없다.** `scripts/` 의 수집기는 데이터를 갱신할 때만 쓰며,
그때만 Python 3.10+ 가 필요하다 (표준 라이브러리만 사용, 설치할 패키지 없음).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 정적 빌드 → dist/
npm run preview  # 빌드 결과를 http://localhost:4173 에서 확인
npx tsc --noEmit # 타입 검사
npm run lint     # ESLint
```

엔트리 두 개가 함께 빌드된다.

| 경로 | 내용 |
| --- | --- |
| `/` | **예측의 스케일** (출품 콘텐츠) |
| `/terra-orbital-sim.html` | 궤도 시뮬레이터 (같은 엔진, 전체 HUD 버전) |

## 배포

`npm run build` 결과인 `dist/` 는 **서버 로직이 없는 완전한 정적 사이트**다.
빌드 산출물은 약 8.6 MB 이고, 그중 5.6 MB 가 지구본 텍스처다.

```bash
npm ci          # package-lock.json 그대로 재현 설치
npm run build   # dist/ 생성
```

`dist/` 를 정적 호스팅에 그대로 올리면 끝난다 (Netlify · Vercel · GitHub Pages ·
Cloudflare Pages · S3 + CloudFront · nginx 등). 별도 환경변수도 빌드 시크릿도 없다.

서버 설정에서 두 가지만 맞추면 된다.

- **SPA 폴백을 켜지 말 것** — 라우팅은 URL 해시(`#s0` … `#s7`)로만 하므로 폴백이
  필요 없고, 켜면 `/terra-orbital-sim.html` 이 메인 화면으로 가로채인다.
- **`.jpg` / `.png` 에 캐시 헤더를 넉넉히** — `dist/textures/` 가 전체 용량의 대부분이고
  내용이 바뀌지 않는다.

로컬에서 그대로 확인하려면:

```bash
npm run preview                 # 또는
npx serve dist                  # 또는  python3 -m http.server -d dist 8080
```

| 자원 | 조달 방식 |
| --- | --- |
| 관측·예보·기후 데이터 (부산) | `/data` JSON 6종을 **빌드 시점에 번들**. 런타임 `fetch` 없음 |
| 지구본 텍스처 6장 (5.6 MB) | `public/textures/` 에 **동봉**. NASA 원본 (아래 '저작권 · 출처') |
| 폰트 | **웹폰트 없음.** 시스템 폰트만 이름으로 지정 |
| JS 라이브러리 (three.js 포함) | 전부 `node_modules` 에서 번들. CDN·import map 없음 |

**예외는 한 곳뿐이다 — 사용자가 부산 밖의 지점을 직접 찍었을 때.**
S0 에서 지구본을 클릭해 임의의 좌표를 고르면 그 지역의 자료를
[Open-Meteo](https://open-meteo.com) 에서 실시간으로 가져온다
([lib/openMeteo.ts](src/scale/lib/openMeteo.ts)) — S1 이 채점에 쓰는 **최근 일자료**와
S2~S4 가 쓰는 **40년 기후 시계열** 두 가지다 (자세한 내용은 아래
'선택 지역 자료 — Open-Meteo'). 인증이 없는 무료 API 라 키를 다루지 않고,
실패하면 조용히 부산 번들로 되돌아가므로 **오프라인에서도 콘텐츠는 끝까지 돈다.**
이때는 화면의 출처 표기도 "기상청 · Open-Meteo" 로 자동으로 바뀐다 — 실제로 쓴 출처와
화면에 적힌 출처가 어긋나면 그 자체가 허위 표기이기 때문이다.

API 키는 코드·커밋·예시파일 어디에도 두지 않는다. 수집 스크립트만 환경변수로 받는다
(`.gitignore` 에 `.env`, `scripts/.env`, `scripts/raw/` 등록).

데이터 접근은 [src/scale/data/loader.ts](src/scale/data/loader.ts) 한 곳으로만 들어온다.
화면은 `meta.source` 를 읽어 현재 표시 중인 값이 합성 데이터인지 실측인지 정직하게 표시한다.

---

---

## 저작권 · 출처

이 프로젝트가 쓰는 **모든 외부 리소스의 출처와 라이선스**를 여기 모아둔다 —
데이터 · 오픈소스 라이브러리 · 폰트 · 이미지 · 지구본 텍스처. 앱 안에서는 상단 자의
**ⓘ 자료 출처** 버튼이 같은 내용을 상시 노출한다
([Attribution.tsx](src/scale/components/Attribution.tsx)).

**요약**

| 구분 | 출처 | 이용 조건 |
| --- | --- | --- |
| 관측·예보·계절관측 데이터 5종 | 기상청 (API허브) | 공공누리 제1유형 (출처표시) |
| SSP 시나리오 1종 | 본 프로젝트가 계산한 근사 곡선 | 해당 없음 (제3자 저작물 아님) |
| 선택 지역 일자료 · 40년 기후 시계열 (부산 밖을 찍었을 때만, 실행 중 호출) | Open-Meteo (아카이브는 ERA5 재분석) | CC BY 4.0 (비상업 이용 무료) |
| 지구본 텍스처 6장 | NASA (Earth Observatory · Goddard SVS) | 퍼블릭 도메인 (크레딧 표기) |
| 폰트 | 시스템 폰트만 사용 — 배포하는 폰트 파일 없음 | 해당 없음 |
| 이미지·아이콘 | 전부 직접 제작 (favicon, 인라인 SVG 차트) | 본 프로젝트 |
| 오픈소스 라이브러리 161개 | npm | MIT 123 · Apache-2.0 14 · ISC 10 외. **GPL 계열 0** |

### 데이터 출처

**6종 중 5종이 기상청 실측이다.** 남은 하나(SSP 시나리오)만 공표값을 확보하지 못해
근사 곡선이고, 앱이 그 항목에만 "근사" 배지를 띄운다. 표시값은 각 JSON 의 `meta` 에서
읽으므로 파일을 교체하면 화면이 자동으로 따라간다 — 배지를 코드로 지우지 말 것.
아래 표는 **부산** 기준이다. 사용자가 부산 밖을 고르면 그 지역 자료는 Open-Meteo 에서
오고, 조건도 달라진다 (→ '선택 지역 자료 — Open-Meteo').

| 데이터 | 출처 기관 · 데이터명 | 수집일 | 이용 조건 | 상태 |
| --- | --- | --- | --- | --- |
| `busan_daily.json` | 기상청 · 종관기상관측(ASOS) 일자료 2019–2023 | 2026-08-07 | 공공누리 제1유형 (출처표시) | **실측** |
| `busan_monthly.json` | 기상청 · ASOS 일자료 집계 · 월 평년값 1991–2020 | 2026-08-07 | 〃 | **실측** |
| `busan_yearly.json` | 기상청 · ASOS 일자료 집계 · 연평균기온 1985–2023 | 2026-08-07 | 〃 | **실측** |
| `busan_past_forecast.json` | 기상청 · 단기예보 과거자료(fct_afs_dl) | 2026-08-07 | 〃 | **실측** |
| `busan_blossom.json` | 기상청 · 계절관측(생물계절) · 왕벚나무 개화 1985–2024 | 2026-08-11 | 〃 | **실측** |
| `future_ssp.json` | — (공표 시나리오가 아니다. 아래 설명) | — | 해당 없음 | 근사 곡선 |

**전 지구 비교 지표** — 지역 관측이 그 동네 사정인지 지구 전체의 일인지 가리기 위해
따로 번들한 자료다 (`data/global_indicators.json`). 기상청 자료가 아니므로 공공누리가
아니라 각 기관의 조건을 따른다.

| 지표 | 출처 기관 · 데이터명 | 기간 | 이용 조건 |
| --- | --- | --- | --- |
| 전 지구 평균기온 편차 | NASA GISS · GISTEMP v4 Land-Ocean Temperature Index | 1880–2025 | 퍼블릭 도메인 (NASA) · 출처 표기 |
| 전 지구 평균 CO₂ 농도 | NOAA GML · Globally averaged marine surface annual mean | 1979–2025 | 퍼블릭 도메인 (미국 정부 저작물) · 출처 표기 |
| 북극 9월 해빙 면적 | NSIDC / NOAA · Sea Ice Index v4 | 1979–2025 | 퍼블릭 도메인 (미국 정부 저작물) · 출처 표기 |

- GISTEMP — https://data.giss.nasa.gov/gistemp/
- NOAA 전 지구 CO₂ — https://gml.noaa.gov/ccgg/trends/gl_data.html
- NSIDC Sea Ice Index — https://nsidc.org/data/g02135

**이용 조건의 근거.** 기상청 저작권 정책은 "기상청이 저작재산권 전부를 보유한 자료는
공공누리 제1유형으로 개방한다"고 밝히고 있고, 공공데이터포털의 해당 데이터셋 상세
화면에도 이용허락범위가 `공공저작물 : 출처표시 (제1유형)` 으로 표기되어 있다.
**출처를 밝히면 상업적 이용과 변형까지 자유롭다.** 이 문서와 앱 화면의 ⓘ 자료 출처
패널이 그 출처표시에 해당한다.

| 확인처 | URL |
| --- | --- |
| 기상청 저작권 정책 | https://www.kma.go.kr/kma/guide/copyright.jsp |
| 공공누리 제1유형 조건 | https://www.kogl.or.kr/info/license.do |
| 기상청_지상(종관, ASOS) 조회서비스 | https://www.data.go.kr/data/15057210/openapi.do |
| 기상청_계절관측 조회서비스 | https://www.data.go.kr/data/15139437/openapi.do |
| 기상청 API허브 (실제 수집 경로) | https://apihub.kma.go.kr |

**`future_ssp.json` 은 외부에서 받아온 자료가 아니다.** IPCC AR6 의 시나리오별 상승폭을
목표값으로 두고 [scripts/common.py](scripts/common.py) 의 `ssp_scenarios()` 가 계산한 곡선이므로
제3자 저작물이 아니고 이용 조건도 붙지 않는다. 다만 **공표된 시나리오가 아니라는 사실이
더 중요하다** — 앱이 이 항목에만 "근사" 배지와 경고 문단을 띄우고, `meta._source` 에도
`approximation (not a published scenario)` 로 남긴다. 기상청 기후변화정보포털(CCIC)의
공표값을 확보하면 그대로 교체된다 (수집·갱신 절차는 `DESIGN.md`).

부산 지점 **159** (기후 특성으로 대조 확인: 한겨울 새벽 7.3℃ vs 서울 2.6℃ · 강릉 1.1℃).

수집 절차와 공백 현황은 [docs/DATA_AVAILABILITY.md](docs/DATA_AVAILABILITY.md).

### 선택 지역 자료 — Open-Meteo

위 6종은 **부산** 기준이고 전부 번들이다. 사용자가 S0 지구본에서 **부산 밖의 좌표**를
찍으면 그 지역 자료가 필요해지는데, 그것만은 번들할 수 없어 실행 중에
[Open-Meteo](https://open-meteo.com) 를 호출한다. 브라우저가 외부를 부르는 통로는
[lib/openMeteo.ts](src/scale/lib/openMeteo.ts) **한 파일뿐**이다.

| 쓰이는 곳 | 엔드포인트 | 받아오는 것 |
| --- | --- | --- |
| S1 예측 퀴즈의 채점 | `api.open-meteo.com/v1/forecast` | 지난 2주치 일자료 — 기온(최고·최저·평균)·강수·습도·기압·풍향·풍속·운량. 채점하려면 정답이 이미 관측된 값이어야 하므로 예보 구간은 쓰지 않는다 |
| S2 시간 압축 · S3 추세선 · S4 빈 해 예측 | `archive-api.open-meteo.com/v1/archive` | 1985년~작년 일평균기온, 그것을 집계한 연평균 |

**아카이브는 관측소 실측이 아니라 ERA5 재분석 격자값이다.** 부산 번들(기상청 ASOS
관측소 실측)과 성격이 다르므로 앱의 ⓘ 자료 출처 패널이 둘을 구분해 표시하고, 실제로
매칭된 격자 좌표까지 함께 보여준다 ([Attribution.tsx](src/scale/components/Attribution.tsx)).

| 항목 | 내용 |
| --- | --- |
| 이용 조건 | **CC BY 4.0** — 출처를 표기하면 사용·변형 가능. 비상업적 이용은 무료 |
| 근거 | https://open-meteo.com/en/license |
| 출처표시 이행 | 앱 상단 **ⓘ 자료 출처: 기상청 · Open-Meteo** 패널 + 이 문서 |
| 근원 자료 | 아카이브는 ECMWF/Copernicus 의 ERA5 재분석을 Open-Meteo 가 재배포하는 것 |
| 인증 | **없음.** API 키를 발급받지 않는 무료 엔드포인트라 키 취급 규정과 무관하다 |
| 실패 시 | 부산 번들로 조용히 폴백. 결측일은 버리고, 쓸 수 있는 날이 모자라면 폴백 |

데이터를 그냥 받아 쓰지 않고 두 가지를 맞춘다 — Open-Meteo 운량은 0~100% 인데 화면과
해설이 전부 기상청 기준(0~10 할)이라 변환해 넣고, 연평균은 **관측일 300일 미만인 해를
버린다**. 반쪽짜리 해가 섞이면 S3 의 추세선이 조용히 거짓말을 하기 때문이다.

### 라이브러리 라이선스

의존성 트리 **161개를 전수 조사했다. GPL·AGPL·LGPL·SSPL 계열은 하나도 없다.**
라이선스 필드가 비어 있는 패키지도 없다.

분포: MIT 123 · Apache-2.0 14 · ISC 10 · BSD-2-Clause 6 · MPL-2.0 3 ·
BSD-3-Clause 2 · CC-BY-4.0 1 · BlueOak-1.0.0 1 · 0BSD 1

브라우저로 실제 배포되는 것은 아래 다섯 개뿐이다.

| 패키지 | 버전 | 라이선스 | 쓰임 |
| --- | --- | --- | --- |
| react / react-dom | 19.2.7 | MIT | UI |
| three | 0.184.0 | MIT | 지구본·궤도 3D 렌더링 |
| framer-motion | 13.0.0 | MIT | 단계 전환 애니메이션 |

빌드에만 쓰이고 배포본에 들어가지 않는 것들.

| 패키지 | 버전 | 라이선스 |
| --- | --- | --- |
| vite | 8.0.16 | MIT |
| @vitejs/plugin-react | 6.0.2 | MIT |
| tailwindcss / @tailwindcss/vite | 4.3.1 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| eslint (+플러그인) | 10.5.0 | MIT |
| postcss / autoprefixer | 8.5.15 / 10.5.0 | MIT |

**추가 확인이 필요했던 2건 — 둘 다 빌드 전용이고 `dist/assets/*.js` 에 없다.**

| 패키지 | 라이선스 | 판단 |
| --- | --- | --- |
| `lightningcss` 외 2 | MPL-2.0 | 파일 단위 카피레프트. Tailwind v4 의 CSS 변환기로 **빌드 시에만** 쓰고 소스를 수정·재배포하지 않으므로 공개 의무가 발생하지 않는다. |
| `caniuse-lite` | CC-BY-4.0 | browserslist 의 브라우저 지원 데이터. 데이터 자체를 재배포하지 않으므로 표시 의무가 없다. |

> 이전 버전에는 `@react-three/fiber` · `@react-three/drei` · `lucide-react` · `d3` 가
> 들어 있었다. drei 의 `<Text>` 가 런타임에 외부 CDN 에서 폰트 데이터를 받고, 전이
> 의존성 `webgl-constants` 에는 라이선스 필드가 없었다. 그 셋을 쓰던 `legacy.html` 을
> 출품에서 빼면서 함께 제거했고, `d3` 는 애초에 어디서도 import 하지 않고 있었다.
> 의존성이 208개에서 127개로 줄었다.

### 폰트

**웹폰트를 하나도 내려받지 않는다.** `@font-face` 도 Google Fonts 링크도 없고, 런타임에
폰트를 가져오는 라이브러리도 없다. 시스템에 이미 있는 폰트만 이름으로 지정한다 —
**폰트 파일을 배포하지 않으므로 폰트 라이선스 의무가 발생하지 않는다.**

```
system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo",
"Malgun Gothic", "Noto Sans KR", sans-serif
```

확인 방법: `grep -r "font-face\|fonts.googleapis\|fonts.gstatic\|\.woff" src/ index.html`
그리고 빌드 후 `grep -rE "https?://" dist/` — 폰트 호스트가 나오지 않아야 한다.

### 이미지 · 아이콘

| 파일 | 출처 | 라이선스 |
| --- | --- | --- |
| `public/favicon.svg` | **직접 제작** — U자 곡선(콘텐츠의 핵심 메시지) + 3막 액센트 색 | 본 프로젝트 |
| 차트 · 다이어그램 전부 | 코드가 그리는 인라인 SVG (외부 차트 라이브러리 없음) | 본 프로젝트 |
| 지구본 텍스처 6장 | NASA (아래 항목) | 퍼블릭 도메인 |

저장소에 들어 있는 래스터·벡터 자산은 `public/favicon.svg` 와 `public/textures/` 뿐이다.
확인: `find . -path ./node_modules -prune -o -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.svg' \) -print`

**제거한 것** — 초기 스캐폴드에 딸려 온 타사 브랜드 마크. 전부 미사용이었고
표절·저작권 검증에서 불필요한 위험이라 삭제했다.

| 제거 파일 | 내용 |
| --- | --- |
| `public/icons.svg` | Bluesky · Discord · GitHub · X 로고 심볼 6종 |
| `public/favicon.svg` (구) | 출처 불명의 보라색 마크 → 직접 제작본으로 교체 |
| `src/assets/hero.png` | 출처 불명 343×361 PNG |
| `src/assets/vite.svg`, `react.svg` | Vite · React 로고 |

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


### 외부 코드 복붙 점검

코드베이스에서 외부 저작권 표기·라이선스 헤더가 박힌 블록은 **발견되지 않았다.**
표절 검증에서 질문이 나올 수 있는 지점은 하나다.

- [terra-engine.js](src/sim/terra-engine.js) 의 절차적 노이즈가 GLSL 관용구
  `fract(sin(x) * 43758.5453)` 을 쓴다. 특정 저작물이 아니라 셰이더 분야의 공용
  관용구지만, 유사도 검사에서 걸릴 수 있으므로 출처를 물으면 이 문단을 근거로 답할 것.
- 이 파일은 원래 이 프로젝트의 standalone 시뮬레이터(`terra-orbital-sim.html`)에
  있던 코드를 모듈로 옮긴 것이다. 영문 주석이 많은 이유가 그것이며, 외부에서
  가져온 것이 아니다.

### 위 내용을 직접 검증하는 법

```bash
# 1) 비밀값이 저장소에 없는가 — .env 는 추적되지 않고 히스토리에도 없다
git ls-files | grep -c '\.env'                      # 0
git log --all --pretty=format: --name-only | sort -u | grep -c '\.env'   # 0
grep -rn "import.meta.env\|process.env" src/        # 결과 없음 (번들에 주입 경로 없음)

# 2) 빌드 결과가 실제로 부르는 외부 주소가 무엇인가
npm run build && grep -rhoE 'https?://[^"'"'"'` )<>,\]+' dist/ | sort -u
#   → Open-Meteo 2개(사용자가 부산 밖을 찍었을 때만) 외에는
#     w3.org XML 네임스페이스와 주석 속 문서 링크뿐이다

# 3) 배포되는 이미지 자산 전체
find . -path ./node_modules -prune -o -path ./dist -prune -o -type f \
     \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.svg' \) -print

# 4) 의존성 라이선스에 GPL 계열이 있는가
npx license-checker --summary 2>/dev/null || \
  grep -rh '"license"' node_modules/*/package.json | sort | uniq -c | sort -rn
```

---
