#!/usr/bin/env python3
"""실데이터 수집기 — 기상청 계절관측(벚꽃 개화일) → data/busan_blossom.json

  ⚠️ 개발자 PC에서만 돌린다. 브라우저(배포본)는 절대 API를 호출하지 않는다.
  ⚠️ API 키는 환경변수로만 받는다. 코드·커밋·예시파일에 키를 남기지 않는다.

────────────────────────────────────────────────────────────────────────────
필요한 API 활용신청 항목

  · 공공데이터포털 「기상청_계절관측 조회서비스」 (SeasonObsService)
      오퍼레이션: 계절관측일 조회 (getSeasonObs)
      DATA_GO_KR_KEY 로 호출한다.

  · 기상청 API허브 「계절관측」 (sfc_ssn.php)  ← 가장 간단, 권장
      KMA_API_KEY(API허브 키) 하나로 40년치가 한 번에 온다. 별도 활용신청 불필요.
      벚나무 개화 = SSN_ID 205 · SSN_MD 202 (아래 SSN_CHERRY / SSN_BLOOM).
      이 코드는 공표된 서울 벚꽃 개화일(2023-03-25, 2024-04-01)과 대조해 확정했다 —
      코드표 PDF 는 폰트가 서브셋이라 텍스트 추출이 되지 않는다.

  · 기상자료개방포털(data.kma.go.kr) 「기후통계분석 > 계절관측」
      생물계절(왕벚나무 개화)은 연 1행짜리 자료라 API를 쓸 이유가 거의 없다.
      부산(지점 159) · 왕벚나무 · 개화 로 조회해 CSV 를 내려받아
      scripts/raw/busan_blossom.csv 로 두면 이 스크립트가 읽는다.
      CSV 가 있으면 API 보다 먼저 읽는다.

  CSV 형식 (열 이름은 아래 중 아무거나 — 포털이 내주는 헤더를 그대로 써도 된다)
      year,date          예: 2019,2019-03-23
      연도,관측일        예: 2019,2019-03-23
      year,doy           예: 2019,82
────────────────────────────────────────────────────────────────────────────

사용법
    python3 scripts/fetch_blossom.py --selftest    # 키 없이 파서만 점검
    python3 scripts/fetch_blossom.py               # CSV 있으면 CSV, 없으면 API
    export DATA_GO_KR_KEY="발급받은키"
    python3 scripts/fetch_blossom.py --years 1985 2024 --dry-run

출력 스키마는 make_dummy_data.py 가 만드는 더미와 동일하다.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
from datetime import date

from common import (  # noqa: E402
    mask_url,
    DATA_DIR,
    RAW_DIR,
    REQUEST_PAUSE,
    blossom_payload,
    fetch,
    load_key,
    masked,
    write_json,
)

SEASON_URL = "https://apis.data.go.kr/1360000/SeasonObsService/getSeasonObs"

STN_ID = 159  # 부산
# 계절관측의 대상/현상 코드. 포털 문서 기준값이며 --dry-run 응답으로 대조할 것.
SPECIES = "왕벚나무"
PHENOMENON = "개화"

SOURCE_TAG = "KMA_SEASON_OBS"

# API허브 계절관측
APIHUB_SSN_URL = "https://apihub.kma.go.kr/api/typ01/url/sfc_ssn.php"
SSN_CHERRY = "205"   # 계절관측 코드 · 벚나무
SSN_BLOOM = "202"    # 계절현상 코드 · 개화 (201 발아 / 203 만발)
CSV_PATH = RAW_DIR / "busan_blossom.csv"

# 개화일로 인정할 범위. 부산의 벚꽃은 3월 초~4월 말 사이다. 이 밖의 값은
# 다른 현상(발아·만개)이나 다른 지점이 섞여 들어온 것으로 보고 버린다.
DOY_MIN, DOY_MAX = 45, 135


def to_record(year: int, day: date) -> dict:
    return {
        "year": year,
        "doy": day.timetuple().tm_yday,
        "date": day.isoformat(),
    }


def sane(rec: dict) -> bool:
    return DOY_MIN <= rec["doy"] <= DOY_MAX


# ────────────────────────────────────────────────────────── CSV


def parse_date_cell(raw: str, year: int | None) -> date | None:
    """'2019-03-23' / '2019.03.23' / '20190323' / '3월 23일' 을 모두 받는다.

    포털 CSV 는 내려받는 메뉴에 따라 표기가 제각각이라, 한 가지만 받으면
    사람이 손으로 고치다가 틀린다.
    """
    s = raw.strip()
    if not s:
        return None
    s = s.replace(".", "-").replace("/", "-").replace(" ", "")
    if "월" in s and "일" in s:
        if year is None:
            return None
        m, d = s.replace("일", "").split("월")
        return date(year, int(m), int(d))
    digits = s.replace("-", "")
    if len(digits) == 8 and digits.isdigit():
        return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
    parts = [p for p in s.split("-") if p]
    try:
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
        if len(parts) == 2 and year is not None:
            return date(year, int(parts[0]), int(parts[1]))
    except ValueError:
        return None
    return None


YEAR_KEYS = ("year", "연도", "년도", "관측연도")
DATE_KEYS = ("date", "관측일", "현상일", "일자", "관측일자")
DOY_KEYS = ("doy", "연중일수")


def pick(row: dict[str, str], keys: tuple[str, ...]) -> str | None:
    for k, v in row.items():
        if k and k.strip().lower() in keys:
            return v
    return None


def parse_csv(text: str) -> list[dict]:
    out: list[dict] = []
    for row in csv.DictReader(text.splitlines()):
        year_raw = pick(row, YEAR_KEYS)
        year = int(year_raw) if year_raw and year_raw.strip().isdigit() else None

        doy_raw = pick(row, DOY_KEYS)
        if year and doy_raw and doy_raw.strip().isdigit():
            day = date.fromordinal(date(year, 1, 1).toordinal() + int(doy_raw) - 1)
            out.append(to_record(year, day))
            continue

        date_raw = pick(row, DATE_KEYS)
        if not date_raw:
            continue
        day = parse_date_cell(date_raw, year)
        if day:
            out.append(to_record(year or day.year, day))

    good = [r for r in out if sane(r)]
    dropped = len(out) - len(good)
    if dropped:
        print(f"  범위 밖 {dropped}건을 버렸다 (개화일은 연중 {DOY_MIN}~{DOY_MAX}일 사이)")
    return sorted(good, key=lambda r: r["year"])


def load_csv() -> list[dict] | None:
    if not CSV_PATH.exists():
        return None
    return parse_csv(CSV_PATH.read_text(encoding="utf-8-sig"))


# ────────────────────────────────────────────────────────── API


def parse_api(payload: str) -> list[dict]:
    """공공데이터포털 JSON (response.body.items.item[]) 정규화."""
    data = json.loads(payload)
    items = (
        data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    )
    if isinstance(items, dict):
        items = [items]
    out: list[dict] = []
    for it in items:
        # 개화가 아닌 현상(발아·단풍 등)이 섞여 오면 버린다
        name = str(it.get("gaehwa") or it.get("phenomenon") or "")
        raw = it.get("gaehwaDate") or it.get("obsrDate") or it.get("tm") or name
        year_raw = it.get("year") or it.get("obsrYear")
        year = int(year_raw) if year_raw and str(year_raw).isdigit() else None
        day = parse_date_cell(str(raw), year)
        if day:
            out.append(to_record(year or day.year, day))
    return sorted((r for r in out if sane(r)), key=lambda r: r["year"])


def parse_apihub(payload: str) -> list[dict]:
    """API허브 sfc_ssn.php 응답 → 개화 기록.

    형식: ` YY, STN, TM, SSN_ID, SSN_MD,` (주석은 #). 인코딩은 EUC-KR 이지만
    이 파서가 보는 칸은 전부 숫자·날짜라 인코딩과 무관하다.
    """
    out: list[dict] = []
    for line in payload.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split(",")]
        if len(cols) < 5 or cols[3] != SSN_CHERRY or cols[4] != SSN_BLOOM:
            continue
        day = parse_date_cell(cols[2], int(cols[0]) if cols[0].isdigit() else None)
        if day:
            out.append(to_record(day.year, day))
    return sorted((r for r in out if sane(r)), key=lambda r: r["year"])


def fetch_apihub(key: str, start: int, end: int, dry_run: bool) -> list[dict]:
    """API허브에서 40년치를 한 번에 받는다 (연 자료라 요청 1회면 끝난다)."""
    params = {
        "stn": str(STN_ID),
        "tm1": f"{start}0101",
        "tm2": f"{end}1231",
        "authKey": key,
    }
    url = f"{APIHUB_SSN_URL}?{urllib.parse.urlencode(params)}"
    if dry_run:
        print(f"  [dry-run] {mask_url(url, key)}")
        return []
    return parse_apihub(fetch(url))


def fetch_api(key: str, start: int, end: int, dry_run: bool) -> list[dict]:
    records: list[dict] = []
    for year in range(start, end + 1):
        params = {
            "serviceKey": key, "pageNo": "1", "numOfRows": "50",
            "dataType": "JSON", "stnIds": str(STN_ID), "year": str(year),
        }
        url = f"{SEASON_URL}?{urllib.parse.urlencode(params)}"
        if dry_run:
            print(f"  [dry-run] {year} {mask_url(url, key)}")
            continue
        try:
            records.extend(parse_api(fetch(url)))
        except (json.JSONDecodeError, RuntimeError) as e:
            print(f"  {year}년 조회 실패 ({type(e).__name__}) — 건너뜀")
        time.sleep(REQUEST_PAUSE)
    return sorted(records, key=lambda r: r["year"])


# ────────────────────────────────────────────────────────── 검증

def verify_blossom(records: list[dict]) -> None:
    """실제 관측이라면 성립해야 하는 경향을 확인한다.

    부산 벚꽃은 수십 년에 걸쳐 앞당겨졌다. 부호가 반대로 나오면 개화가 아닌 다른
    현상을 긁어왔거나 연도 매칭이 어긋났다는 뜻이다 — 그냥 넘어가면 S3의 카피가
    데이터와 정반대가 된다.
    """
    if len(records) < 10:
        print("\n[자체 검증] 표본이 너무 적어 건너뜀")
        return
    head = sum(r["doy"] for r in records[:5]) / 5
    tail = sum(r["doy"] for r in records[-5:]) / 5
    span = records[-1]["year"] - records[0]["year"]
    print("\n[자체 검증]")
    print(f"  기간                : {records[0]['year']}–{records[-1]['year']} ({len(records)}개 연도)")
    print(f"  개화일 평균          : {sum(r['doy'] for r in records)/len(records):.1f} 일")
    print(f"  처음 5년 / 마지막 5년: {head:.1f} / {tail:.1f} 일")
    print(f"  변화                : {tail - head:+.1f}일 / {span}년  (앞당겨지면 음수)")
    if tail - head > 0:
        print("  ⚠️ 개화가 오히려 늦어지고 있다. 현상 코드(개화/발아)나 연도 매칭을 확인할 것.")


# ────────────────────────────────────────────────────────── 자체 점검

SAMPLE_CSV = """지점,연도,관측일
159,2019,2019-03-23
159,2020,2020.03.19
159,2021,20210318
159,2022,3월 25일
159,2023,2023-08-11
"""

SAMPLE_API = """{"response":{"body":{"items":{"item":[
 {"stnId":"159","year":"2018","gaehwaDate":"20180327"},
 {"stnId":"159","year":"2019","gaehwaDate":"20190323"}
]}}}}"""


def selftest() -> None:
    rows = parse_csv(SAMPLE_CSV)
    assert len(rows) == 4, f"4건을 기대했으나 {len(rows)}건 (8월 행은 버려져야 한다)"
    assert rows[0] == {"year": 2019, "doy": 82, "date": "2019-03-23"}, rows[0]
    assert rows[1]["date"] == "2020-03-19", rows[1]
    assert rows[2]["date"] == "2021-03-18", rows[2]
    assert rows[3]["date"] == "2022-03-25", rows[3]
    print("  CSV 파서 OK — 4가지 날짜 표기를 모두 받고, 범위 밖은 버린다")

    arows = parse_api(SAMPLE_API)
    assert [r["date"] for r in arows] == ["2018-03-27", "2019-03-23"], arows
    print("  API 파서 OK")

    # 2020년은 윤년 — doy 계산이 달력을 제대로 타는지
    assert parse_csv("연도,관측일\n2020,2020-03-01\n")[0]["doy"] == 61
    assert parse_csv("연도,관측일\n2021,2021-03-01\n")[0]["doy"] == 60
    print("  윤년 doy OK (2020-03-01 = 61일, 2021-03-01 = 60일)")

    # doy 열로 내려받은 CSV — 날짜로 되돌린 뒤 다시 doy 를 세도 같아야 한다
    doy_rows = parse_csv("year,doy\n2019,82\n2020,79\n")
    assert doy_rows[0] == {"year": 2019, "doy": 82, "date": "2019-03-23"}, doy_rows[0]
    assert doy_rows[1] == {"year": 2020, "doy": 79, "date": "2020-03-19"}, doy_rows[1]
    print("  doy 열 입력 OK")
    print("자체 점검 통과.")


# ────────────────────────────────────────────────────────── main


def main() -> None:
    ap = argparse.ArgumentParser(description="기상청 계절관측(벚꽃 개화일) → busan_blossom.json")
    ap.add_argument("--years", nargs=2, type=int, metavar=("START", "END"), default=[1985, 2024],
                    help="수집 연도 범위 (기본 1985 2024 — busan_yearly.json 과 맞춘다)")
    ap.add_argument("--dry-run", action="store_true", help="호출 없이 URL/키만 점검")
    ap.add_argument("--selftest", action="store_true", help="키 없이 파서만 점검")
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return

    records = load_csv()
    if records:
        print(f"{CSV_PATH} 를 읽었다 ({len(records)}건) — API 호출을 건너뛴다.")
        source = SOURCE_TAG + "_CSV"
    else:
        provider, key = load_key()
        print(f"키: {masked(key)} ({provider})")
        if provider == "apihub":
            # API허브 계절관측 — 키 하나로 40년치가 한 번에 온다
            records = fetch_apihub(key, args.years[0], args.years[1], args.dry_run)
        elif provider == "data.go.kr":
            records = fetch_api(key, args.years[0], args.years[1], args.dry_run)
        else:
            sys.exit(
                "계절관측은 API허브(KMA_API_KEY) 또는 공공데이터포털(DATA_GO_KR_KEY) 로 받는다.\n"
                f"둘 다 없으면 기상자료개방포털에서 CSV 를 내려 {CSV_PATH} 로 둘 것."
            )
        if args.dry_run:
            print("dry-run 종료.")
            return
        source = SOURCE_TAG

    if not records:
        sys.exit("수집된 개화일이 0건이다. --dry-run 으로 응답을 먼저 확인할 것.")

    verify_blossom(records)
    write_json(DATA_DIR / "busan_blossom.json", blossom_payload(records, source))
    print("완료.")


if __name__ == "__main__":
    main()
