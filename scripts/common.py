#!/usr/bin/env python3
"""더미 생성기와 실데이터 수집기가 공유하는 부분.

- /data JSON 4종의 스키마와 파일명
- 일별 -> 월별/연별 집계
- "콘텐츠가 가르치려는 규칙"이 데이터에 실제로 들어있는지 검증
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = ROOT / "scripts" / "raw"

REQUEST_PAUSE = 0.4  # 초 — 호출 간 간격 (쿼터 보호)
MAX_RETRY = 3

SCHEMA_VERSION = 1
STATION = {"name": "부산", "stnId": 159, "lat": 35.1047, "lon": 129.0320}

DAILY_UNITS = {
    "tavg": "°C",
    "tmax": "°C",
    "tmin": "°C",
    "precip": "mm",
    "humidity": "%",
    "pressure": "hPa (해면기압)",
    "windDeg": "deg",
    "windSpeed": "m/s",
    "cloud": "0-10",
}

WIND_LABELS = [
    (0, "북"), (45, "북동"), (90, "동"), (135, "남동"),
    (180, "남"), (225, "남서"), (270, "서"), (315, "북서"),
]


def wind_dir_label(deg: float) -> str:
    """8방위 한글 이름."""
    return min(WIND_LABELS, key=lambda d: min(abs(deg - d[0]), 360 - abs(deg - d[0])))[1]


def wind_family(deg: float) -> str:
    """북·동·남·서 계열 — S1 풍향 보너스 판정에 쓰인다."""
    d = deg % 360
    if d >= 315 or d < 45:
        return "N"
    if d < 135:
        return "E"
    if d < 225:
        return "S"
    return "W"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"  {path.relative_to(ROOT)}  ({path.stat().st_size / 1024:,.0f} KB)")


def monthly_from_daily(daily: list[dict]) -> list[dict]:
    """월평균 시계열 (S2 압축 애니메이션이 쓰는 값)."""
    acc: dict[str, dict] = {}
    for r in daily:
        a = acc.setdefault(r["date"][:7], {"tavg": 0.0, "precip": 0.0, "n": 0})
        a["tavg"] += r["tavg"]
        a["precip"] += r["precip"]
        a["n"] += 1
    return [
        {"month": k, "tavg": round(v["tavg"] / v["n"], 2), "precip": round(v["precip"], 1)}
        for k, v in sorted(acc.items())
    ]


def yearly_from_daily(daily: list[dict]) -> dict[int, dict]:
    """연평균 (일별 자료가 있는 해에 대해)."""
    acc: dict[int, dict] = {}
    for r in daily:
        y = int(r["date"][:4])
        a = acc.setdefault(y, {"tavg": 0.0, "tmax": 0.0, "tmin": 0.0, "precip": 0.0, "n": 0})
        a["tavg"] += r["tavg"]
        a["tmax"] += r["tmax"]
        a["tmin"] += r["tmin"]
        a["precip"] += r["precip"]
        a["n"] += 1
    out = {}
    for y, a in acc.items():
        n = a["n"]
        out[y] = {
            "tavg": round(a["tavg"] / n, 2),
            "tmaxMean": round(a["tmax"] / n, 2),
            "tminMean": round(a["tmin"] / n, 2),
            "precip": round(a["precip"], 1),
        }
    return out


def normals_from_daily(daily: list[dict]) -> list[dict]:
    """월별 평년값 (일별 자료 전체 기간의 월별 평균)."""
    acc: dict[int, dict] = {}
    for r in daily:
        m = int(r["date"][5:7])
        a = acc.setdefault(m, {"tavg": 0.0, "tmax": 0.0, "tmin": 0.0, "hum": 0.0, "n": 0, "precip": {}})
        a["tavg"] += r["tavg"]
        a["tmax"] += r["tmax"]
        a["tmin"] += r["tmin"]
        a["hum"] += r["humidity"]
        a["n"] += 1
        year = r["date"][:4]
        a["precip"][year] = a["precip"].get(year, 0.0) + r["precip"]

    out = []
    for m in range(1, 13):
        a = acc.get(m)
        if not a:
            continue
        n = a["n"]
        tmax = round(a["tmax"] / n, 1)
        tmin = round(a["tmin"] / n, 1)
        out.append({
            "month": m,
            "tavg": round(a["tavg"] / n, 1),
            "tmax": tmax,
            "tmin": tmin,
            "dtr": round(tmax - tmin, 1),
            # 강수는 '연도별 월합의 평균'이어야 한다 (일평균이 아니다)
            "precip": round(sum(a["precip"].values()) / len(a["precip"]), 1),
            "humidity": round(a["hum"] / n),
        })
    return out


def ssp_scenarios(baseline: float) -> list[dict]:
    """SSP 시나리오 곡선 (경상권 근사치).

    실제 시나리오 자료(기후변화정보포털 CSV)를 넣을 때는 fetch_asos.py 의
    load_ssp_csv() 를 쓰고 이 함수는 폴백으로만 남는다.
    색은 dataviz 팔레트 검증기(어두운 배경, all-pairs)를 통과한 조합이다.
    """
    years = [2025, 2035, 2045, 2055, 2065, 2075, 2085, 2095, 2100]
    specs = [
        ("ssp126", "SSP1-2.6", "탄소중립에 가까운 저배출 경로", "#3987e5", 1.7, None, 0.9),
        ("ssp245", "SSP2-4.5", "현재 정책이 완만히 이어지는 중간 경로", "#c98500", 3.1, 0.77, 1.1),
        ("ssp585", "SSP5-8.5", "화석연료에 계속 의존하는 고배출 경로", "#d55181", 6.1, 1.09, 1.6),
    ]
    scenarios = []
    for sid, label, desc, color, target, curve, spread in specs:
        points = []
        for y in years:
            t = (y - 2015) / (2100 - 2015)
            shape = (3.0 * t - 2.0 * t ** 2) if curve is None else t ** curve
            anom = target * shape
            band = spread * (0.35 + 0.65 * t)
            points.append({
                "year": y,
                "anomaly": round(anom, 2),
                "tavg": round(baseline + anom, 2),
                "low": round(baseline + anom - band / 2, 2),
                "high": round(baseline + anom + band / 2, 2),
            })
        scenarios.append({"id": sid, "label": label, "description": desc, "color": color, "points": points})
    return scenarios


# ─────────────────────────────────────────────── 키 처리 · HTTP
#
# 수집 스크립트 세 개(fetch_asos / fetch_forecast / fetch_blossom)가 공유한다.
# ⚠️ 키는 환경변수로만 받고, 값은 어떤 경로로도 화면·로그에 남기지 않는다.


# .env 를 찾는 순서. 루트가 우선이다 (프로젝트 표준 위치).
ENV_FILES = (ROOT / ".env", ROOT / "scripts" / ".env")

# 받아들이는 키 이름. 앞이 우선.
KEY_NAMES = ("KMA_API_KEY", "KMA_APIHUB_KEY")
DATA_GO_KR_NAMES = ("DATA_GO_KR_KEY",)


def load_env() -> None:
    """.env 를 환경변수로 올린다. 이미 설정된 값은 덮어쓰지 않는다."""
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def load_key(required: bool = True) -> tuple[str, str]:
    """(provider, key). 키 값은 어떤 경로로도 화면·로그에 남기지 않는다."""
    load_env()

    for name in KEY_NAMES:
        if os.environ.get(name):
            return "apihub", os.environ[name]
    for name in DATA_GO_KR_NAMES:
        if os.environ.get(name):
            return "data.go.kr", os.environ[name]

    if not required:
        return "none", ""
    sys.exit(
        "API 키가 없다. 프로젝트 루트에 .env 를 만들고 아래 한 줄을 넣을 것.\n"
        "  KMA_API_KEY=발급받은키          # 기상청 API허브 (apihub.kma.go.kr)\n"
        "(.gitignore 에 .env 가 등록되어 있어 커밋되지 않는다)"
    )


def masked(key: str) -> str:
    """키 자체는 절대 화면에 남기지 않는다 (화면 공유/스크린샷 사고 방지)."""
    return f"확인됨 (길이 {len(key)})"


def mask_url(url: str, key: str = "") -> str:
    """로그·보고서에 남길 URL — 인증 파라미터를 지운다.

    키 문자열을 아는 경우(key 인자)뿐 아니라, 모르는 경우에도 authKey/serviceKey/
    apiKey 파라미터 값을 통째로 *** 로 바꾼다. 실수로 다른 키가 섞여 들어와도
    새어 나가지 않게 하려는 것이다.
    """
    out = url
    if key:
        out = out.replace(key, "***")
    return re.sub(r"((?:authKey|serviceKey|apiKey|key)=)[^&\s]+", r"\1***", out, flags=re.I)


def fetch(url: str, key: str = "") -> str:
    """GET with 재시도. 예외 메시지에도 URL(=키)이 실리지 않게 한다."""
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "prediction-scale/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            # HTTPError 는 str() 에 요청 URL 이 들어갈 수 있다 — 상태코드만 남긴다
            raise RuntimeError(f"HTTP {e.code} ({mask_url(url, key)})") from None
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = attempt * 2
            print(f"    재시도 {attempt}/{MAX_RETRY} ({type(e).__name__}) — {wait}s 대기")
            time.sleep(wait)
    raise RuntimeError(f"요청 실패: {type(last_err).__name__}")


# ─────────────────────────────────────────────── 강수 등급

# S1의 4지선다와 같은 경계다 (src/scale/lib/forecast.ts 의 precipClassOf).
# 한쪽만 바꾸면 채점이 어긋나므로 두 곳을 함께 고칠 것.
PRECIP_ORDER = ["none", "light", "rain", "heavy"]


def precip_class_of(mm: float) -> str:
    if mm < 0.1:
        return "none"
    if mm < 5:
        return "light"
    if mm < 20:
        return "rain"
    return "heavy"


# ─────────────────────────────────────────────── 기상특보 (S1 R3 배지)

# 부산 기준 근사 임계값. 실제 특보는 3시간·12시간 누적처럼 일값이 아닌 기준으로
# 발표되고, 발표 이력 자체가 별도 자료다. 여기서는 "그날 특보가 있었을 법한가"를
# 일별 관측에서 근사한다 — 실데이터로 교체할 때는 fetch_forecast.py 가 기상청
# 특보 이력으로 이 필드를 덮어쓴다.
#
# 합성 데이터에서는 강풍·한파 규칙이 한 번도 걸리지 않는다(생성기의 풍속이 7.5 m/s,
# 최저기온이 -5.8 ℃ 를 넘지 않는다). 임계값을 더미에 맞춰 낮추는 대신 실제 기준을
# 남겨둔다 — 실데이터를 넣으면 그대로 작동해야 하는 쪽이 이 표의 목적이다.
ADVISORY_RULES = [
    ("precip", 80.0, "호우경보", "12시간 강수량이 경보 기준을 넘었다"),
    ("precip", 30.0, "호우주의보", "저기압·전선에 동반된 강한 비"),
    ("windSpeed", 14.0, "강풍주의보", "평균풍속 14 m/s 이상"),
    ("tmax", 33.0, "폭염주의보", "일 최고기온 33 ℃ 이상"),
    ("tmin", -9.0, "한파주의보", "아침 최저기온이 급격히 떨어졌다"),
]


def advisory_for(record: dict) -> dict | None:
    """일별 관측에서 그날 발효됐을 법한 기상특보 하나를 고른다 (없으면 None)."""
    for key, threshold, kind, headline in ADVISORY_RULES:
        value = record.get(key)
        if value is None:
            continue
        hit = value <= threshold if key == "tmin" else value >= threshold
        if hit:
            return {"kind": kind, "headline": headline}
    return None


# ─────────────────────────────────────────────── 벚꽃 개화일

def blossom_payload(records: list[dict], source: str) -> dict:
    """busan_blossom.json 의 겉껍데기. 더미/실데이터가 같은 모양을 쓴다."""
    return {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": source,
            "_source": "dummy" if source == "SYNTHETIC_DUMMY" else "kma",
            "station": STATION,
            "species": "왕벚나무",
            "phenomenon": "개화",
            "period": f"{records[0]['year']}-{records[-1]['year']}" if records else "",
            "units": {"doy": "day of year (1 = 1월 1일)"},
            "note": (
                "계절관측 자료. doy 는 그해 개화일의 연중 일수 — 값이 작을수록 일찍 폈다. "
                "S3에서 연평균 기온 곡선 위에 보조 축으로 겹친다."
            ),
        },
        "records": records,
    }


def forecast_payload(records: list[dict], source: str) -> dict:
    """busan_past_forecast.json 의 겉껍데기.

    각 레코드는 '대상일 date 에 대해 baseDate/baseTime 에 발표된 예보'다.
    S1은 관측(정답) 옆에 이 값을 세 번째 플레이어로 세운다.
    """
    return {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": source,
            "_source": "dummy" if source == "SYNTHETIC_DUMMY" else "kma",
            "station": STATION,
            "count": len(records),
            "leadHours": 24,
            "units": {"tmax": "°C", "tmin": "°C", "precipProb": "%"},
            "note": (
                "기상청이 '전날 05시'에 발표한 다음날 예보. advisory 는 선택 필드로, "
                "그날 발효됐던 기상특보가 있으면 채워진다."
            ),
        },
        "records": records,
    }


def baseline_from_yearly(yearly: list[dict], start: int = 1995, end: int = 2014) -> float:
    """SSP 기준값 — 관측 시계열의 기준기간 평균 (S5에서 곡선이 이어지도록)."""
    rows = [r["tavg"] for r in yearly if start <= r["year"] <= end]
    if not rows:
        rows = [r["tavg"] for r in yearly]
    return round(sum(rows) / len(rows), 2)


def verify(daily: list[dict], yearly: list[dict]) -> None:
    """콘텐츠가 가르치려는 4가지 관계가 데이터에 실제로 있는지 확인한다.

    실데이터라면 아래 수치가 관측된 사실이므로, 값이 크게 벗어나면 파싱 오류를
    의심해야 한다 (예: 풍향 단위, 기압이 현지기압인지 해면기압인지).
    """
    n = len(daily)
    if n < 30:
        print("\n[자체 검증] 표본이 너무 적어 건너뜀")
        return

    pairs = [(daily[i], daily[i + 1]) for i in range(n - 1)]
    diffs = [abs(b["tmax"] - a["tmax"]) for a, b in pairs]
    mae_persist = sum(diffs) / len(diffs)

    signal = [
        (a, b)
        for (a, b), prev in zip(pairs[1:], pairs[:-1])
        if a["pressure"] < prev[0]["pressure"] - 2 and a["humidity"] > prev[0]["humidity"] + 3
    ]
    rain_signal = sum(1 for _, b in signal if b["precip"] >= 1.0) / max(1, len(signal))
    rain_all = sum(1 for r in daily if r["precip"] >= 1.0) / n

    clear = [r["tmax"] - r["tmin"] for r in daily if r["cloud"] <= 2]
    cloudy = [r["tmax"] - r["tmin"] for r in daily if r["cloud"] >= 8]
    north = [b["tavg"] - a["tavg"] for a, b in pairs if b["windFamily"] == "N"]
    south = [b["tavg"] - a["tavg"] for a, b in pairs if b["windFamily"] == "S"]

    mean = lambda xs: sum(xs) / len(xs) if xs else math.nan  # noqa: E731

    print("\n[자체 검증]")
    print(f"  지속성 예보 MAE(최고기온)  : {mae_persist:.2f} °C  (2~3도면 적정)")
    print(f"  강수 신호일 다음날 비 확률 : {rain_signal*100:.0f} %  (전체 {rain_all*100:.0f} %)")
    print(f"  일교차 맑은날 / 흐린날     : {mean(clear):.1f} / {mean(cloudy):.1f} °C")
    print(f"  기온변화 북풍 / 남풍       : {mean(north):+.2f} / {mean(south):+.2f} °C")
    if len(yearly) >= 2:
        first, last = yearly[0], yearly[-1]
        per_decade = (last["tavg"] - first["tavg"]) / (last["year"] - first["year"]) * 10
        print(f"  연평균 상승 추세           : {per_decade:+.2f} °C / 10년")
