/**
 * 지구 상태 → 지표 연출 (빙상 / 건조화 / 바다 후퇴).
 *
 * 어떤 조작이 지표를 어떻게 바꾸는지를 **여기 한 곳에서만** 정한다. 화면마다
 * 따로 정하면 같은 상태가 화면에 따라 다르게 그려지고, 그건 곧 거짓말이 된다.
 *
 * ── 무엇이 근거가 있고 무엇이 없는가 ────────────────────────────────────
 *
 *  ✔ 냉각 → 빙상 확장
 *    고위도의 여름이 서늘해지면 눈이 여름을 버티고, 흰 표면이 햇빛을 더 되쏘아
 *    스스로를 키운다(얼음–반사율 되먹임). 빙기 진입의 실제 기제이고, 마지막
 *    빙기 최성기의 빙상은 실제로 북위 40°대까지 내려왔다.
 *
 *  ✔ 온난 → 육지 건조화
 *    아열대 건조대의 확장과 가뭄 빈도 증가는 널리 보고된 결과다. 다만 "지구
 *    전체 육지가 사막이 된다"는 뜻이 아니므로 강도를 낮게 잡는다.
 *
 *  ✔ 자기권 상실 → 바다 후퇴
 *    자기장을 잃은 행성은 태양풍에 상층 대기를 깎이고, 그 과정에서 물을 잃는다
 *    (화성이 밟은 경로). **수억 년 규모**의 이야기라는 점을 화면에 밝힌다.
 *
 *  ✘ 궤도 이심률 → 바다가 마름  ← 넣지 않는다
 *    이심률 0.06 에서도 연평균 일사량 변화는 1/√(1−e²) ≈ +0.2% 다. 바다를
 *    증발시킬 크기가 전혀 아니다. 이심률이 실제로 하는 일은 계절 대비를 키워
 *    고위도 빙하화를 앞당기는 것이고, 그래서 이심률은 ice 쪽에만 연결한다.
 */
import { THRESHOLDS } from './earthState'

export type SurfaceState = { ice: number; warm: number; seaDry: number }

export const NEUTRAL_SURFACE: SurfaceState = { ice: 0, warm: 0, seaDry: 0 }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * 기온 편차(°C, 현재 지구 기준) → 빙상·건조화.
 *
 * 눈금: −4℃ 에서 빙상이 최대(빙기 최성기 규모), +4℃ 에서 건조화가 최대.
 * 산업화 이전 대비 +1.75℃ 인 현재는 warm ≈ 0.2 로, 눈에 겨우 띄는 정도다 —
 * 지금 지구를 사막으로 그리면 그것도 과장이다.
 */
export function surfaceFromAnomaly(deltaC: number): SurfaceState {
  return {
    ice: clamp01(-deltaC / 4),
    warm: clamp01(deltaC / 4),
    seaDry: 0,
  }
}

/**
 * S7 샌드박스 — 임계치를 넘긴 상태를 지표에 옮긴다.
 *
 * 이심률은 빙하화로, 자기장 붕괴는 바다 후퇴로 간다. 둘 다 임계 아래에서는
 * 0 이다 — 임계를 넘는 순간에만 지표가 변해야 "임계점"이라는 말이 성립한다.
 */
export function surfaceFromThresholds(
  eccentricity: number,
  magneticField: number,
  obliquity = 23.44,
): SurfaceState {
  const eccOver = (eccentricity - THRESHOLDS.eccentricityExtreme) / 0.01
  const magUnder = (THRESHOLDS.magneticCollapse - magneticField) / THRESHOLDS.magneticCollapse

  /*
   * 자전축도 지표에 나타나야 한다.
   *
   * 셋 중 자전축만 화면에 아무 흔적을 남기지 않고 있었다 — 다이얼을 끝까지 밀어도
   * 지구가 그대로라, 그 다이얼만 아무 일도 안 하는 장식처럼 보였다.
   *
   *  ✔ 기울기가 작으면(< 22.5°) 고위도 여름이 서늘해져 겨울눈이 여름을 넘긴다 → 빙상
   *  ✔ 기울기가 크면(> 24.0°) 극지 여름의 가열이 심해진다 → 고위도 건조·갈변
   * 둘 다 이심률·자기장보다 약하게 잡는다. 실제로도 기울기 2.4° 범위가 만드는
   * 변화는 빙기를 켜고 끄는 방아쇠이지, 그 자체로 지표를 뒤엎는 크기가 아니다.
   */
  const tiltCold = clamp01((22.5 - obliquity) / 0.6) * 0.45
  const tiltHot = clamp01((obliquity - 24.0) / 0.6) * 0.4

  return {
    // 두 냉각 요인은 겹칠 수 있다 — 더 센 쪽이 아니라 합으로 읽어야 조합이 보인다
    ice: clamp01(clamp01(eccOver) * 0.75 + tiltCold),
    warm: tiltHot,
    seaDry: clamp01(magUnder) * 0.85,
  }
}
