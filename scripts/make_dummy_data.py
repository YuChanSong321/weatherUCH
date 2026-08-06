#!/usr/bin/env python3
"""부산 더미 기후 데이터 생성기 (대회 전 실데이터 교체용 자리채움).

`python3 scripts/make_dummy_data.py` 를 실행하면 /data 아래 4개 JSON을 만든다.
외부 네트워크를 쓰지 않고, 고정 시드로 항상 같은 결과를 낸다.

중요: 이 데이터는 합성(synthetic)이지만 콘텐츠가 "가르치려는 규칙"을 실제로
만족하도록 만들어졌다. S1 채점/해설이 데이터와 어긋나면 교육 효과가 무너지므로,
아래 4가지 관계를 생성 단계에서 강제한다.

  1) 지속성      : 다음날 최고기온은 어제와 비슷하다 (AR(1) 자기상관)
  2) 강수 신호   : 기압 하강 + 습도 상승 -> 다음날 비 확률 급증
  3) 일교차      : 맑으면(운량 낮음) 일교차 크고, 흐리면 작다
  4) 풍향        : 북풍 계열 유입 = 기온 하강, 남풍 계열 = 기온 상승

실데이터로 교체할 때는 scripts/fetch_asos.py 를 사용한다(동일 스키마 출력).
"""

from __future__ import annotations

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

SCHEMA_VERSION = 1
SOURCE_TAG = "SYNTHETIC_DUMMY"  # 실데이터 교체 시 "KMA_ASOS" 등으로 바뀐다
STATION = {"name": "부산", "stnId": 159, "lat": 35.1047, "lon": 129.0320}

# 부산 평년값(1991-2020) 근사치 — 월별 [평균, 최고평균, 최저평균, 강수량mm, 습도%]
MONTHLY_NORMALS = [
    # month, tavg, tmax, tmin, precip, humidity
    (1, 3.6, 8.2, -0.4, 33.2, 45),
    (2, 5.4, 10.1, 1.2, 46.1, 48),
    (3, 9.2, 14.0, 4.7, 83.4, 53),
    (4, 13.9, 18.6, 9.4, 126.0, 57),
    (5, 18.2, 22.6, 14.1, 148.3, 63),
    (6, 21.3, 25.1, 18.1, 197.4, 73),
    (7, 24.9, 28.2, 22.2, 315.2, 82),
    (8, 26.5, 30.1, 23.6, 273.1, 79),
    (9, 22.9, 26.9, 19.5, 168.2, 72),
    (10, 18.3, 23.0, 14.1, 76.3, 62),
    (11, 12.2, 17.0, 7.9, 54.2, 55),
    (12, 6.0, 10.8, 1.9, 27.4, 48),
]

DAILY_YEARS = [2019, 2020, 2021, 2022, 2023]
YEARLY_START, YEARLY_END = 1985, 2024

# 연평균 상승 추세: 1985년 약 14.2도 -> 2024년 약 16.0도 (약 0.45도/10년)
YEARLY_BASE = 14.25
YEARLY_TREND_PER_YEAR = 0.045


def smooth_seasonal(day_of_year: int, key: int) -> float:
    """월 평년값을 원형 보간해 매끄러운 계절 곡선 값을 만든다.

    key: 1=tavg, 2=tmax, 3=tmin, 4=precip, 5=humidity (MONTHLY_NORMALS 인덱스)
    """
    # 각 월의 중앙일(대략)에 값을 놓고 코사인 보간
    centers = [15.5 + 30.44 * i for i in range(12)]
    values = [row[key] for row in MONTHLY_NORMALS]

    x = float(day_of_year)
    for i in range(12):
        a, b = centers[i], centers[(i + 1) % 12]
        if b < a:
            b += 365.0
        xx = x if x >= a else x + 365.0
        if a <= xx <= b:
            t = (xx - a) / (b - a)
            w = 0.5 - 0.5 * math.cos(math.pi * t)  # smoothstep
            return values[i] * (1 - w) + values[(i + 1) % 12] * w
    return values[0]


def wind_dir_label(deg: float) -> str:
    """16방위 대신 콘텐츠에서 쓰는 4계열(북/동/남/서) + 한글 방위명."""
    dirs = [
        (0, "북"), (45, "북동"), (90, "동"), (135, "남동"),
        (180, "남"), (225, "남서"), (270, "서"), (315, "북서"),
    ]
    best = min(dirs, key=lambda d: min(abs(deg - d[0]), 360 - abs(deg - d[0])))
    return best[1]


def wind_family(deg: float) -> str:
    """북·동·남·서 계열 (S1 R2 보너스 4지선다 정답 판정용)."""
    d = deg % 360
    if d >= 315 or d < 45:
        return "N"
    if d < 135:
        return "E"
    if d < 225:
        return "S"
    return "W"


def generate_daily() -> list[dict]:
    """일별 관측 더미 생성 — 종관(synoptic) 위상 모델 기반."""
    rng = random.Random(20260806)
    records: list[dict] = []

    anomaly = 0.0            # AR(1) 기온 편차 (지속성의 원천)
    phase = rng.random()     # 저기압/전선 주기 위상 0~1
    period = rng.uniform(5.0, 7.5)

    start = date(DAILY_YEARS[0], 1, 1)
    end = date(DAILY_YEARS[-1], 12, 31)
    day = start

    while day <= end:
        doy = day.timetuple().tm_yday
        month = day.month

        # --- 연도별 온난화 오프셋 (연평균 추세와 정합) ---
        warm = (day.year - 2005) * YEARLY_TREND_PER_YEAR

        base_avg = smooth_seasonal(doy, 1) + warm
        base_dtr = smooth_seasonal(doy, 2) - smooth_seasonal(doy, 3)
        base_hum = smooth_seasonal(doy, 5)

        # --- 종관 위상 진행 ---
        phase += 1.0 / period
        while phase >= 1.0:
            phase -= 1.0
            period = rng.uniform(4.0, 8.0)  # 주기마다 다시 뽑음 = 예측 난이도

        # 장마(6/20~7/25) / 늦여름 대류 강화
        is_changma = (month == 6 and day.day >= 20) or (month == 7 and day.day <= 25)
        wet_season = 1.0 + (0.9 if is_changma else 0.0) + (0.35 if month in (8, 9) else 0.0)

        # 위상별 국면: 고기압 -> 접근 -> 전선통과 -> 후면
        if phase < 0.45:                      # 고기압권 (맑음)
            regime = "high"
            cloud = rng.uniform(0.0, 3.0)
            pressure_anom = 4.5 + 3.0 * math.cos(math.pi * phase / 0.45) + rng.gauss(0, 1.2)
            hum_anom = -9 + rng.gauss(0, 4)
            wind_deg = rng.gauss(20 if month in (11, 12, 1, 2) else 70, 35)
            wind_speed = rng.uniform(1.6, 3.6)
            anom_push = 0.45
        elif phase < 0.70:                    # 저기압 접근 (남풍, 흐려짐)
            regime = "approach"
            cloud = rng.uniform(4.0, 8.0)
            pressure_anom = -1.0 - 6.0 * (phase - 0.45) / 0.25 + rng.gauss(0, 1.0)
            hum_anom = 6 + 10 * (phase - 0.45) / 0.25 + rng.gauss(0, 4)
            wind_deg = rng.gauss(200, 30)
            wind_speed = rng.uniform(2.5, 5.5)
            anom_push = 1.5
        elif phase < 0.85:                    # 전선 통과 (비)
            regime = "front"
            cloud = rng.uniform(8.5, 10.0)
            pressure_anom = -7.5 + rng.gauss(0, 1.5)
            hum_anom = 17 + rng.gauss(0, 4)
            wind_deg = rng.gauss(230, 45)
            wind_speed = rng.uniform(3.5, 7.5)
            anom_push = -0.4
        else:                                 # 전선 후면 (북풍 유입, 기온 하강)
            regime = "post"
            cloud = rng.uniform(1.0, 5.0)
            pressure_anom = 1.5 + 8.0 * (phase - 0.85) / 0.15 + rng.gauss(0, 1.2)
            hum_anom = -5 + rng.gauss(0, 5)
            wind_deg = rng.gauss(330, 30)
            wind_speed = rng.uniform(3.0, 6.5)
            anom_push = -2.7

        # --- 기온 편차: AR(1) 지속성 + 국면별 강제 ---
        anomaly = 0.66 * anomaly + anom_push + rng.gauss(0, 1.35)
        anomaly = max(-7.5, min(7.5, anomaly))

        tavg = base_avg + anomaly
        # 일교차: 운량이 이불 역할 (맑으면 크고 흐리면 작다)
        dtr = base_dtr * (1.28 - 0.082 * cloud) + rng.gauss(0, 0.9)
        dtr = max(2.0, dtr)
        tmax = tavg + dtr * 0.55
        tmin = tavg - dtr * 0.45

        # --- 강수: 전선 통과 국면 + 습도 높음이 주 신호 ---
        if regime == "approach":  # 접근 후반으로 갈수록 비 확률 급증
            rain_p = 0.10 + 0.62 * (phase - 0.45) / 0.25
        else:
            rain_p = {"high": 0.025, "front": 0.93, "post": 0.11}[regime]
        rain_p = min(0.97, rain_p * wet_season)
        if rng.random() < rain_p:
            scale = 6.0 * wet_season * (1.0 + 0.9 * (cloud / 10.0))
            precip = round(rng.expovariate(1 / scale), 1)
            # 드문 호우/태풍 이벤트
            if rng.random() < (0.035 if is_changma or month in (8, 9) else 0.008):
                precip = round(precip + rng.uniform(40, 130), 1)
        else:
            precip = 0.0

        humidity = max(28, min(98, base_hum + hum_anom))
        sea_level_pressure = 1013.0 + (5.5 if month in (12, 1, 2) else -4.0 if month in (7, 8) else 0.0) + pressure_anom

        records.append({
            "date": day.isoformat(),
            "tavg": round(tavg, 1),
            "tmax": round(tmax, 1),
            "tmin": round(tmin, 1),
            "precip": precip,
            "humidity": round(humidity),
            "pressure": round(sea_level_pressure, 1),
            "windDeg": round(wind_deg % 360),
            "windDir": wind_dir_label(wind_deg % 360),
            "windFamily": wind_family(wind_deg),
            "windSpeed": round(wind_speed, 1),
            "cloud": round(cloud, 1),
        })
        day += timedelta(days=1)

    return records


def yearly_from_daily(daily: list[dict]) -> dict[int, dict]:
    """일별 데이터에서 연평균을 계산 (S2 전환 애니메이션의 정합성용)."""
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


def monthly_from_daily(daily: list[dict]) -> list[dict]:
    """일별 데이터에서 월평균 시계열 (S2 압축 애니메이션이 실제로 쓰는 값)."""
    acc: dict[str, dict] = {}
    for r in daily:
        key = r["date"][:7]
        a = acc.setdefault(key, {"tavg": 0.0, "precip": 0.0, "n": 0})
        a["tavg"] += r["tavg"]
        a["precip"] += r["precip"]
        a["n"] += 1
    return [
        {"month": k, "tavg": round(v["tavg"] / v["n"], 2), "precip": round(v["precip"], 1)}
        for k, v in sorted(acc.items())
    ]


def generate_yearly(daily_years: dict[int, dict]) -> list[dict]:
    """연평균 기온 시계열 — 선형 추세 + 십년 규모 변동 + 잡음."""
    rng = random.Random(1985)
    out = []
    for year in range(YEARLY_START, YEARLY_END + 1):
        if year in daily_years:  # 일별 데이터가 있는 해는 그 평균을 그대로 사용
            d = daily_years[year]
            out.append({
                "year": year,
                "tavg": d["tavg"],
                "tmaxMean": d["tmaxMean"],
                "tminMean": d["tminMean"],
                "precip": d["precip"],
                "fromDaily": True,
            })
            continue
        trend = YEARLY_BASE + (year - YEARLY_START) * YEARLY_TREND_PER_YEAR
        decadal = 0.22 * math.sin((year - 1985) / 11.0 * 2 * math.pi)
        tavg = trend + decadal + rng.gauss(0, 0.33)
        out.append({
            "year": year,
            "tavg": round(tavg, 2),
            "tmaxMean": round(tavg + 4.4 + rng.gauss(0, 0.15), 2),
            "tminMean": round(tavg - 4.2 + rng.gauss(0, 0.15), 2),
            "precip": round(rng.gauss(1560, 330), 1),
            "fromDaily": False,
        })
    return out


def generate_ssp() -> list[dict]:
    """SSP 시나리오별 경상권 기온 전망 (기준: 1995-2014 평균).

    값은 국내 남부권 시나리오 전망을 단순화한 근사치. 실데이터 교체 시
    기후변화정보포털(CCIC) 시나리오 자료로 대체한다.
    """
    baseline = 15.0
    years = [2025, 2035, 2045, 2055, 2065, 2075, 2085, 2095, 2100]
    # 세 시나리오는 현재(2025) 근처에서 거의 같은 값에서 출발해 뒤로 갈수록
    # 갈라진다 — S5의 "부채꼴" 연출이 성립하려면 이 성질이 반드시 필요하다.
    # 색은 dataviz 팔레트 검증기(어두운 배경, all-pairs)를 통과한 조합이다 —
    # 값을 바꾸려면 반드시 재검증할 것.
    # (id, label, 설명, 색, 2100 편차, 곡률지수, 불확실성 폭)
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
            if curve is None:
                # 2060년대 정점 후 완만한 하강 (감축이 효과를 내는 경로)
                shape = 3.0 * t - 2.0 * t ** 2
            else:
                shape = t ** curve
            anom = target * shape
            band = spread * (0.35 + 0.65 * t)
            points.append({
                "year": y,
                "anomaly": round(anom, 2),
                "tavg": round(baseline + anom, 2),
                "low": round(baseline + anom - band / 2, 2),
                "high": round(baseline + anom + band / 2, 2),
            })
        scenarios.append({
            "id": sid,
            "label": label,
            "description": desc,
            "color": color,
            "points": points,
        })
    return scenarios


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    size_kb = path.stat().st_size / 1024
    print(f"  {path.relative_to(ROOT)}  ({size_kb:,.0f} KB)")


def main() -> None:
    print("부산 더미 데이터 생성 중...")
    daily = generate_daily()
    daily_years = yearly_from_daily(daily)
    monthly_series = monthly_from_daily(daily)
    yearly = generate_yearly(daily_years)

    write_json(DATA_DIR / "busan_daily.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": SOURCE_TAG,
            "station": STATION,
            "years": DAILY_YEARS,
            "count": len(daily),
            "units": {
                "tavg": "°C", "tmax": "°C", "tmin": "°C", "precip": "mm",
                "humidity": "%", "pressure": "hPa (해면기압)",
                "windDeg": "deg", "windSpeed": "m/s", "cloud": "0-10",
            },
            "note": "합성 데이터. 지속성/기압-강수/운량-일교차/풍향-기온 관계가 내장되어 있다.",
        },
        "records": daily,
        "monthlySeries": monthly_series,
    })

    write_json(DATA_DIR / "busan_monthly.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": SOURCE_TAG,
            "station": STATION,
            "period": "1991-2020",
            "units": {"tavg": "°C", "tmax": "°C", "tmin": "°C", "precip": "mm", "humidity": "%"},
        },
        "normals": [
            {
                "month": m,
                "tavg": tavg,
                "tmax": tmax,
                "tmin": tmin,
                "dtr": round(tmax - tmin, 1),
                "precip": precip,
                "humidity": hum,
            }
            for (m, tavg, tmax, tmin, precip, hum) in MONTHLY_NORMALS
        ],
    })

    write_json(DATA_DIR / "busan_yearly.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": SOURCE_TAG,
            "station": STATION,
            "period": f"{YEARLY_START}-{YEARLY_END}",
            "units": {"tavg": "°C", "precip": "mm"},
            "note": "일별 데이터가 있는 해(2019-2023)의 값은 일별 평균에서 계산됨.",
        },
        "records": yearly,
    })

    write_json(DATA_DIR / "future_ssp.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": SOURCE_TAG,
            "region": "경상권",
            "baseline": {"period": "1995-2014", "tavg": 15.0},
            "units": {"tavg": "°C", "anomaly": "°C"},
            "note": "합성 근사치. 실데이터는 기후변화정보포털(CCIC) 남부권 시나리오로 교체.",
        },
        "scenarios": generate_ssp(),
    })

    # 생성 결과가 "가르치려는 규칙"을 실제로 만족하는지 자체 검증
    verify(daily, yearly)
    print("완료.")


def verify(daily: list[dict], yearly: list[dict]) -> None:
    n = len(daily)
    pairs = [(daily[i], daily[i + 1]) for i in range(n - 1)]

    # 1) 지속성
    diffs = [abs(b["tmax"] - a["tmax"]) for a, b in pairs]
    mae_persist = sum(diffs) / len(diffs)

    # 2) 기압 하강 + 습도 상승 -> 다음날 비
    signal = [(a, b) for (a, b), prev in zip(pairs[1:], pairs[:-1])
              if a["pressure"] < prev[0]["pressure"] - 2 and a["humidity"] > prev[0]["humidity"] + 3]
    rain_rate_signal = sum(1 for _, b in signal if b["precip"] >= 1.0) / max(1, len(signal))
    rain_rate_all = sum(1 for r in daily if r["precip"] >= 1.0) / n

    # 3) 운량 - 일교차
    clear = [r["tmax"] - r["tmin"] for r in daily if r["cloud"] <= 2]
    cloudy = [r["tmax"] - r["tmin"] for r in daily if r["cloud"] >= 8]

    # 4) 풍향 - 기온 변화
    north = [b["tavg"] - a["tavg"] for a, b in pairs if b["windFamily"] == "N"]
    south = [b["tavg"] - a["tavg"] for a, b in pairs if b["windFamily"] == "S"]

    print("\n[자체 검증]")
    print(f"  지속성 예보 MAE(최고기온)  : {mae_persist:.2f} °C  (2~3도면 적정)")
    print(f"  강수 신호일 다음날 비 확률 : {rain_rate_signal*100:.0f} %  (전체 {rain_rate_all*100:.0f} %)")
    print(f"  일교차 맑은날 / 흐린날     : {sum(clear)/len(clear):.1f} / {sum(cloudy)/len(cloudy):.1f} °C")
    print(f"  기온변화 북풍 / 남풍       : {sum(north)/len(north):+.2f} / {sum(south)/len(south):+.2f} °C")
    first, last = yearly[0], yearly[-1]
    span = (last["tavg"] - first["tavg"]) / (last["year"] - first["year"]) * 10
    print(f"  연평균 상승 추세           : {span:+.2f} °C / 10년")


if __name__ == "__main__":
    main()
