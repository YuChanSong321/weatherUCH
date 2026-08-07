#!/usr/bin/env python3
"""실데이터 수집기 (대회 전 1회 실행용) — 기상청 ASOS 일자료 → /data JSON 4종.

  ⚠️ 이 스크립트는 개발자 PC에서만 돌린다. 브라우저(배포본)는 절대 API를 호출하지
     않는다. 웹앱은 /data 의 JSON만 번들로 읽는다.
  ⚠️ API 키는 환경변수로만 받는다. 코드·커밋·예시파일에 키를 남기지 않는다.
     (.gitignore 에 scripts/.env, scripts/raw/ 가 등록되어 있다)

사용법
    export KMA_APIHUB_KEY="발급받은키"          # 기상청 API허브 (권장)
    # 또는
    export DATA_GO_KR_KEY="발급받은키"          # 공공데이터포털 ASOS

    python3 scripts/fetch_asos.py --years 2019 2023
    python3 scripts/fetch_asos.py --years 2019 2023 --normals 1991 2020
    python3 scripts/fetch_asos.py --dry-run      # 키 확인·URL만 점검

출력 스키마는 scripts/make_dummy_data.py 가 만드는 더미와 완전히 동일하다.
따라서 이 스크립트를 돌려 /data 를 덮어쓰면 웹앱은 코드 변경 없이 실데이터로 동작한다.
(로더는 meta.source 를 화면에 표시하므로, 실데이터로 바뀌면 "합성 데이터" 배지가 사라진다)

────────────────────────────────────────────────────────────────────────────
대회 전 체크리스트
  1) 키 발급: 기상청 API허브(apihub.kma.go.kr) 또는 공공데이터포털
  2) --dry-run 으로 URL/키 확인
  3) 실행 후 반드시 [자체 검증] 출력 확인:
     - 지속성 MAE 2~3℃, 강수 신호일 비 확률 > 전체 확률, 맑은날 일교차 > 흐린날,
       북풍일 기온 하강. 하나라도 반대로 나오면 컬럼 매핑이 틀렸다는 뜻이다.
  4) SSP 시나리오는 API가 없다. 기후변화정보포털(CCIC)에서 경상권/남부권 전망을
     CSV로 내려 scripts/raw/ssp_gyeongsang.csv 로 두면 자동으로 읽는다.
     (없으면 근사 곡선으로 폴백하고 meta.source 에 그 사실을 남긴다)
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
from datetime import date, timedelta

from common import (  # noqa: E402
    DAILY_UNITS,
    DATA_DIR,
    RAW_DIR,
    REQUEST_PAUSE,
    ROOT,
    SCHEMA_VERSION,
    STATION,
    baseline_from_yearly,
    fetch,
    load_key,
    masked,
    monthly_from_daily,
    normals_from_daily,
    ssp_scenarios,
    verify,
    wind_dir_label,
    wind_family,
    write_json,
    yearly_from_daily,
)

SSP_CSV = RAW_DIR / "ssp_gyeongsang.csv"

APIHUB_URL = "https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php"
DATA_GO_KR_URL = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"


# ────────────────────────────────────────────────────────── 파서
#
# 두 API 모두 '지점 일자료'를 주지만 형식이 다르다.
#   apihub      : 고정폭/공백 구분 텍스트 (# 주석 헤더)
#   data.go.kr  : JSON (response.body.items.item[])
# 아래 매핑 키는 각 API 문서 기준이며, 실행 전 --dry-run 후 1일치로 먼저 확인할 것.


def to_record(
    day: str,
    tavg: float | None,
    tmax: float | None,
    tmin: float | None,
    precip: float | None,
    humidity: float | None,
    pressure: float | None,
    wind_deg: float | None,
    wind_speed: float | None,
    cloud: float | None,
) -> dict | None:
    """웹앱이 기대하는 일별 레코드로 정규화. 필수값이 비면 그 날은 버린다."""
    if None in (tavg, tmax, tmin):
        return None
    deg = 0.0 if wind_deg is None else float(wind_deg) % 360
    return {
        "date": day,
        "tavg": round(float(tavg), 1),
        "tmax": round(float(tmax), 1),
        "tmin": round(float(tmin), 1),
        "precip": round(float(precip or 0.0), 1),
        "humidity": round(float(humidity if humidity is not None else 60)),
        "pressure": round(float(pressure if pressure is not None else 1013.0), 1),
        "windDeg": round(deg),
        "windDir": wind_dir_label(deg),
        "windFamily": wind_family(deg),
        "windSpeed": round(float(wind_speed or 0.0), 1),
        "cloud": round(float(cloud if cloud is not None else 5.0), 1),
    }


def num(v) -> float | None:
    """빈칸/결측(-9, -99, '') 처리."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "-", "="):
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    return None if f <= -90 else f


def parse_apihub(text: str) -> list[dict]:
    """기상청 API허브 kma_sfcdd3 응답(공백 구분 텍스트) 파싱.

    컬럼 순서는 응답 헤더(#로 시작하는 줄)에 적혀 있다. 헤더를 읽어 이름으로
    매핑하므로 컬럼 순서가 바뀌어도 견딘다.
    """
    header: list[str] = []
    rows: list[dict] = []
    for line in text.splitlines():
        line = line.rstrip()
        if not line:
            continue
        if line.startswith("#"):
            # 헤더 후보: YYMMDDHHMI STN ... 형태의 컬럼 이름 줄
            tokens = line.lstrip("#").split()
            if tokens and tokens[0].upper().startswith(("TM", "YYMM")):
                header = [t.upper() for t in tokens]
            continue
        if not header:
            continue
        parts = line.split()
        if len(parts) < len(header):
            continue
        row = dict(zip(header, parts))
        tm = row.get("TM", "")
        if len(tm) < 8:
            continue
        day = f"{tm[:4]}-{tm[4:6]}-{tm[6:8]}"
        rec = to_record(
            day,
            tavg=num(row.get("TA_AVG")),
            tmax=num(row.get("TA_MAX")),
            tmin=num(row.get("TA_MIN")),
            precip=num(row.get("RN_DAY")),
            humidity=num(row.get("HM_AVG")),
            pressure=num(row.get("PS_AVG")),  # 해면기압
            wind_deg=num(row.get("WD_MAX")) or num(row.get("WD_AVG")),
            wind_speed=num(row.get("WS_AVG")),
            cloud=num(row.get("CA_TOT")),
        )
        if rec:
            rows.append(rec)
    return rows


def parse_data_go_kr(payload: str) -> list[dict]:
    """공공데이터포털 ASOS 일자료 JSON 파싱."""
    data = json.loads(payload)
    body = data.get("response", {}).get("body", {})
    items = body.get("items", {}).get("item", [])
    rows = []
    for it in items:
        rec = to_record(
            it.get("tm", ""),
            tavg=num(it.get("avgTa")),
            tmax=num(it.get("maxTa")),
            tmin=num(it.get("minTa")),
            precip=num(it.get("sumRn")),
            humidity=num(it.get("avgRhm")),
            pressure=num(it.get("avgPs")),  # 해면기압
            wind_deg=num(it.get("maxWd")) or num(it.get("avgWd")),
            wind_speed=num(it.get("avgWs")),
            cloud=num(it.get("avgTca")),
        )
        if rec:
            rows.append(rec)
    return rows


# ────────────────────────────────────────────────────────── 파서 자체 점검

SAMPLE_APIHUB = """#START7777
# TM STN TA_AVG TA_MAX TA_MIN RN_DAY HM_AVG PS_AVG WD_AVG WS_AVG CA_TOT
20230519 159 17.6 20.3 13.8 7.5 67.0 1016.0 320 3.9 2.4
20230520 159 18.9 23.1 14.2 0.0 58.0 1019.2 70 2.1 1.1
#7777END
"""

SAMPLE_DATA_GO_KR = json.dumps({
    "response": {
        "body": {
            "items": {
                "item": [
                    {
                        "tm": "2023-05-19", "avgTa": "17.6", "maxTa": "20.3", "minTa": "13.8",
                        "sumRn": "7.5", "avgRhm": "67", "avgPs": "1016.0",
                        "maxWd": "320", "avgWs": "3.9", "avgTca": "2.4",
                    },
                    {
                        "tm": "2023-05-20", "avgTa": "18.9", "maxTa": "23.1", "minTa": "14.2",
                        "sumRn": "", "avgRhm": "58", "avgPs": "1019.2",
                        "maxWd": "70", "avgWs": "2.1", "avgTca": "1.1",
                    },
                ]
            }
        }
    }
})


def selftest() -> None:
    """키 없이 파서/정규화를 점검한다. 실제 응답 컬럼이 바뀌면 여기서 먼저 깨진다."""
    for name, rows in (("apihub", parse_apihub(SAMPLE_APIHUB)), ("data.go.kr", parse_data_go_kr(SAMPLE_DATA_GO_KR))):
        assert len(rows) == 2, f"{name}: 2일치를 기대했으나 {len(rows)}건"
        first = rows[0]
        assert first["date"] == "2023-05-19", first["date"]
        assert first["tmax"] == 20.3 and first["tmin"] == 13.8, first
        assert first["precip"] == 7.5 and first["humidity"] == 67, first
        assert first["windDir"] == "북서" and first["windFamily"] == "N", first
        assert rows[1]["precip"] == 0.0, rows[1]
        assert set(first) == {
            "date", "tavg", "tmax", "tmin", "precip", "humidity",
            "pressure", "windDeg", "windDir", "windFamily", "windSpeed", "cloud",
        }, sorted(first)
        print(f"  {name} 파서 OK — {rows[0]['date']} ~ {rows[-1]['date']}")
    print("자체 점검 통과: 두 API 응답 모두 웹앱 스키마로 정규화된다.")


# ────────────────────────────────────────────────────────── 수집


def fetch_daily(provider: str, key: str, start: date, end: date, dry_run: bool) -> list[dict]:
    """기간을 나눠 호출한다 (apihub 는 연 단위, data.go.kr 은 페이지 단위)."""
    records: list[dict] = []

    if provider == "apihub":
        cursor = start
        while cursor <= end:
            chunk_end = min(end, date(cursor.year, 12, 31))
            params = {
                "tm1": cursor.strftime("%Y%m%d"),
                "tm2": chunk_end.strftime("%Y%m%d"),
                "stn": STATION["stnId"],
                "help": 1,  # 헤더(컬럼명) 포함
                "authKey": key,
            }
            url = f"{APIHUB_URL}?{urllib.parse.urlencode(params)}"
            print(f"  GET {APIHUB_URL} tm1={params['tm1']} tm2={params['tm2']}")
            if not dry_run:
                records += parse_apihub(fetch(url))
                time.sleep(REQUEST_PAUSE)
            cursor = chunk_end + timedelta(days=1)

    else:
        page = 1
        while True:
            params = {
                "serviceKey": key,
                "dataType": "JSON",
                "dataCd": "ASOS",
                "dateCd": "DAY",
                "stnIds": STATION["stnId"],
                "startDt": start.strftime("%Y%m%d"),
                "endDt": end.strftime("%Y%m%d"),
                "numOfRows": 365,
                "pageNo": page,
            }
            url = f"{DATA_GO_KR_URL}?{urllib.parse.urlencode(params)}"
            print(f"  GET {DATA_GO_KR_URL} page={page}")
            if dry_run:
                break
            got = parse_data_go_kr(fetch(url))
            records += got
            if len(got) < 365:
                break
            page += 1
            time.sleep(REQUEST_PAUSE)

    records.sort(key=lambda r: r["date"])
    return records


def load_ssp_csv() -> tuple[list[dict], str] | None:
    """기후변화정보포털에서 내린 CSV → 시나리오 곡선.

    기대 형식 (헤더 이름은 대소문자 무관):
        scenario,year,tavg[,low,high]
        ssp126,2030,16.1,15.7,16.5
    """
    if not SSP_CSV.exists():
        return None
    meta = {
        "ssp126": ("SSP1-2.6", "탄소중립에 가까운 저배출 경로", "#3987e5"),
        "ssp245": ("SSP2-4.5", "현재 정책이 완만히 이어지는 중간 경로", "#c98500"),
        "ssp585": ("SSP5-8.5", "화석연료에 계속 의존하는 고배출 경로", "#d55181"),
    }
    buckets: dict[str, list[dict]] = {k: [] for k in meta}
    with SSP_CSV.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            row = {(k or "").strip().lower(): v for k, v in row.items()}
            sid = (row.get("scenario") or "").strip().lower().replace("-", "").replace(".", "")
            sid = {"ssp126": "ssp126", "ssp245": "ssp245", "ssp585": "ssp585"}.get(sid)
            if not sid:
                continue
            year = int(float(row["year"]))
            tavg = float(row["tavg"])
            low = float(row.get("low") or tavg - 0.5)
            high = float(row.get("high") or tavg + 0.5)
            buckets[sid].append({"year": year, "tavg": round(tavg, 2), "low": round(low, 2), "high": round(high, 2)})

    scenarios = []
    for sid, (label, desc, color) in meta.items():
        pts = sorted(buckets[sid], key=lambda p: p["year"])
        if not pts:
            return None
        scenarios.append({"id": sid, "label": label, "description": desc, "color": color, "points": pts})
    return scenarios, "CCIC_CSV"


# ────────────────────────────────────────────────────────── 메인


def main() -> None:
    ap = argparse.ArgumentParser(description="기상청 ASOS 일자료 → /data JSON 4종")
    ap.add_argument("--years", nargs=2, type=int, metavar=("START", "END"), default=[2019, 2023],
                    help="일별 자료 수집 연도 범위 (S1 출제 풀)")
    ap.add_argument("--normals", nargs=2, type=int, metavar=("START", "END"), default=[1991, 2020],
                    help="월별 평년값 기간 (별도 수집)")
    ap.add_argument("--yearly-from", type=int, default=1985, help="연평균 시계열 시작 연도")
    ap.add_argument("--dry-run", action="store_true", help="호출 없이 URL/키만 점검")
    ap.add_argument("--selftest", action="store_true", help="키 없이 파서만 점검")
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return

    provider, key = load_key()
    print(f"공급자: {provider} · 키: {masked(key)}")

    d_start = date(args.years[0], 1, 1)
    d_end = date(args.years[1], 12, 31)

    print(f"\n[1/3] 일별 자료 {d_start} ~ {d_end}")
    daily = fetch_daily(provider, key, d_start, d_end, args.dry_run)

    print(f"\n[2/3] 연평균용 장기 일자료 {args.yearly_from} ~ {args.years[1]}")
    long_daily = (
        daily
        if args.dry_run or args.yearly_from >= args.years[0]
        else fetch_daily(provider, key, date(args.yearly_from, 1, 1), d_end, args.dry_run)
    )

    print(f"\n[3/3] 평년값 기간 {args.normals[0]} ~ {args.normals[1]}")
    normals_daily = (
        long_daily
        if args.dry_run
        else fetch_daily(provider, key, date(args.normals[0], 1, 1), date(args.normals[1], 12, 31), args.dry_run)
    )

    if args.dry_run:
        print("\n--dry-run: 호출을 건너뛰었다. URL 형식과 키 인식만 확인했다.")
        return

    if not daily:
        sys.exit("일별 자료가 비어 있다. 컬럼 매핑 또는 키 권한을 확인할 것.")

    # ── 집계
    daily_years = yearly_from_daily(long_daily or daily)
    yearly = [
        {
            "year": y,
            "tavg": v["tavg"],
            "tmaxMean": v["tmaxMean"],
            "tminMean": v["tminMean"],
            "precip": v["precip"],
            "fromDaily": True,
        }
        for y, v in sorted(daily_years.items())
        if y >= args.yearly_from
    ]
    normals = normals_from_daily(normals_daily or daily)
    baseline = baseline_from_yearly(yearly)

    ssp = load_ssp_csv()
    if ssp:
        scenarios, ssp_source = ssp
        print(f"\nSSP: {SSP_CSV.relative_to(ROOT)} 사용")
    else:
        scenarios, ssp_source = ssp_scenarios(baseline), "APPROX_CURVE"
        print(f"\nSSP: {SSP_CSV.relative_to(ROOT)} 없음 → 근사 곡선으로 폴백")

    print("\n저장:")
    write_json(DATA_DIR / "busan_daily.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": "KMA_ASOS",
            "provider": provider,
            "station": STATION,
            "years": list(range(args.years[0], args.years[1] + 1)),
            "count": len(daily),
            "units": DAILY_UNITS,
            "note": "기상청 ASOS 일자료. 결측일은 제외됨.",
        },
        "records": daily,
        "monthlySeries": monthly_from_daily(daily),
    })

    write_json(DATA_DIR / "busan_monthly.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": "KMA_ASOS",
            "station": STATION,
            "period": f"{args.normals[0]}-{args.normals[1]}",
            "units": {"tavg": "°C", "tmax": "°C", "tmin": "°C", "precip": "mm", "humidity": "%"},
        },
        "normals": normals,
    })

    write_json(DATA_DIR / "busan_yearly.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": "KMA_ASOS",
            "station": STATION,
            "period": f"{yearly[0]['year']}-{yearly[-1]['year']}",
            "units": {"tavg": "°C", "precip": "mm"},
        },
        "records": yearly,
    })

    write_json(DATA_DIR / "future_ssp.json", {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "source": ssp_source,
            "region": "경상권",
            "baseline": {"period": "1995-2014", "tavg": baseline},
            "units": {"tavg": "°C", "anomaly": "°C"},
        },
        "scenarios": scenarios,
    })

    verify(daily, yearly)
    print("\n완료. npm run dev 로 화면을 확인하고, 검증 수치가 자연스러운지 볼 것.")


if __name__ == "__main__":
    main()
