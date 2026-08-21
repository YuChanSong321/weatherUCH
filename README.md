# 예측의 스케일 (Scales of Prediction)

부산을 무대로, 사용자가 직접 예측해보며 시간 규모를 **며칠 → 수십 년 → 수만 년**으로
넓혀가는 인터랙티브 교육 콘텐츠. "날씨는 왜 못 맞히고 기후는 왜 맞히는지"를 설명으로
듣는 대신 스스로 발견하게 만드는 것이 목표다.

**핵심 메시지 — 예측 가능성은 시간 규모에 따라 U자를 그린다.**

| 시간 규모 | 예측 가능성 | 이유 |
| --- | --- | --- |
| 시간·일 | 높음 | 지속성 — 내일의 대기는 오늘과 닮아 있다 |
| 2주 ~ 몇 달 | 바닥 | 혼돈 — 작은 오차가 며칠마다 두 배로 자란다 |
| 수십 ~ 수백 년 | 회복 | 평균·통계 + 온실가스 강제력 |
| 수만 년 | 최고 | 천체역학 = 시계 |

사용자 권한이 단계마다 올라간다: **예측한다(관찰자) → 조작한다(분석가) → 창조한다(조종자).**

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

**오프라인 발표를 위한 확인** — 랜선을 뽑고 `npm run preview` 를 열어도 지구본이
사진 화질 그대로 떠야 한다. 흐릿한 절차적 지구가 뜨면 `public/textures/` 가 빠진 것이다
(`node scripts/build_textures.mjs` 로 다시 만든다).

발표용 딥링크: 주소 끝에 `#s4` 처럼 붙이면 그 단계에서 바로 시작한다 (`#s0` ~ `#s7`).

`/` 의 S6와 `/terra-orbital-sim.html` 은 **같은 렌더링 엔진**([src/sim/terra-engine.js](src/sim/terra-engine.js))을
쓴다. 궤도·지구·조명 코드는 한 곳에만 있고, 두 화면은 각자의 UI만 얹는다.


---

## 외부 요청 — 기본 0건, 사용자가 열었을 때만 1곳

발표 현장의 네트워크에 의존하지 않는 것이 설계 조건이다. **기본 경로에서 브라우저가
외부로 나가는 요청은 하나도 없다.**

| 자원 | 조달 방식 |
| --- | --- |
| 관측·예보·기후 데이터 | `/data` JSON 6종을 **빌드 시점에 번들**. 런타임 `fetch` 없음 |
| 지구본 텍스처 6장 (5.6 MB) | `public/textures/` 에 **동봉**. NASA 원본 (아래 '저작권 · 출처') |
| 폰트 | **웹폰트 없음.** 시스템 폰트만 이름으로 지정 |
| JS 라이브러리 (three.js 포함) | 전부 `node_modules` 에서 번들. CDN·import map 없음 |

**예외는 한 곳뿐이다 — 사용자가 부산 밖의 지점을 직접 찍었을 때.**
S0 에서 지구본을 클릭해 임의의 좌표를 고르면 그 지역의 관측만
[Open-Meteo](https://open-meteo.com) 를 실시간으로 호출해 가져온다
([lib/openMeteo.ts](src/scale/lib/openMeteo.ts)). 인증이 없는 무료 API 라 키를 다루지 않고,
실패하면 조용히 부산 번들로 되돌아가므로 **오프라인에서도 콘텐츠는 끝까지 돈다.**
이때는 화면의 출처 표기도 "기상청 · Open-Meteo" 로 자동으로 바뀐다 — 실제로 쓴 출처와
화면에 적힌 출처가 어긋나면 그 자체가 허위 표기이기 때문이다.

API 키는 코드·커밋·예시파일 어디에도 두지 않는다. 수집 스크립트만 환경변수로 받는다
(`.gitignore` 에 `.env`, `scripts/.env`, `scripts/raw/` 등록).

데이터 접근은 [src/scale/data/loader.ts](src/scale/data/loader.ts) 한 곳으로만 들어온다.
화면은 `meta.source` 를 읽어 현재 표시 중인 값이 합성 데이터인지 실측인지 정직하게 표시한다.

---

## 화면 흐름 (S0 → S7)

| 단계 | 내용 | 가르치는 것 |
| --- | --- | --- |
| **S0** | 도전장 — "당신은 며칠 앞을 맞힐 수 있을까?" | 설명 없이 10초 안에 첫 조작 |
| **S1** | 날씨 맞히기 3라운드 (기온 슬라이더 50 + 강수 4지선다 30 + 보너스 20) — 당신 vs 기상청 vs 실제 | 지속성 / 기압·습도 → 비 / 운량 → 일교차 / 북풍 → 기온 하강 / **전문가도 틀린다** |
| **S2** | 일별 점 365개 → 월평균 → 연평균 압축 | "이게 날씨입니다 → 이것이 기후입니다" |
| **S3** | 40년 연평균 점 누적 + 추세선 | 개별 연도는 튀지만 방향은 남는다 |
| **S4** | 빈 해 예측 (랜덤, 100점) | 평균은 예측 가능하다 |
| **S5** | 곡선을 2100년까지 끌기 → SSP 부채꼴 + 시나리오 해설표 | 미래는 갈라지는 부채 — 인간의 선택 |
| **S6** | 밀란코비치 미션 (시간제한, 120점) — 기존 궤도 시뮬레이터 위에서 | 천체역학은 시계다 |
| **S7** | 처음의 질문 회수 + U자 곡선 + 학습 카드 3장 | 예측 가능성의 U자 |

만점 500점 (S1 280 + S4 100 + S6 120).

### 여정을 하나로 묶는 장치

- S1에서 출제된 해가 S2의 압축 대상, S3의 하이라이트 연도로 그대로 이어진다.
- S1 R1 일교차 해설이 "1년의 기온 폭은 무엇이 정하는가"라는 복선을 심고,
  S6 자전축 기울기 슬라이더가 **부산 위도의 연교차 진폭**으로 그것을 회수한다.
- S4는 사용자의 S1 평균 오차와 40년 규모 오차를 나란히 놓는다.
- S7의 U자 곡선에는 사용자가 실제로 서 봤던 세 지점이 자기 점수와 함께 찍힌다.

---

## 데이터

`/data` 의 JSON 6종. **5종은 기상청 API허브 실측**이고, SSP 시나리오 1종만 공표값을
확보하지 못해 근사 곡선이다 (앱이 그 항목에만 '근사' 배지를 띄운다).

| 파일 | 내용 | 쓰임 |
| --- | --- | --- |
| `busan_daily.json` | 일별 기온·강수·습도·기압·풍향/풍속·운량 (2019–2023) | S1 출제 풀, S2 압축 |
| `busan_monthly.json` | 월별 평년값 (1991–2020) | S2 계절 곡선 |
| `busan_yearly.json` | 연평균 기온 (1985–2023) | S3 점 누적, S4 빈 해 |
| `future_ssp.json` | SSP1-2.6 / 2-4.5 / 5-8.5 경상권 전망 (근사) | S5 부채꼴 |
| `busan_past_forecast.json` | 기상청이 전날 냈던 다음날 예보 + 기상특보 | S1 3자 대결, R3 배지 |
| `busan_blossom.json` | 연도별 벚꽃 개화일 (day-of-year) | S3 보조 레이어 |

`busan_past_forecast.json` 은 날짜별로 구멍이 나도 된다. 예보가 없는 날은 로더가
`undefined` 를 돌려주고 화면은 조용히 2자 대결로 돌아간다 — 출제가 막히지 않는다.

### 합성 데이터를 그냥 랜덤으로 만들지 않은 이유

지금 `/data` 는 전부 기상청 실측이라 아래 생성기는 쓰이지 않는다. 그래도 남겨 둔 이유는
**스키마와 검증 리포트가 실데이터에도 그대로 돌기 때문이다** — 수집기를 고칠 때 이쪽으로
먼저 회귀 검사를 한다.

S1의 채점 해설이 데이터와 어긋나면 교육 효과가 무너진다. 그래서 생성기는 종관 위상
모델(고기압 → 저기압 접근 → 전선 통과 → 전선 후면)을 돌려 **콘텐츠가 가르칠 관계를
데이터에 실제로 심고**, 실행할 때마다 그것이 성립하는지 검증 리포트를 출력한다.

```bash
python3 scripts/make_dummy_data.py
#   지속성 예보 MAE(최고기온)  : 1.73 °C
#   강수 신호일 다음날 비 확률 : 54 %  (전체 26 %)
#   일교차 맑은날 / 흐린날     : 9.7 / 4.3 °C
#   기온변화 북풍 / 남풍       : -0.66 / +0.61 °C
#   연평균 상승 추세           : +0.39 °C / 10년
```

### 데이터 갱신 (교체·재수집)

기상청 API허브는 **로그인 없이 자료를 주지 않는다** — 데이터 엔드포인트는 키 없이
호출하면 전부 `401 유효한 인증키가 아닙니다` 이고, 웹 화면의 다운로드도 같은 로그인을
쓴다. 그래서 길이 둘이다. 출력 스키마는 같으므로 데이터셋마다 섞어 써도 된다.

**길 A — API 키로 자동 수집**

```bash
# 프로젝트 루트에 .env 파일: KMA_API_KEY=발급받은키   (.gitignore 등록되어 있음)
python3 scripts/fetch_asos.py --selftest    # 키 없이 파서만 점검
python3 scripts/fetch_asos.py --dry-run     # 호출 없이 URL/키 인식 확인
python3 scripts/fetch_asos.py --years 2019 2023 --normals 1991 2020
python3 scripts/fetch_forecast.py           # 과거 예보 + 기상특보
python3 scripts/fetch_blossom.py            # 계절관측 벚꽃 개화일
```

**길 B — 웹에서 직접 받아 반입**

apihub 에 로그인해 자료를 받아 `scripts/raw/` 에 정해진 이름으로 넣는다
(`asos_daily.*` `yearly.*` `normals.*` `forecast.*` `warning.*` `blossom.*` `ssp.*`).
API허브 응답을 그대로 저장해도 되고 포털 CSV 도 된다 — **컬럼 이름으로 값을 찾으므로
열 순서가 달라도 견딘다.** 일부만 넣어도 있는 것만 교체한다.

```bash
python3 scripts/ingest_raw.py --dry-run     # 무엇이 바뀔지만 확인
python3 scripts/ingest_raw.py               # 교체
```

**어느 길이든 마지막에**

```bash
python3 scripts/sanity_check.py             # 값이 부산의 실제 기후로서 말이 되는가
```

상식 검증은 범위·최저≤평균≤최고·날짜 연속성·계절 방향·최난월/최한월·date↔doy 정합·
예보 커버리지와 MAE·SSP 대소 순서·출처 메타 완비를 본다. 컬럼 매핑을 잘못 잡으면
(화씨/섭씨, 현지기압/해면기압, 지점번호 오기) 앱은 아무 오류 없이 그럴듯하게 동작하면서
다른 도시의 값을 보여주므로, 이 검증을 건너뛰지 말 것.

각 스크립트 맨 위 주석에 **어떤 API 활용신청 항목이 필요한지** 이름으로 적혀 있다.
키는 환경변수로만 받고 화면에는 길이만 찍으며, 로그·에러의 URL 은 `authKey=***` 로
마스킹된다.

`fetch_forecast.py` 는 응답을 **컬럼 위치가 아니라 컬럼명으로** 읽는다. 문서 개정으로
열 순서가 바뀌어도 견디고, 이름이 사라지면 어느 이름이 없는지 찍고 멈춘다.
자체 점검이 잡아낸 실제 함정 하나: `PRE` 는 강수'량'이 아니라 강수'형태' 코드다
(0 없음 / 1 비 / 2 비·눈 / 3 눈 / 4 소나기). mm 로 읽으면 모든 비 예보가 "약한 비 1mm"가
되어 3자 대결이 조용히 거짓말을 한다.

출력 스키마가 더미와 완전히 동일하므로 `/data` 를 덮어쓰면 앱 코드는 그대로다.
같은 검증 리포트가 실데이터에도 돌아가므로, 컬럼 매핑을 잘못 잡으면 (예: 현지기압/해면기압
혼동, 풍향 단위) 수치가 반대로 나와 바로 잡힌다.

SSP 시나리오는 공개 API가 없다. 기후변화정보포털(CCIC)에서 경상권 전망을 CSV로 내려
`scripts/raw/ssp_gyeongsang.csv` (`scenario,year,tavg[,low,high]`)로 두면 자동으로 읽고,
없으면 근사 곡선으로 폴백하면서 `meta.source` 에 그 사실을 남긴다.

---

## 구조

```
data/                        번들되는 JSON 6종 (런타임 fetch 없음)
public/
  favicon.svg                직접 제작
  textures/                  지구본 텍스처 6장 (NASA, 5.6 MB) + CREDITS.md
scripts/
  common.py                  스키마·집계·검증 + 키/HTTP (더미·수집기 3종 공용)
  make_dummy_data.py         합성 데이터 생성기
  fetch_asos.py              ASOS 관측 → JSON 4종        (--selftest / --dry-run)
  fetch_forecast.py          단기예보 과거자료 + 기상특보 (--selftest / --dry-run)
  fetch_blossom.py           계절관측 벚꽃 개화일         (--selftest / --dry-run)
  ingest_raw.py              직접 받은 파일 → JSON 교체   (--dry-run)
  sanity_check.py            값이 실제 기후로서 말이 되는가
  build_textures.mjs         NASA 원본 → public/textures/ (평소엔 돌릴 일 없음)
src/sim/
  terra-engine.js            궤도 시뮬레이터 엔진 (standalone 과 S6 가 공유)
src/scale/
  App.tsx                    S0→S7 단계 전환
  state/journey.tsx          여정 상태 (점수·단계·딥링크)
  data/loader.ts             데이터 접근 유일 통로
  lib/forecast.ts            S1 출제·채점·해설 규칙 엔진
  lib/milankovitch.ts        일사량 물리 계산 (Berger 표준식)
  lib/scales.ts              스케일·눈금·곡선 경로
  components/                차트 골격, 별밭 배경, 시간 규모 자
  stages/                    S0 … S7 화면
```

차트는 차트 라이브러리 없이 SVG를 직접 그린다. 시리즈 색은 dataviz 팔레트 검증기(어두운 배경,
all-pairs, 색각 이상 분리도)를 통과한 조합만 쓴다 — 값을 바꾸려면 재검증할 것.

### 이중 축은 S3 개화일 레이어 한 곳뿐이다

[ChartFrame](src/scale/components/ChartFrame.tsx) 의 원칙은 "축은 하나"다. 두 축의
눈금 정렬이 임의여서 없는 상관을 만들어내기 때문이다. S3의 벚꽃 레이어만 예외로
두 축을 쓰되, 오해를 만드는 세 지점을 막았다 —
개화일은 **선이 아니라 점**으로만 그리고, 오른쪽 축 범위는 기온선에 맞추지 않고
관측 전체 범위에 고정하며, 축을 뒤집지 않는다(따뜻해질수록 개화일 수치는 내려간다).
축 아래에 "두 축의 눈금은 서로 독립"이라고 적는다. 다른 화면에 이중 축을 늘리지 말 것.

### 물리 계산 검증

S6는 데이터 파일이 아니라 Berger(1978) 표준식으로 일사량을 실시간 계산한다.
현재 지구 값으로 북위 65° 하지 일사량 **478 W/m²** 가 나오며, 이는 문헌값(약 480 W/m²)과
일치한다. 세차각은 기후학 관례(ω+180° = 근일점의 태양황경)를 따른다 — 이 180°를 빼먹으면
"6월에 태양과 가장 가깝다"는 반대 결론이 나온다.

일사량 계산([lib/milankovitch.ts](src/scale/lib/milankovitch.ts))은 렌더링과 완전히 분리된
순수 함수다. 3D 씬은 그 값을 쓰지 않고 자기 궤도 상태에서 따로 계산한다 — 미션 판정은
물리식 쪽만 본다.

### 궤도 시뮬레이터 (src/sim/terra-engine.js)

기존 standalone 시뮬레이터의 렌더링·궤도·기후 코드를 그대로 옮긴 모듈이다. 케플러 해
(`M = E − e·sinE`, Newton-Raphson), 극형식 타원, 0차원 에너지 수지, 주야 경계·도시 불빛·
대기 산란 셰이더가 여기 있다. 옮기면서 더한 것은 두 가지뿐이다.

- **자전축 기울기 · 세차** — 원래는 이심률 하나뿐이었고 기울기는 23.5° 상수였다.
  기존 노드 계층(`earthPivot → tiltGroup → earth`)을 갈아엎지 않고 `precessGroup` 한 겹을
  끼워 넣었다. 씬 각도와 기후학 세차각의 관계는 **ψ = ω + 90°** 로, 유도 과정은 엔진
  상단 주석에 있다. 검산: 현재 지구 ω=102.9° → 근일점이 북반구 한겨울 근처(실제로 1월 초).
- **계절 마커** — 궤도 위 사계절 위치. 세차를 돌리면 하지 고리가 궤도를 미끄러진다.

three.js 는 CDN import map 이 아니라 `node_modules` 에서 번들된다(외부 요청 0건 규칙).
엔진이 패치하는 셰이더 청크 이름(`map_fragment`, `emissivemap_fragment`, `opaque_fragment`,
`lights_phong_pars_fragment`)은 버전에 민감하므로, three 를 올릴 때는 콘솔 경고를 확인할 것.

텍스처는 두 모드다. **standalone 과 S6 모두 `'local'`** 을 쓴다 — `public/textures/` 에
동봉된 NASA 플레이트(Blue Marble · 구름 · 야간 도시불빛 · Tycho 성도)를 읽으므로 외부
요청이 0건이고, 발표 현장 네트워크와 무관하게 같은 화질이 나온다. 파일이 없을 때만
`'procedural'` 로 내려가 fBm 합성 지구를 그리고 HUD 에 폴백 배지가 뜬다 — 그 배지가
보이면 텍스처가 빠진 것이다.

텍스처 출처와 라이선스는 아래 '저작권 · 출처 → 지구본 텍스처'에 있다.

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
| 선택 지역 관측 (사용자가 부산 밖을 찍었을 때만) | Open-Meteo | CC BY 4.0 |
| 지구본 텍스처 6장 | NASA (Earth Observatory · Goddard SVS) | 퍼블릭 도메인 (크레딧 표기) |
| 폰트 | 시스템 폰트만 사용 — 배포하는 폰트 파일 없음 | 해당 없음 |
| 이미지·아이콘 | 전부 직접 제작 (favicon, 인라인 SVG 차트) | 본 프로젝트 |
| 오픈소스 라이브러리 161개 | npm | MIT 123 · Apache-2.0 14 · ISC 10 외. **GPL 계열 0** |

### 데이터 출처

**6종 중 5종이 기상청 실측이다.** 남은 하나(SSP 시나리오)만 공표값을 확보하지 못해
근사 곡선이고, 앱이 그 항목에만 "근사" 배지를 띄운다. 표시값은 각 JSON 의 `meta` 에서
읽으므로 파일을 교체하면 화면이 자동으로 따라간다 — 배지를 코드로 지우지 말 것.

| 데이터 | 출처 기관 · 데이터명 | 수집일 | 이용 조건 | 상태 |
| --- | --- | --- | --- | --- |
| `busan_daily.json` | 기상청 · 종관기상관측(ASOS) 일자료 2019–2023 | 2026-08-07 | 공공누리 제1유형 (출처표시) | **실측** |
| `busan_monthly.json` | 기상청 · ASOS 일자료 집계 · 월 평년값 1991–2020 | 2026-08-07 | 〃 | **실측** |
| `busan_yearly.json` | 기상청 · ASOS 일자료 집계 · 연평균기온 1985–2023 | 2026-08-07 | 〃 | **실측** |
| `busan_past_forecast.json` | 기상청 · 단기예보 과거자료(fct_afs_dl) | 2026-08-07 | 〃 | **실측** |
| `busan_blossom.json` | 기상청 · 계절관측(생물계절) · 왕벚나무 개화 1985–2024 | 2026-08-11 | 〃 | **실측** |
| `future_ssp.json` | — (공표 시나리오가 아니다. 아래 설명) | — | 해당 없음 | 근사 곡선 |

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
공표값을 확보하면 그대로 교체된다 (아래 '실데이터로 교체' 참고).

부산 지점 **159** (기후 특성으로 대조 확인: 한겨울 새벽 7.3℃ vs 서울 2.6℃ · 강릉 1.1℃).

수집 절차와 공백 현황은 [docs/DATA_AVAILABILITY.md](docs/DATA_AVAILABILITY.md).

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

### 지구본 텍스처 — NASA 퍼블릭 도메인

지구본 텍스처 6장(**5.6 MB**)은 `public/textures/` 에 **동봉되어 있다.** 실행 중에
외부에서 내려받지 않는다. 전부 **NASA 가 공개한 퍼블릭 도메인 영상**에서 만들었다.

| 파일 | 원본 | 크레딧 |
| --- | --- | --- |
| `day.jpg` | Blue Marble Next Generation (2004-12, 지형·수심) | NASA Earth Observatory — Reto Stöckli |
| `bump.jpg` | Blue Marble: Topography (고도 램프) | NASA Earth Observatory — Jesse Allen / GEBCO 자료 |
| `water.png` | 위 고도맵에서 **직접 파생**한 해수면 마스크 | 파생물: 본 프로젝트 / 원자료: 위와 동일 |
| `clouds.png` | Blue Marble: Clouds | NASA Earth Observatory |
| `night.jpg` | Black Marble 2012 (Suomi NPP / VIIRS 야간 도시 불빛) | NASA Earth Observatory — NASA/NOAA |
| `sky.jpg` | Tycho Catalog Skymap v2.0 (약 240만 개 항성, 성운기 억제) | NASA/Goddard SVS — Tom Bridgman, Ernie Wright |

NASA 가 제작한 영상은 저작권으로 보호되지 않아 별도 허락 없이 사용·재배포할 수 있고,
**제작 기관을 밝히는 크레딧 표기만 요구된다**(NASA Media Usage Guidelines —
https://www.nasa.gov/nasa-brand-center/images-and-media/). 위 표와 앱 화면의 ⓘ 자료 출처
패널이 그 크레딧에 해당한다.

원본 URL과 가공 내역(축소·이진화·알파 변환 등)은
[public/textures/CREDITS.md](public/textures/CREDITS.md) 에 파일 단위로 적혀 있고,
[scripts/build_textures.mjs](scripts/build_textures.mjs) 를 돌리면 원본 다운로드부터
그대로 재현된다 (`npm i sharp` 필요).

> **이전에는 원격에서 받아 썼다.** `raw.githubusercontent.com/turban/webgl-earth` 와
> `unpkg.com/three-globe/example` 에서 런타임에 9 MB 를 내려받는 구조였다. 그만둔 이유가
> 둘이다 — (1) **`turban/webgl-earth` 에는 LICENSE 파일이 없다.** 명시적 허락이 없는
> 재사용이라 "외부 리소스 출처·라이선스 표기" 요건을 만족시킬 수 없었다. (2) 현장에서
> 네트워크가 흔들리면 흐릿한 절차적 지구로 떨어졌다. NASA 원본을 직접 받아 넣으면
> 출처가 1차 제공처로 확정되고 오프라인 문제도 같이 해결된다.

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

## 톤 가이드

- **화면에 뜨는 문구는 합니다체**로 쓴다. 교육 콘텐츠라 읽는 사람에게 말을 거는 쪽이 맞다.
  단정형("~한다")은 딱딱해서 설명을 밀어내는 느낌을 준다.
  - 서술 → `~합니다 / ~해요` · 지시 → `~해보세요` · 질문 → `~할까요?`
  - 다만 **코드 주석과 이 README 는 한다체 그대로** 둔다. 읽는 사람이 다르다.
  - 라벨·버튼·제목처럼 문장이 아닌 것은 명사형 그대로 (`다음 라운드`, `미션 성공`).
- 종말 공포 금지. 호기심과 도전으로 이끈다.
- 틀림은 감점이 아니라 **발견**. 채점 문구는 "틀렸다"가 아니라 "무엇이 어긋났고 왜 그랬는지"를
  실제 관측 숫자로 말한다.
- S0 의 첫 질문과 S7 의 회수 문장은 **글자까지 같아야 한다** — 한쪽만 고치면 여정의 수미상관이
  깨진다.
