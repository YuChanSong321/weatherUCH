#!/usr/bin/env python3
"""실데이터 수집기 — 기상청 단기예보 과거자료 + 기상특보 → data/busan_past_forecast.json

  ⚠️ 개발자 PC에서만 돌린다. 브라우저(배포본)는 절대 API를 호출하지 않는다.
  ⚠️ API 키는 환경변수로만 받는다. 코드·커밋·예시파일에 키를 남기지 않는다.

────────────────────────────────────────────────────────────────────────────
필요한 API 활용신청 항목  (기상청 API허브 apihub.kma.go.kr, 계정당 신청 필요)

  · 「단기예보 조회 (동네예보 구역)」            fct_afs_dl.php
      과거 발표분 조회용. tmfc1/tmfc2 로 '발표시각 범위'를 준다.
  · 「기상특보 조회 (특보 발표/해제 이력)」       wrn_met_data.php
      advisory 필드(호우주의보 등)를 채운다. 없으면 그 필드만 비고 나머지는 정상.

  공공데이터포털 대안 — 「기상청_단기예보 ((구) 동네예보) 조회서비스」.
  다만 이쪽은 최근 며칠치만 주므로 과거자료 용도로는 API허브를 쓴다.

  ⚠️ 두 엔드포인트 모두 응답 첫 줄들에 '#' 주석 헤더로 컬럼명을 싣는다. 이 스크립트는
     위치가 아니라 **컬럼명으로** 값을 찾는다 — 문서 개정으로 열 순서가 바뀌어도
     견디고, 이름이 아예 없어지면 어느 이름이 없는지 찍고 멈춘다.
────────────────────────────────────────────────────────────────────────────

사용법
    export KMA_APIHUB_KEY="발급받은키"

    python3 scripts/fetch_forecast.py --selftest    # 키 없이 파서만 점검
    python3 scripts/fetch_forecast.py --dry-run     # 호출 없이 URL/대상일 확인
    python3 scripts/fetch_forecast.py               # data/busan_daily.json 의 날짜 전부
    python3 scripts/fetch_forecast.py --years 2019 2023
    python3 scripts/fetch_forecast.py --dates-file scripts/raw/dates.txt

API 없이 채우는 길 (기상자료개방포털에서 CSV를 내려받은 경우)
    scripts/raw/busan_past_forecast.csv
        date,tmax,precipClass[,precipProb][,advisory]
        2019-07-21,29.4,heavy,80,호우주의보
    파일이 있으면 API보다 먼저 읽는다.

출력 스키마는 make_dummy_data.py 가 만드는 더미와 동일하다. 웹앱은 날짜별 조회만
하므로, 일부 날짜가 비어도 그 라운드만 조용히 2자 대결로 돌아간다.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta

from common import (  # noqa: E402
    mask_url,
    DATA_DIR,
    STATION,
    PRECIP_ORDER,
    RAW_DIR,
    REQUEST_PAUSE,
    fetch,
    forecast_payload,
    load_key,
    masked,
    precip_class_of,
    write_json,
)

FCST_URL = "https://apihub.kma.go.kr/api/typ01/url/fct_afs_dl.php"
WARN_URL = "https://apihub.kma.go.kr/api/typ01/url/wrn_met_data.php"

# 부산 육상예보구역 코드. 다른 도시로 옮길 때 여기만 바꾼다.
# (--dry-run 으로 실제 응답의 REG_ID 가 이 값인지 먼저 확인할 것)
REG_ID = "11H20201"

# 하루 두 번 나가는 발표 중 '전날 아침' 것을 쓴다. S1의 프레임이
# "어제 아침에 기상청이 낸 내일 예보"이기 때문이다.
BASE_TIME = "0500"

SOURCE_TAG = "KMA_APIHUB_FCT"

# ⚠️ 응답에는 MAN_ID(예보관 ID)와 MAN_FC(예보관 이름)가 들어 있다. 개인정보이므로
#    파싱 대상에서 제외하고 출력 JSON 에도 남기지 않는다 — 아래 select_forecasts 가
#    쓰는 컬럼은 TM_FC / TM_EF / TA / ST / PREP 뿐이다.

# 특보 코드 → 이름. wrn_met_data 의 WRN(종류) + LVL(수준) 조합이다.
# 아래 값은 응답의 help=1 설명 블록에서 직접 확인했다 (추정 아님).
WARN_KINDS = {
    "W": "강풍", "R": "호우", "C": "한파", "D": "건조", "O": "폭풍해일",
    "N": "지진해일", "V": "풍랑", "T": "태풍", "S": "대설", "Y": "황사", "H": "폭염",
}
# ⚠️ 처음에 {1:주의보, 2:경보} 로 잘못 적어두고 있었다. 실제 문서는 아래와 같고,
#    그대로 뒀으면 예비특보가 '주의보'로, 주의보가 '경보'로 한 칸씩 올라간
#    잘못된 배지가 화면에 떴을 것이다.
WARN_LEVELS = {"1": "예비", "2": "주의보", "3": "경보", "4": "중대경보"}
# 예비특보(1)는 '앞으로 나갈 수 있다'는 예고라 배지로 쓰지 않는다.
WARN_LEVELS_SHOWN = {"2", "3", "4"}
# 특보명령: 1 발표 / 2 대치 / 3 해제 / 4 대치해제 / 5 연장 / 6 변경 / 7 변경해제
WARN_CMD_START = {"1", "2", "5", "6"}

# 부산 특보구역코드 (특보는 예보구역과 다른 코드 체계를 쓴다).
#
# ⚠️ 이 코드들은 2025년에 신설됐다. 직접 확인한 사실:
#      2023년 7~8월 전국 특보 8,968건에 L10825/26/27 은 단 한 건도 없다.
#      2025년 같은 기간에는 98건 나온다. 부산·울산이 그 사이에 세분화된 것이다.
#    2019~2023 구간의 부산 특보는 부산지방기상청(STN 159)이 발표한 29개 구역 어딘가에
#    섞여 있는데, 호우는 광역이라 관측 강수로 구분되지 않고 폭염으로 갈라봐도
#    어느 구역도 해안 부산의 서명(33℃ 미달)을 보이지 않았다. 즉 그 시기에는 부산
#    단독 구역이 없었다고 보는 편이 맞다.
#    → 현재 출제 풀(2019–2023)에서는 advisory 를 비워 둔다. 화면은 배지 없이 정상
#      동작한다. 지어내는 것보다 비우는 쪽이 옳다.
BUSAN_WARN_REGIONS = ("L1082500", "L1082600", "L1082700")  # 동부/중부/서부, 2025~


# ────────────────────────────────────────────────────────── 헤더 기반 파서


def split_cells(line: str) -> list[str]:
    """콤마 구분(disp=1)이면 콤마로, 아니면 공백으로 자른다.

    콤마로 요청하는 이유가 있다. 공백 구분 응답에서는 날씨 문자열('구름많고 비')이
    한 칸을 두 칸으로 만들어 그 줄 전체의 열이 밀린다 — 조용히 틀린 값이 들어가느니
    형식을 바꾸는 쪽이 낫다.
    """
    cells = [c.strip() for c in line.split(",")] if "," in line else line.split()
    # 데이터 줄은 '…,흐리고 비,=' 처럼 종결 표시 '=' 로 끝난다. 헤더에는 없는
    # 칸이라 그대로 두면 칸 수가 하나 더 많아 전 행이 버려진다.
    while cells and cells[-1] in ("=", ""):
        cells.pop()
    return cells


def parse_apihub_table(text: str) -> list[dict[str, str]]:
    """API허브 typ01 응답(주석 헤더 + 표)을 dict 목록으로.

    헤더는 '#' 로 시작하는 줄 가운데 컬럼명이 가장 많이 늘어선 줄로 잡는다.
    데이터 줄의 칸 수가 헤더와 다르면 그 줄은 버린다 (부분 응답 방어).
    """
    header: list[str] | None = None
    rows: list[dict[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            cols = [c for c in split_cells(line.lstrip("#").strip()) if c]
            # 'START7777' 같은 제어줄은 컬럼명이 아니다
            if len(cols) >= 4 and not cols[0].upper().startswith(("START", "END", "7777")):
                if header is None or len(cols) > len(header):
                    header = cols
            continue
        if header is None:
            continue
        cells = split_cells(line)
        if len(cells) != len(header):
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def require(rows: list[dict[str, str]], names: list[str], where: str) -> None:
    """기대한 컬럼명이 응답에 있는지 확인한다. 없으면 무엇이 없는지 찍고 멈춘다."""
    if not rows:
        sys.exit(f"{where}: 파싱된 행이 0건이다. --dry-run 으로 응답 원문을 먼저 확인할 것.")
    missing = [n for n in names if n not in rows[0]]
    if missing:
        sys.exit(
            f"{where}: 컬럼 {missing} 이(가) 응답에 없다.\n"
            f"  실제 컬럼: {sorted(rows[0])}\n"
            f"  API 문서 개정으로 이름이 바뀌었을 수 있다 — 위 목록을 보고 매핑을 고칠 것."
        )


def num(v: str) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    # API허브는 결측을 -99 / -999 로 준다
    return None if f <= -90 else f


# ────────────────────────────────────────────────────────── 예보 정규화


def to_forecast(target: date, base: date, tmax: float, precip_class: str,
                prob: float | None, source: str) -> dict:
    rec = {
        "date": target.isoformat(),
        "baseDate": base.isoformat(),
        "baseTime": BASE_TIME,
        "tmax": round(tmax, 1),
        "precipClass": precip_class,
        "_source": source,
    }
    if prob is not None:
        rec["precipProb"] = int(round(prob))
    return rec


def class_from_forecast(prob: float | None, amount: float | None, form: str | None) -> str:
    """예보에서 강수 '등급'을 만든다.

    ⚠️ PRE 는 강수'량'이 아니라 강수'형태' 코드다 (0 없음 / 1 비 / 2 비·눈 / 3 눈 /
    4 소나기). 이걸 mm 로 읽으면 비 예보가 전부 '약한 비 1mm'가 되어 3자 대결이
    조용히 거짓말을 한다 — 그래서 양은 RN 에서만 읽고, PRE 는 '비가 오는가'에만 쓴다.

    양이 있으면 관측과 같은 경계(precip_class_of)를 쓴다. 경계를 S1 채점과 다르게
    잡으면 기상청만 불리해지거나 유리해진다.
    """
    if form is not None and form.strip() in {"0", "-9", "-99"}:
        return "none"
    if amount is not None:
        return precip_class_of(amount)
    if prob is None:
        return "none"
    return "none" if prob < 30 else "light" if prob < 60 else "rain"


def parse_amount(raw: str | None) -> float | None:
    """'5~10mm', '30~50', '1 미만' 같은 표기에서 대표값을 뽑는다."""
    if not raw:
        return None
    s = raw.replace("mm", "").replace("미만", "").strip()
    if not s or s in {"-", "강수없음", "적은量"}:
        return None
    parts = [p for p in s.replace("~", " ").split() if p.replace(".", "", 1).isdigit()]
    if not parts:
        return None
    vals = [float(p) for p in parts]
    return sum(vals) / len(vals)


# ────────────────────────────────────────────────────────── 수집


def month_chunks(days: list[date]) -> list[tuple[date, date]]:
    """발표시각 범위 조회는 한 달씩 끊는다 (날짜당 1회씩 부르면 쿼터가 남지 않는다)."""
    out: list[tuple[date, date]] = []
    seen: set[tuple[int, int]] = set()
    for d in days:
        key = (d.year, d.month)
        if key in seen:
            continue
        seen.add(key)
        first = date(d.year, d.month, 1)
        nxt = date(d.year + (d.month == 12), (d.month % 12) + 1, 1)
        out.append((first, nxt - timedelta(days=1)))
    return sorted(out)


def select_forecasts(rows: list[dict[str, str]], wanted: set[date],
                     into: dict[date, dict]) -> None:
    """응답 행에서 '전날 05시 발표 · 대상일 낮' 예보만 골라 into 에 채운다.

    네트워크를 타지 않는 순수 함수라 selftest 가 이 로직 자체를 검증한다 —
    수집 스크립트에서 조용히 틀리기 가장 쉬운 곳이 바로 이 필터다.
    """
    prob_col = next((c for c in ("RN_ST", "ST", "POP") if c in rows[0]), None)
    # 강수'량' 열만. PRE/PREP 는 형태 코드이므로 여기 넣으면 안 된다 (위 주석 참고)
    amount_col = next((c for c in ("RN", "PCP", "RN_AMT") if c in rows[0]), None)
    form_col = next((c for c in ("PRE", "PREP", "PTY") if c in rows[0]), None)

    for r in rows:
        try:
            tm_fc = datetime.strptime(r["TM_FC"][:12], "%Y%m%d%H%M")
            tm_ef = datetime.strptime(r["TM_EF"][:12], "%Y%m%d%H%M")
        except ValueError:
            continue
        target = tm_ef.date()
        if target not in wanted:
            continue
        # '전날 05시 발표'만 남긴다
        if tm_fc.date() != target - timedelta(days=1):
            continue
        if tm_fc.strftime("%H%M") != BASE_TIME:
            continue
        ta = num(r["TA"])
        if ta is None:
            continue
        # 하루에 여러 예보시각이 오면 높은 쪽(낮 기온)을 최고기온으로 본다
        prev = into.get(target)
        if prev and prev["tmax"] >= ta:
            continue
        prob = num(r[prob_col]) if prob_col else None
        amount = parse_amount(r.get(amount_col)) if amount_col else None
        form = r.get(form_col) if form_col else None
        into[target] = to_forecast(
            target, tm_fc.date(), ta,
            class_from_forecast(prob, amount, form), prob, "kma",
        )


def fetch_forecasts(key: str, targets: list[date], dry_run: bool) -> list[dict]:
    """대상일들의 '전날 05시 발표' 예보를 모은다."""
    wanted = set(targets)
    by_date: dict[date, dict] = {}

    for start, end in month_chunks(targets):
        # 발표시각 범위: 대상 월의 하루 전부터 (전날 발표를 잡아야 하므로)
        tmfc1 = (start - timedelta(days=1)).strftime("%Y%m%d") + BASE_TIME
        tmfc2 = end.strftime("%Y%m%d") + BASE_TIME
        params = {
            "reg": REG_ID, "tmfc1": tmfc1, "tmfc2": tmfc2,
            "disp": "1", "help": "1", "authKey": key,
        }
        url = f"{FCST_URL}?{urllib.parse.urlencode(params)}"
        if dry_run:
            safe = mask_url(url, key)
            print(f"  [dry-run] {start:%Y-%m} {safe}")
            continue

        rows = parse_apihub_table(fetch(url))
        require(rows, ["TM_FC", "TM_EF", "TA"], "단기예보(fct_afs_dl)")
        select_forecasts(rows, wanted, by_date)
        time.sleep(REQUEST_PAUSE)

    return [by_date[d] for d in sorted(by_date)]


def fetch_advisories(key: str, targets: list[date], dry_run: bool) -> dict[str, dict]:
    """날짜 → {kind, headline}. 특보 API를 못 쓰면 빈 dict (선택 필드이므로 괜찮다)."""
    if not targets:
        return {}
    params = {
        # 특보는 예보구역(REG_ID)이 아니라 특보구역 코드를 쓴다. 위 주석 참고.
        "reg": ",".join(BUSAN_WARN_REGIONS),
        "tmfc1": min(targets).strftime("%Y%m%d") + "0000",
        "tmfc2": max(targets).strftime("%Y%m%d") + "2359",
        "disp": "1", "help": "1", "authKey": key,
    }
    url = f"{WARN_URL}?{urllib.parse.urlencode(params)}"
    if dry_run:
        print(f"  [dry-run] 특보 {mask_url(url, key)}")
        return {}

    try:
        rows = parse_apihub_table(fetch(url))
    except RuntimeError as e:
        print(f"  특보 조회 실패 ({e}) — advisory 필드는 비운다")
        return {}
    if not rows or "WRN" not in rows[0]:
        print("  특보 응답에 WRN 컬럼이 없다 — advisory 필드는 비운다")
        return {}

    wanted = {d.isoformat() for d in targets}
    out: dict[str, dict] = {}
    for r in rows:
        kind = WARN_KINDS.get(r.get("WRN", ""))
        lvl = r.get("LVL", "")
        if not kind or lvl not in WARN_LEVELS_SHOWN:
            continue  # 예비특보와 알 수 없는 수준은 배지로 쓰지 않는다
        if r.get("CMD", "") not in WARN_CMD_START:
            continue  # 해제 레코드는 '발효'가 아니다
        level = WARN_LEVELS[lvl]
        # 발효(TM_EF)부터 해제(TM_FC/TM_IN)까지 걸친 날 전부에 붙인다
        try:
            start = datetime.strptime(r["TM_EF"][:8], "%Y%m%d").date()
        except (KeyError, ValueError):
            continue
        end_raw = r.get("TM_IN") or r.get("TM_FC") or r["TM_EF"]
        try:
            end = datetime.strptime(end_raw[:8], "%Y%m%d").date()
        except ValueError:
            end = start
        d = start
        while d <= max(end, start) and (d - start).days <= 7:
            iso = d.isoformat()
            if iso in wanted:
                # 같은 날 여러 특보면 먼저 발효된 것을 남긴다
                out.setdefault(iso, {"kind": f"{kind}{level}", "headline": f"{kind}{level} 발효"})
            d += timedelta(days=1)
    return out


# ────────────────────────────────────────────────────────── CSV 폴백

CSV_PATH = RAW_DIR / "busan_past_forecast.csv"


def load_csv() -> list[dict] | None:
    if not CSV_PATH.exists():
        return None
    out: list[dict] = []
    with CSV_PATH.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            target = date.fromisoformat(row["date"].strip())
            cls = row["precipClass"].strip()
            if cls not in PRECIP_ORDER:
                sys.exit(f"{CSV_PATH}: precipClass '{cls}' 는 {PRECIP_ORDER} 중 하나여야 한다")
            rec = to_forecast(
                target, target - timedelta(days=1), float(row["tmax"]), cls,
                float(row["precipProb"]) if row.get("precipProb") else None, "kma",
            )
            if row.get("advisory", "").strip():
                kind = row["advisory"].strip()
                rec["advisory"] = {"kind": kind, "headline": f"{kind} 발효"}
            out.append(rec)
    return sorted(out, key=lambda r: r["date"])


# ────────────────────────────────────────────────────────── 대상일


def target_dates(args: argparse.Namespace) -> list[date]:
    if args.dates_file:
        text = open(args.dates_file, encoding="utf-8").read().split()
        return sorted({date.fromisoformat(t) for t in text})

    daily_path = DATA_DIR / "busan_daily.json"
    if not daily_path.exists():
        sys.exit(f"{daily_path} 가 없다. --dates-file 로 대상일 목록을 직접 줄 것.")
    records = json.loads(daily_path.read_text(encoding="utf-8"))["records"]
    days = [date.fromisoformat(r["date"]) for r in records]
    if args.years:
        lo, hi = args.years
        days = [d for d in days if lo <= d.year <= hi]
    # 첫날은 '전날 발표'가 없으므로 대상에서 뺀다
    return days[1:]


# ────────────────────────────────────────────────────────── 자체 점검

# disp=1 (콤마 구분) 응답 형식. WF 같은 텍스트 열에 공백이 들어가도 열이 밀리지 않는다.
SAMPLE_FCST = """#START7777
# REG_ID, TM_FC, TM_EF, MOD, NE, STN, C, SKY, PRE, WF, TA, ST, RN_ST
 11H20201, 201907200500, 201907210600, A02, 0, 159, 0, 4, 1, 흐리고 비, 29.4, 1, 80
 11H20201, 201907200500, 201907211200, A02, 0, 159, 0, 4, 1, 흐리고 비, 31.2, 1, 80
 11H20201, 201907210500, 201907221200, A02, 0, 159, 0, 1, 0, 맑음, 30.1, 1, 20
#7777END
"""

SAMPLE_WARN = """#START7777
# REG_ID, WRN, LVL, CMD, TM_FC, TM_EF, TM_IN
 11H20201, R, 1, 3, 201907210430, 201907210600, 201907212100
#7777END
"""


def selftest() -> None:
    rows = parse_apihub_table(SAMPLE_FCST)
    assert len(rows) == 3, f"3행을 기대했으나 {len(rows)}건"
    require(rows, ["TM_FC", "TM_EF", "TA"], "selftest")
    assert rows[0]["TA"] == "29.4" and rows[1]["RN_ST"] == "80", rows[0]

    # 같은 대상일에 두 예보시각이 오면 높은 쪽(낮 기온)이 남고,
    # 대상일 목록에 없는 7/22 는 걸러져야 한다
    picked: dict[date, dict] = {}
    select_forecasts(rows, {date(2019, 7, 21)}, picked)
    assert set(picked) == {date(2019, 7, 21)}, sorted(picked)
    got = picked[date(2019, 7, 21)]
    assert got["tmax"] == 31.2, got
    assert got["baseDate"] == "2019-07-20" and got["baseTime"] == "0500", got
    assert got["precipClass"] == "rain" and got["precipProb"] == 80, got

    assert class_from_forecast(80, 35.0, "1") == "heavy"
    assert class_from_forecast(80, None, "1") == "rain"
    assert class_from_forecast(10, None, "0") == "none"
    # PRE 를 강수량으로 오독하면 여기서 'light' 가 나온다 (형태 코드 1 = 비)
    assert class_from_forecast(80, None, "1") != "light"
    assert class_from_forecast(80, None, "0") == "none", "형태 0(강수없음)이 확률보다 우선"
    assert parse_amount("30~50mm") == 40.0
    assert parse_amount("강수없음") is None

    wrows = parse_apihub_table(SAMPLE_WARN)
    assert wrows and wrows[0]["WRN"] == "R" and wrows[0]["LVL"] == "1", wrows
    # LVL 은 1=예비, 2=주의보, 3=경보 다 (문서 확인). 1 을 주의보로 읽던 버그의 회귀 방지.
    assert WARN_KINDS["R"] + WARN_LEVELS["2"] == "호우주의보", WARN_LEVELS
    assert WARN_LEVELS["1"] == "예비" and "1" not in WARN_LEVELS_SHOWN

    print("  헤더 기반 파서 OK — 컬럼명으로 값을 찾는다 (열 순서 무관)")
    print("  강수 등급 경계가 관측(precip_class_of)과 같은지 확인 OK")
    print("자체 점검 통과.")


# ────────────────────────────────────────────────────────── main


def main() -> None:
    ap = argparse.ArgumentParser(description="기상청 단기예보 과거자료 → busan_past_forecast.json")
    ap.add_argument("--years", nargs=2, type=int, metavar=("START", "END"),
                    help="대상 연도 범위 (기본: busan_daily.json 의 전 기간)")
    ap.add_argument("--dates-file", help="대상일 목록 파일 (한 줄에 YYYY-MM-DD)")
    ap.add_argument("--dry-run", action="store_true", help="호출 없이 URL/대상일만 점검")
    ap.add_argument("--selftest", action="store_true", help="키 없이 파서만 점검")
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return

    csv_rows = load_csv()
    if csv_rows:
        print(f"{CSV_PATH} 를 읽었다 ({len(csv_rows)}건) — API 호출을 건너뛴다.")
        write_json(DATA_DIR / "busan_past_forecast.json", forecast_payload(csv_rows, SOURCE_TAG + "_CSV"))
        return

    targets = target_dates(args)
    print(f"대상일 {len(targets)}일 ({targets[0]} ~ {targets[-1]}), 예보구역 {REG_ID}")

    provider, key = load_key()
    if provider != "apihub":
        sys.exit("이 스크립트는 기상청 API허브 전용이다. KMA_APIHUB_KEY 를 설정할 것.")
    print(f"키: {masked(key)}")

    records = fetch_forecasts(key, targets, args.dry_run)
    advisories = fetch_advisories(key, targets, args.dry_run)
    if args.dry_run:
        print("dry-run 종료. 위 URL 하나를 브라우저에 넣어 컬럼명을 눈으로 확인할 것.")
        return

    for r in records:
        adv = advisories.get(r["date"])
        if adv:
            r["advisory"] = adv

    covered = len(records) / max(1, len(targets)) * 100
    print(f"\n수집 {len(records)}건 / 대상 {len(targets)}일 ({covered:.0f}% 커버)")
    print(f"기상특보 발효일 {sum(1 for r in records if 'advisory' in r)}일")
    if covered < 60:
        print("⚠️ 커버리지가 낮다. 빠진 날은 웹앱에서 3자 대결이 빠진 채로 진행된다.")

    payload = forecast_payload(records, SOURCE_TAG)
    # 앱의 출처 표기 화면이 읽는 필드 (Attribution.tsx). 빠뜨리면 '확인 필요'로 뜬다.
    payload["meta"].update({
        "_source": "KMA API Hub",
        "_provider": "기상청",
        "_dataset": "단기예보 과거자료(fct_afs_dl)"
                    + (" + 기상특보 이력(wrn_met_data)" if advisories else ""),
        "_station": STATION,
        "_fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "_license": "공공누리 제1유형 (출처표시)",
    })
    if not advisories:
        payload["meta"]["_advisory_note"] = (
            "부산 단독 특보구역(L10825~27)은 2025년 신설이라 이 기간에는 존재하지 않는다. "
            "지어내지 않고 비워 둔다 — docs/DATA_AVAILABILITY.md 참고."
        )
    write_json(DATA_DIR / "busan_past_forecast.json", payload)
    print("완료.")


if __name__ == "__main__":
    main()
