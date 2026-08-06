#!/usr/bin/env python3
"""더미 생성기와 실데이터 수집기가 공유하는 부분.

- /data JSON 4종의 스키마와 파일명
- 일별 -> 월별/연별 집계
- "콘텐츠가 가르치려는 규칙"이 데이터에 실제로 들어있는지 검증
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

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
