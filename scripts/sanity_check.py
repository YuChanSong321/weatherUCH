#!/usr/bin/env python3
"""상식 검증 — /data 의 JSON 이 '부산의 실제 기후'로서 말이 되는지 확인한다.

수집 스크립트의 [자체 검증]이 "콘텐츠가 가르치려는 관계"를 보는 것과 달리, 이쪽은
**값 자체가 물리적으로 가능한가**를 본다. 컬럼 매핑을 잘못 잡으면 (현지기압/해면기압
혼동, 화씨/섭씨, 풍향 단위, 지점번호 오기) 앱은 아무 오류 없이 그럴듯하게 동작하면서
전혀 다른 도시의 값을 보여준다. 그 조용한 실패를 여기서 잡는다.

    python3 scripts/sanity_check.py          # 전체 검사
    python3 scripts/sanity_check.py --strict # 경고도 실패로 취급

종료 코드 0 = 통과. 실측 교체 후 반드시 통과시킬 것.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date, timedelta

from common import DATA_DIR

# 부산(북위 35.1°, 해안) 기준으로 물리적으로 가능한 범위.
# 관측 기록을 넉넉히 감싸되, 단위·지점을 잘못 잡으면 반드시 벗어나도록 잡았다.
BOUNDS = {
    # 하한 15℃ — 부산의 흐리고 비 오는 6월이면 낮 최고가 20℃ 아래로 내려간다.
    # 20℃ 로 잡았다가 정상값(19.9℃)에 걸렸다. 이 검사의 목적은 '있을 수 없는 값'을
    # 잡는 것이지 드문 값을 잡는 것이 아니다 — 화씨(60~100)나 다른 기후대 지점은
    # 이 하한으로도 충분히 걸린다.
    "tmax_summer": (15.0, 40.0, "여름(6–8월) 최고기온"),
    "tmin_winter": (-15.0, 15.0, "겨울(12–2월) 최저기온"),
    "tavg_year": (12.0, 18.0, "연평균기온"),
    "precip_day": (0.0, 600.0, "일강수량"),
    "humidity": (10.0, 100.0, "상대습도"),
    "pressure": (960.0, 1050.0, "해면기압"),
    "wind_deg": (0.0, 360.0, "풍향"),
    "wind_speed": (0.0, 60.0, "풍속"),
    "cloud": (0.0, 10.0, "운량"),
    "blossom_doy": (60, 121, "벚꽃 개화일(3/1–4/30)"),
}

problems: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load(name: str) -> dict | None:
    p = DATA_DIR / name
    if not p.exists():
        fail(f"{name} 이 없다")
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def check_range(values: list[float], key: str, label: str) -> None:
    lo, hi, what = BOUNDS[key]
    bad = [v for v in values if v is None or not (lo <= v <= hi)]
    if not values:
        fail(f"{label}: 표본 0건")
        return
    if bad:
        sample = sorted({round(v, 1) for v in bad if v is not None})[:6]
        fail(f"{label} — {what} 범위 밖 {len(bad)}/{len(values)}건 (허용 {lo}~{hi}, 예: {sample})")
    else:
        print(f"  OK   {label:<28} {min(values):7.1f} ~ {max(values):7.1f}   (허용 {lo}~{hi})")


# ────────────────────────────────────────────────── 일별 관측


def check_daily() -> None:
    f = load("busan_daily.json")
    if not f:
        return
    rows = f["records"]
    print(f"\n[일별 관측] {len(rows)}건  {rows[0]['date']} ~ {rows[-1]['date']}")

    summer = [r["tmax"] for r in rows if r["date"][5:7] in ("06", "07", "08")]
    winter = [r["tmin"] for r in rows if r["date"][5:7] in ("12", "01", "02")]
    check_range(summer, "tmax_summer", "여름 최고기온")
    check_range(winter, "tmin_winter", "겨울 최저기온")
    check_range([r["precip"] for r in rows], "precip_day", "일강수량")
    check_range([r["humidity"] for r in rows], "humidity", "상대습도")
    check_range([r["pressure"] for r in rows], "pressure", "해면기압")
    check_range([r["windDeg"] for r in rows], "wind_deg", "풍향")
    check_range([r["windSpeed"] for r in rows], "wind_speed", "풍속")
    check_range([r["cloud"] for r in rows], "cloud", "운량")

    # tmin <= tavg <= tmax 가 깨지면 컬럼이 뒤바뀐 것이다
    inverted = [r["date"] for r in rows if not (r["tmin"] <= r["tavg"] <= r["tmax"])]
    if inverted:
        fail(f"일별 관측 — tmin ≤ tavg ≤ tmax 위반 {len(inverted)}건 (예: {inverted[:4]}) · 컬럼 뒤바뀜 의심")
    else:
        print("  OK   최저 ≤ 평균 ≤ 최고        전 건 성립")

    # 날짜 연속성
    days = [date.fromisoformat(r["date"]) for r in rows]
    gaps = [
        f"{days[i]}→{days[i + 1]}"
        for i in range(len(days) - 1)
        if (days[i + 1] - days[i]) != timedelta(days=1)
    ]
    if gaps:
        warn(f"일별 관측 — 날짜 결측/점프 {len(gaps)}곳 (예: {gaps[:3]})")
    else:
        print("  OK   날짜 연속성               빠진 날 없음")

    dupes = [d for d, c in Counter(r["date"] for r in rows).items() if c > 1]
    if dupes:
        fail(f"일별 관측 — 날짜 중복 {len(dupes)}건 (예: {dupes[:4]})")

    # 계절이 뒤집혀 있으면 남반구 지점이거나 월 파싱이 틀린 것이다
    aug = [r["tavg"] for r in rows if r["date"][5:7] == "08"]
    jan = [r["tavg"] for r in rows if r["date"][5:7] == "01"]
    if aug and jan:
        if sum(aug) / len(aug) <= sum(jan) / len(jan):
            fail("일별 관측 — 8월이 1월보다 춥다. 지점(남반구?)이나 월 파싱을 의심할 것")
        else:
            print(f"  OK   계절 방향                 8월 {sum(aug)/len(aug):.1f}℃ > 1월 {sum(jan)/len(jan):.1f}℃")


# ────────────────────────────────────────────────── 연평균 / 평년값


def check_yearly() -> None:
    f = load("busan_yearly.json")
    if not f:
        return
    rows = f["records"]
    years = [r["year"] for r in rows]
    print(f"\n[연평균] {len(rows)}건  {years[0]} ~ {years[-1]}")

    check_range([r["tavg"] for r in rows], "tavg_year", "연평균기온")

    missing = sorted(set(range(years[0], years[-1] + 1)) - set(years))
    if missing:
        fail(f"연평균 — 결측 연도 {len(missing)}개: {missing[:10]}")
    else:
        print("  OK   연도 결측                 없음")

    if len(rows) >= 20:
        head = sum(r["tavg"] for r in rows[:5]) / 5
        tail = sum(r["tavg"] for r in rows[-5:]) / 5
        per_decade = (tail - head) / (years[-1] - years[0]) * 10
        if per_decade <= 0:
            warn(f"연평균 — 상승 추세가 아니다 ({per_decade:+.2f}℃/10년). S3·S4 카피가 데이터와 어긋난다")
        elif per_decade > 1.0:
            warn(f"연평균 — 상승 추세가 비정상적으로 가파르다 ({per_decade:+.2f}℃/10년)")
        else:
            print(f"  OK   장기 추세                 {per_decade:+.2f}℃ / 10년")


def check_monthly() -> None:
    f = load("busan_monthly.json")
    if not f:
        return
    rows = f["normals"]
    print(f"\n[월 평년값] {len(rows)}개월")
    if sorted(r["month"] for r in rows) != list(range(1, 13)):
        fail("월 평년값 — 1~12월이 모두 있지 않다")
        return
    print("  OK   1~12월                    전부 존재")
    warm = max(rows, key=lambda r: r["tavg"])["month"]
    cold = min(rows, key=lambda r: r["tavg"])["month"]
    if warm not in (7, 8) or cold not in (1, 2):
        fail(f"월 평년값 — 최난월 {warm}월 / 최한월 {cold}월. 북반구 중위도로서 이상하다")
    else:
        print(f"  OK   최난월 / 최한월           {warm}월 / {cold}월")
    bad = [r["month"] for r in rows if not (r["tmin"] <= r["tavg"] <= r["tmax"])]
    if bad:
        fail(f"월 평년값 — 최저 ≤ 평균 ≤ 최고 위반: {bad}월")


# ────────────────────────────────────────────────── 벚꽃 / 예보


def check_blossom() -> None:
    f = load("busan_blossom.json")
    if not f:
        return
    rows = f["records"]
    print(f"\n[벚꽃 개화일] {len(rows)}건  {rows[0]['year']} ~ {rows[-1]['year']}")
    check_range([r["doy"] for r in rows], "blossom_doy", "개화일(연중일수)")

    # date 와 doy 가 서로 맞는가
    mismatch = [
        r["year"] for r in rows
        if date.fromisoformat(r["date"]).timetuple().tm_yday != r["doy"]
    ]
    if mismatch:
        fail(f"벚꽃 — date 와 doy 불일치 {len(mismatch)}건 (예: {mismatch[:4]})")
    else:
        print("  OK   date ↔ doy 일치           전 건 성립")

    if len(rows) >= 10:
        head = sum(r["doy"] for r in rows[:5]) / 5
        tail = sum(r["doy"] for r in rows[-5:]) / 5
        if tail - head > 0:
            warn(f"벚꽃 — 개화가 늦어지는 방향이다 ({tail - head:+.1f}일). S3 카피와 정반대가 된다")
        else:
            print(f"  OK   개화 추세                 {tail - head:+.1f}일 (앞당겨짐)")


def check_forecast() -> None:
    f = load("busan_past_forecast.json")
    daily = load("busan_daily.json")
    if not f or not daily:
        return
    rows = f["records"]
    obs = {r["date"]: r for r in daily["records"]}
    print(f"\n[과거 예보] {len(rows)}건")

    orphan = [r["date"] for r in rows if r["date"] not in obs]
    if orphan:
        warn(f"예보 — 관측에 없는 날짜 {len(orphan)}건 (예: {orphan[:3]})")

    paired = [(r, obs[r["date"]]) for r in rows if r["date"] in obs]
    if not paired:
        fail("예보 — 관측과 짝이 맞는 날이 하나도 없다. 3자 대결이 전부 꺼진다")
        return

    cover = len(paired) / len(obs) * 100
    errs = [abs(fc["tmax"] - ob["tmax"]) for fc, ob in paired]
    mae = sum(errs) / len(errs)
    print(f"  OK   관측 대비 커버리지        {cover:.0f}%  ({len(paired)}/{len(obs)}일)")

    if mae > 4:
        fail(f"예보 — 최고기온 MAE {mae:.2f}℃. 실제 예보로는 지나치게 크다 (날짜 정렬 오류 의심)")
    elif mae < 0.2:
        warn(f"예보 — MAE {mae:.2f}℃ 로 지나치게 정확하다. 관측을 그대로 복사했는지 확인할 것")
    else:
        print(f"  OK   예보 최고기온 MAE         {mae:.2f}℃")

    if cover < 50:
        warn(f"예보 — 커버리지 {cover:.0f}%. 절반 이상의 라운드에서 3자 대결이 빠진다")


def check_ssp() -> None:
    f = load("future_ssp.json")
    if not f:
        return
    print(f"\n[SSP 시나리오] {len(f['scenarios'])}종")
    ids = {s["id"] for s in f["scenarios"]}
    if ids != {"ssp126", "ssp245", "ssp585"}:
        fail(f"SSP — 시나리오 3종이 아니다: {sorted(ids)}")
        return
    ends = {s["id"]: s["points"][-1]["tavg"] for s in f["scenarios"]}
    if not (ends["ssp126"] < ends["ssp245"] < ends["ssp585"]):
        fail(f"SSP — 2100년 값의 대소가 뒤집혔다: {ends}")
    else:
        print(f"  OK   2100년 순서               {ends['ssp126']:.1f} < {ends['ssp245']:.1f} < {ends['ssp585']:.1f}℃")
    for s in f["scenarios"]:
        bad = [p["year"] for p in s["points"] if not (p["low"] <= p["tavg"] <= p["high"])]
        if bad:
            fail(f"SSP {s['id']} — 불확실성 범위가 중앙값을 감싸지 않는다: {bad[:4]}")


# ────────────────────────────────────────────────── 출처 메타


def check_provenance() -> None:
    print("\n[출처 메타]")
    synthetic = []
    for name in sorted(p.name for p in DATA_DIR.glob("*.json")):
        meta = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))["meta"]
        src = meta.get("source", "?")
        if src == "SYNTHETIC_DUMMY":
            synthetic.append(name)
            continue
        for field in ("_provider", "_dataset", "_fetched_at", "_license"):
            if not meta.get(field):
                warn(f"{name} — meta.{field} 가 비어 있다. 앱 출처 표기에 '확인 필요'로 뜬다")
    if synthetic:
        warn(f"합성 데이터 {len(synthetic)}종: {', '.join(synthetic)} — 실측 교체 전까지 앱에 '합성' 배지가 뜬다")
    else:
        print("  OK   전 파일 실측 + 출처 메타 완비")


def main() -> None:
    ap = argparse.ArgumentParser(description="/data 상식 검증")
    ap.add_argument("--strict", action="store_true", help="경고도 실패로 취급")
    args = ap.parse_args()

    print("═" * 66)
    print("  상식 검증 — 부산의 실제 기후로서 값이 말이 되는가")
    print("═" * 66)

    check_daily()
    check_yearly()
    check_monthly()
    check_blossom()
    check_forecast()
    check_ssp()
    check_provenance()

    print("\n" + "═" * 66)
    if warnings:
        print(f"경고 {len(warnings)}건")
        for w in warnings:
            print(f"  ! {w}")
    if problems:
        print(f"\n실패 {len(problems)}건")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    if warnings and args.strict:
        sys.exit(1)
    print("\n통과 — 값의 범위·순서·정합성에 이상 없음")


if __name__ == "__main__":
    main()
