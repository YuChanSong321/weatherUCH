#!/usr/bin/env python3
"""직접 내려받은 파일 → /data JSON 교체.

기상청 API허브·기상자료개방포털은 **로그인 없이 자료를 주지 않는다.** 데이터
엔드포인트는 키 없이 호출하면 전부 `401 유효한 인증키가 아닙니다` 를 돌려주고,
웹 화면의 조회·다운로드도 같은 로그인을 쓴다. 그래서 자료를 사람이 직접 받아오는
경로가 필요하고, 이 스크립트가 그 파일들을 앱 스키마로 바꾼다.

  API 키가 있다면 fetch_*.py 로 자동 수집하는 편이 낫다. 이 스크립트는
  "웹에서 손으로 받아온 파일"을 위한 것이다. 둘의 출력 스키마는 같다.

────────────────────────────────────────────────────────────────────────────
쓰는 법

  1) scripts/raw/ 에 받은 파일을 아래 이름으로 넣는다 (확장자는 무관)

       asos_daily.*     지상관측 > 종관기상관측(ASOS) 일자료 · 부산 · 3~5개 연도
       yearly.*         기후통계 연자료 (없으면 asos_daily 에서 집계)
       normals.*        기후통계 월 평년값 1991–2020 (없으면 asos_daily 에서 집계)
       forecast.*       예·특보 > 단기예보 과거자료
       warning.*        예·특보 > 기상특보 이력       (forecast 에 합쳐진다)
       blossom.*        지상관측 > 계절관측 (왕벚나무 개화)
       ssp.*            기후변화정보포털 SSP 전망     (API허브 소관 아님)

  2) python3 scripts/ingest_raw.py
  3) python3 scripts/sanity_check.py

받은 파일이 일부뿐이어도 된다. 있는 것만 교체하고 나머지는 그대로 둔다.
────────────────────────────────────────────────────────────────────────────

형식은 자동으로 가려낸다.
  · API허브 응답 그대로(`#` 주석 헤더 + 공백/콤마 구분)
  · 기상자료개방포털 CSV (한글 헤더)
어느 쪽이든 **컬럼 이름으로** 값을 찾으므로 열 순서가 달라도 견딘다.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

from common import (  # noqa: E402
    DATA_DIR,
    RAW_DIR,
    SCHEMA_VERSION,
    STATION,
    DAILY_UNITS,
    advisory_for,
    baseline_from_yearly,
    blossom_payload,
    forecast_payload,
    monthly_from_daily,
    normals_from_daily,
    precip_class_of,
    ssp_scenarios,
    verify,
    wind_dir_label,
    wind_family,
    write_json,
    yearly_from_daily,
)

KST = timezone(timedelta(hours=9))
PROVIDER = "기상청"
LICENSE = "공공누리 제1유형 (출처표시)"


def now_kst() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def meta(dataset: str, extra: dict | None = None) -> dict:
    """앱의 출처 표기 화면이 그대로 읽는 필드들 (Attribution.tsx)."""
    m = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "KMA_MANUAL_DOWNLOAD",
        "_source": "KMA API Hub",
        "_provider": PROVIDER,
        "_dataset": dataset,
        "_station": STATION,
        "_fetched_at": now_kst(),
        "_license": LICENSE,
        "_note": "apihub.kma.go.kr 에서 직접 내려받아 ingest_raw.py 로 변환",
    }
    if extra:
        m.update(extra)
    return m


# ───────────────────────────────────────────────── 입력 파일 찾기


def find(stem: str):
    """scripts/raw/<stem>.* 중 첫 번째 파일."""
    if not RAW_DIR.exists():
        return None
    hits = sorted(p for p in RAW_DIR.glob(f"{stem}.*") if p.is_file())
    return hits[0] if hits else None


def read(path) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


# ───────────────────────────────────────────────── 범용 표 파서


def as_rows(text: str) -> list[dict[str, str]]:
    """API허브 텍스트든 포털 CSV든 dict 목록으로.

    API허브: '#' 로 시작하는 줄 중 컬럼명이 가장 많은 줄을 헤더로 본다.
    CSV    : 첫 비주석 줄을 헤더로 본다.
    """
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    hashed = [ln for ln in lines if ln.startswith("#")]
    body = [ln for ln in lines if not ln.startswith("#")]

    def split(ln: str) -> list[str]:
        return [c.strip() for c in ln.split(",")] if "," in ln else ln.split()

    header: list[str] | None = None
    for ln in hashed:
        cols = [c for c in split(ln.lstrip("#").strip()) if c]
        if len(cols) >= 4 and not cols[0].upper().startswith(("START", "END", "7777")):
            if header is None or len(cols) > len(header):
                header = [c.upper() for c in cols]
    if header is None and body:
        header = [c.upper() for c in split(body[0])]
        body = body[1:]

    rows = []
    for ln in body:
        cells = split(ln)
        if header and len(cells) == len(header):
            rows.append(dict(zip(header, cells)))
    return rows


def pick(row: dict[str, str], *names: str) -> str | None:
    """여러 후보 컬럼명 중 먼저 존재하는 값. 대소문자·공백 무시."""
    norm = {k.strip().upper().replace(" ", ""): v for k, v in row.items()}
    for n in names:
        v = norm.get(n.upper().replace(" ", ""))
        if v not in (None, "", "-"):
            return v
    return None


def num(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        f = float(str(v).replace(",", ""))
    except ValueError:
        return None
    return None if f <= -90 else f  # API허브 결측: -9, -99, -999


def as_day(v: str | None) -> date | None:
    if not v:
        return None
    s = str(v).strip().replace(".", "-").replace("/", "-").replace(" ", "")
    digits = s.replace("-", "")[:8]
    if len(digits) == 8 and digits.isdigit():
        try:
            return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
        except ValueError:
            return None
    return None


# ───────────────────────────────────────────────── 일별 관측

# 왼쪽이 API허브 코드, 오른쪽이 포털 CSV 한글 헤더.
DAILY_COLS = {
    "date": ("TM", "일시", "날짜", "관측일"),
    "tavg": ("TA_AVG", "평균기온(°C)", "평균기온"),
    "tmax": ("TA_MAX", "최고기온(°C)", "최고기온"),
    "tmin": ("TA_MIN", "최저기온(°C)", "최저기온"),
    "precip": ("RN_DAY", "일강수량(mm)", "강수량(mm)", "일강수량"),
    "humidity": ("HM_AVG", "평균상대습도(%)", "평균습도"),
    "pressure": ("PS_AVG", "평균해면기압(hPa)", "평균해면기압"),
    "windDeg": ("WD_AVG", "WD_MAX", "평균풍향(16방위)", "최대풍향"),
    "windSpeed": ("WS_AVG", "평균풍속(m/s)", "평균풍속"),
    "cloud": ("CA_TOT", "평균전운량(1/10)", "평균전운량"),
}


def ingest_daily(path) -> list[dict] | None:
    rows = as_rows(read(path))
    if not rows:
        print(f"  ✗ {path.name}: 표를 읽지 못했다")
        return None

    out, skipped = [], 0
    for r in rows:
        day = as_day(pick(r, *DAILY_COLS["date"]))
        tmax = num(pick(r, *DAILY_COLS["tmax"]))
        tmin = num(pick(r, *DAILY_COLS["tmin"]))
        if day is None or tmax is None or tmin is None:
            skipped += 1
            continue
        tavg = num(pick(r, *DAILY_COLS["tavg"]))
        deg = num(pick(r, *DAILY_COLS["windDeg"])) or 0.0
        out.append({
            "date": day.isoformat(),
            "tavg": round(tavg if tavg is not None else (tmax + tmin) / 2, 1),
            "tmax": round(tmax, 1),
            "tmin": round(tmin, 1),
            "precip": round(num(pick(r, *DAILY_COLS["precip"])) or 0.0, 1),
            "humidity": round(num(pick(r, *DAILY_COLS["humidity"])) or 0.0),
            "pressure": round(num(pick(r, *DAILY_COLS["pressure"])) or 1013.0, 1),
            "windDeg": round(deg),
            "windDir": wind_dir_label(deg),
            "windFamily": wind_family(deg),
            "windSpeed": round(num(pick(r, *DAILY_COLS["windSpeed"])) or 0.0, 1),
            "cloud": round(num(pick(r, *DAILY_COLS["cloud"])) or 0.0, 1),
        })
    out.sort(key=lambda r: r["date"])
    print(f"  ✓ {path.name}: {len(out)}일" + (f" (건너뜀 {skipped}행)" if skipped else ""))
    return out or None


# ───────────────────────────────────────────────── 연평균 / 평년값


def ingest_yearly(path) -> list[dict] | None:
    rows = as_rows(read(path))
    out = []
    for r in rows:
        y = pick(r, "YEAR", "연도", "년도", "TM")
        t = num(pick(r, "TA_AVG", "평균기온(°C)", "평균기온", "연평균기온"))
        if not y or t is None:
            continue
        ys = str(y)[:4]
        if not ys.isdigit():
            continue
        out.append({
            "year": int(ys),
            "tavg": round(t, 2),
            "tmaxMean": round(num(pick(r, "TA_MAX_AVG", "평균최고기온(°C)", "평균최고기온")) or t + 4.4, 2),
            "tminMean": round(num(pick(r, "TA_MIN_AVG", "평균최저기온(°C)", "평균최저기온")) or t - 4.2, 2),
            "precip": round(num(pick(r, "RN_SUM", "강수량(mm)", "연강수량")) or 0.0, 1),
            "fromDaily": False,
        })
    out.sort(key=lambda r: r["year"])
    print(f"  ✓ {path.name}: {len(out)}개 연도")
    return out or None


def ingest_normals(path) -> list[dict] | None:
    rows = as_rows(read(path))
    out = []
    for r in rows:
        m = pick(r, "MONTH", "월", "TM")
        if not m:
            continue
        ms = "".join(ch for ch in str(m) if ch.isdigit())[-2:] or str(m)
        if not ms.isdigit() or not 1 <= int(ms) <= 12:
            continue
        tavg = num(pick(r, "TA_AVG", "평균기온(°C)", "평균기온"))
        tmax = num(pick(r, "TA_MAX", "평균최고기온(°C)", "최고기온"))
        tmin = num(pick(r, "TA_MIN", "평균최저기온(°C)", "최저기온"))
        if tavg is None:
            continue
        tmax = tmax if tmax is not None else tavg + 4.4
        tmin = tmin if tmin is not None else tavg - 4.2
        out.append({
            "month": int(ms),
            "tavg": round(tavg, 1),
            "tmax": round(tmax, 1),
            "tmin": round(tmin, 1),
            "dtr": round(tmax - tmin, 1),
            "precip": round(num(pick(r, "RN_SUM", "강수량(mm)", "월강수량")) or 0.0, 1),
            "humidity": round(num(pick(r, "HM_AVG", "평균상대습도(%)", "평균습도")) or 0),
        })
    out.sort(key=lambda r: r["month"])
    print(f"  ✓ {path.name}: {len(out)}개월")
    return out or None


# ───────────────────────────────────────────────── 예보 / 특보


def ingest_forecast(path, daily: list[dict]) -> list[dict] | None:
    """단기예보 과거자료 → 대상일별 '전날 발표' 최고기온·강수 등급."""
    rows = as_rows(read(path))
    by_date: dict[date, dict] = {}
    for r in rows:
        tm_fc = as_day(pick(r, "TM_FC", "발표시각", "발표일"))
        tm_ef = as_day(pick(r, "TM_EF", "예보시각", "예보일"))
        ta = num(pick(r, "TA", "기온", "최고기온"))
        if tm_fc is None or tm_ef is None or ta is None:
            continue
        if tm_fc != tm_ef - timedelta(days=1):
            continue  # '전날 발표'만
        prev = by_date.get(tm_ef)
        if prev and prev["tmax"] >= ta:
            continue  # 같은 날 여러 예보시각이면 높은 쪽(낮 기온)
        prob = num(pick(r, "RN_ST", "ST", "강수확률"))
        by_date[tm_ef] = {
            "date": tm_ef.isoformat(),
            "baseDate": tm_fc.isoformat(),
            "baseTime": "0500",
            "tmax": round(ta, 1),
            "precipClass": (
                "none" if prob is None or prob < 30
                else "light" if prob < 60 else "rain"
            ),
            **({"precipProb": int(round(prob))} if prob is not None else {}),
            "_source": "kma",
        }
    out = [by_date[d] for d in sorted(by_date)]
    obs = {r["date"] for r in daily}
    cover = sum(1 for r in out if r["date"] in obs) / max(1, len(obs)) * 100
    print(f"  ✓ {path.name}: {len(out)}건 (관측 대비 {cover:.0f}% 커버)")
    return out or None


def ingest_warnings(path, forecasts: list[dict], daily: list[dict]) -> int:
    """기상특보 이력 → 예보 레코드의 advisory 필드."""
    kinds = {"W": "강풍", "R": "호우", "C": "한파", "D": "건조", "O": "폭풍해일",
             "N": "지진해일", "V": "풍랑", "T": "태풍", "S": "대설", "Y": "황사", "H": "폭염"}
    levels = {"1": "주의보", "2": "경보"}
    by_date: dict[str, dict] = {}
    for r in as_rows(read(path)):
        wrn = pick(r, "WRN", "특보종류")
        lvl = pick(r, "LVL", "특보급")
        start = as_day(pick(r, "TM_EF", "발효시각", "시작"))
        if not start:
            continue
        name = (kinds.get(str(wrn), str(wrn or "")) + levels.get(str(lvl), str(lvl or ""))) or None
        if not name:
            continue
        end = as_day(pick(r, "TM_IN", "해제시각", "종료")) or start
        d = start
        while d <= max(end, start) and (d - start).days <= 7:
            by_date.setdefault(d.isoformat(), {"kind": name, "headline": f"{name} 발효"})
            d += timedelta(days=1)
    n = 0
    for f in forecasts:
        adv = by_date.get(f["date"])
        if adv:
            f["advisory"] = adv
            n += 1
    print(f"  ✓ {path.name}: 특보 발효일 {len(by_date)}일 → 예보 {n}건에 부착")
    return n


# ───────────────────────────────────────────────── 벚꽃 / SSP


def ingest_blossom(path) -> list[dict] | None:
    out = []
    for r in as_rows(read(path)):
        day = as_day(pick(r, "TM", "관측일", "현상일", "일자", "DATE"))
        y = pick(r, "YEAR", "연도", "년도")
        if day is None:
            continue
        year = int(str(y)[:4]) if y and str(y)[:4].isdigit() else day.year
        doy = day.timetuple().tm_yday
        if not 45 <= doy <= 135:  # 개화가 아닌 현상(발아·만개)이 섞여 오면 버린다
            continue
        out.append({"year": year, "doy": doy, "date": day.isoformat()})
    out.sort(key=lambda r: r["year"])
    print(f"  ✓ {path.name}: {len(out)}개 연도")
    return out or None


def ingest_ssp(path, baseline: float) -> list[dict] | None:
    """scenario,year,tavg[,low,high] CSV → 시나리오 3종."""
    spec = {
        "ssp126": ("SSP1-2.6", "탄소중립에 가까운 저배출 경로", "#3987e5"),
        "ssp245": ("SSP2-4.5", "현재 정책이 완만히 이어지는 중간 경로", "#c98500"),
        "ssp585": ("SSP5-8.5", "화석연료에 계속 의존하는 고배출 경로", "#d55181"),
    }
    buckets: dict[str, list[dict]] = {k: [] for k in spec}
    for r in csv.DictReader(io.StringIO(read(path))):
        sid = (r.get("scenario") or r.get("시나리오") or "").strip().lower().replace("-", "").replace(".", "")
        sid = {"ssp126": "ssp126", "ssp245": "ssp245", "ssp585": "ssp585"}.get(sid)
        if not sid:
            continue
        try:
            year = int(str(r.get("year") or r.get("연도")).strip())
            tavg = float(str(r.get("tavg") or r.get("평균기온")).strip())
        except (TypeError, ValueError):
            continue
        low = r.get("low") or r.get("하한")
        high = r.get("high") or r.get("상한")
        buckets[sid].append({
            "year": year,
            "anomaly": round(tavg - baseline, 2),
            "tavg": round(tavg, 2),
            "low": round(float(low) if low else tavg - 0.5, 2),
            "high": round(float(high) if high else tavg + 0.5, 2),
        })
    out = []
    for sid, (label, desc, color) in spec.items():
        pts = sorted(buckets[sid], key=lambda p: p["year"])
        if not pts:
            print(f"  ✗ {path.name}: {label} 행이 없다")
            return None
        out.append({"id": sid, "label": label, "description": desc, "color": color, "points": pts})
    print(f"  ✓ {path.name}: 시나리오 3종 · {len(out[0]['points'])}개 시점")
    return out


# ───────────────────────────────────────────────── main


def main() -> None:
    ap = argparse.ArgumentParser(description="직접 받은 파일 → /data JSON 교체")
    ap.add_argument("--dry-run", action="store_true", help="쓰지 않고 무엇이 바뀔지만 본다")
    args = ap.parse_args()

    print(f"입력 폴더: {RAW_DIR.relative_to(RAW_DIR.parent.parent)}/")
    if not RAW_DIR.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        print("  (없어서 만들었다. 받은 파일을 여기에 넣고 다시 실행할 것)")

    found = {stem: find(stem) for stem in
             ("asos_daily", "yearly", "normals", "forecast", "warning", "blossom", "ssp")}
    present = {k: v for k, v in found.items() if v}
    if not present:
        print("\n넣을 파일이 없다. docs/DATA_AVAILABILITY.md 의 다운로드 절차를 참고할 것.")
        for stem in found:
            print(f"    scripts/raw/{stem}.*")
        return

    print(f"\n발견한 파일 {len(present)}개:")
    writes: list[tuple[str, dict]] = []

    daily = ingest_daily(present["asos_daily"]) if "asos_daily" in present else None
    if daily:
        writes.append(("busan_daily.json", {
            "meta": meta("종관기상관측(ASOS) 일자료", {
                "years": sorted({int(r["date"][:4]) for r in daily}),
                "count": len(daily), "units": DAILY_UNITS,
            }),
            "records": daily,
            "monthlySeries": monthly_from_daily(daily),
        }))

    yearly = ingest_yearly(present["yearly"]) if "yearly" in present else None
    if not yearly and daily:
        agg = yearly_from_daily(daily)
        yearly = [{"year": y, **v, "fromDaily": True} for y, v in sorted(agg.items())]
        print(f"  · yearly.* 가 없어 일자료에서 집계했다 ({len(yearly)}개 연도)")
    if yearly:
        writes.append(("busan_yearly.json", {
            "meta": meta("기후통계 연자료", {"period": f"{yearly[0]['year']}-{yearly[-1]['year']}"}),
            "records": yearly,
        }))

    normals = ingest_normals(present["normals"]) if "normals" in present else None
    if not normals and daily:
        normals = normals_from_daily(daily)
        print(f"  · normals.* 가 없어 일자료에서 집계했다 ({len(normals)}개월)")
    if normals:
        writes.append(("busan_monthly.json", {
            "meta": meta("기후통계 월 평년값", {"period": "1991-2020"}),
            "normals": normals,
        }))

    forecasts = None
    if "forecast" in present:
        forecasts = ingest_forecast(present["forecast"], daily or [])
        if forecasts and "warning" in present:
            ingest_warnings(present["warning"], forecasts, daily or [])
        elif forecasts:
            # 특보 이력이 없으면 관측에서 근사한다 (선택 필드라 없어도 된다)
            obs = {r["date"]: r for r in (daily or [])}
            n = 0
            for f in forecasts:
                adv = advisory_for(obs[f["date"]]) if f["date"] in obs else None
                if adv:
                    f["advisory"] = adv
                    n += 1
            if n:
                print(f"  · warning.* 가 없어 관측에서 특보를 근사했다 ({n}건)")
    if forecasts:
        p = forecast_payload(forecasts, "KMA_MANUAL_DOWNLOAD")
        p["meta"].update(meta("단기예보 과거자료 + 기상특보 이력"))
        p["meta"]["count"] = len(forecasts)
        writes.append(("busan_past_forecast.json", p))

    blossom = ingest_blossom(present["blossom"]) if "blossom" in present else None
    if blossom:
        p = blossom_payload(blossom, "KMA_MANUAL_DOWNLOAD")
        p["meta"].update(meta("계절관측(생물계절) · 왕벚나무 개화"))
        writes.append(("busan_blossom.json", p))

    if "ssp" in present and yearly:
        base = baseline_from_yearly(yearly)
        sc = ingest_ssp(present["ssp"], base)
        if sc:
            writes.append(("future_ssp.json", {
                "meta": {
                    **meta("남한상세 기후변화 시나리오 · 경상권 연평균기온"),
                    "source": "MANUAL_CCIC",
                    "_source": "manual (기후변화정보포털)",
                    "_provider": "기상청 기후변화정보포털",
                    "region": "경상권",
                    "baseline": {"period": "1995-2014", "tavg": base},
                    "units": {"tavg": "°C", "anomaly": "°C"},
                },
                "scenarios": sc,
            }))

    if not writes:
        print("\n변환된 것이 없다. 파일 형식을 확인할 것 (헤더에 컬럼명이 있어야 한다).")
        return

    print(f"\n{'[dry-run] 쓰지 않는다' if args.dry_run else '교체'}: {len(writes)}개 파일")
    for name, payload in writes:
        if args.dry_run:
            print(f"  · {name}")
        else:
            write_json(DATA_DIR / name, payload)

    if daily and yearly and not args.dry_run:
        verify(daily, yearly)
    print("\n다음: python3 scripts/sanity_check.py")


if __name__ == "__main__":
    main()
