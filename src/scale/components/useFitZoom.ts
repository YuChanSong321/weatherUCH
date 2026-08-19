/**
 * 스크롤 대신 축소 — 창이 낮아도 단계 하나가 한 화면에 들어오게 한다.
 *
 * 왜 필요한가.
 * S6(궤도)·S7(임계)은 왼쪽 조종석과 오른쪽 보고서를 **동시에** 보면서 다이얼을 미는
 * 화면이다. 세로가 조금 넘칠 때 칸을 스크롤하게 두면 손과 결과가 같은 화면에 없게
 * 되어 이 단계의 학습이 무너진다. 그렇다고 설명을 계속 잘라내면 남는 게 없다.
 * 그래서 넘치는 만큼 **판 전체를 비례 축소**한다 — 아무것도 감추지 않고, 배치도
 * 그대로인 채 스크롤만 사라진다.
 *
 * transform: scale 이 아니라 CSS zoom 을 쓴다. zoom 은 레이아웃 단계에서 배율이
 * 적용되므로 글자가 축소된 크기로 다시 렌더링된다(=번지지 않는다). 대신 vh 로 잡은
 * 높이는 zoom 의 영향을 받지 않으므로 배율로 나눠 다시 채워 줘야 한다 — `fitStyle`
 * 이 그 일을 한다.
 *
 * 측정 대상은 `data-fit-col` 이 붙은 칸이다. 그 칸의 scrollHeight − clientHeight 가
 * 지금 넘치는 양이고, 물리 높이 H = h·z 는 고정이므로 z' = h·z / (h + 넘침) 이 새
 * 배율이 된다. 한 번 줄이면 줄바꿈이 달라져 넘침이 또 변하므로 몇 프레임에 걸쳐
 * 수렴시킨다.
 *
 * ⚠️ 배율은 **한 방향으로만** 움직인다(줄이기만). 다이얼을 미는 동안 내용 길이가
 * 조금씩 바뀌는데 그때마다 1 로 되돌렸다 다시 줄이면 화면이 깜빡인다. 원래 크기로
 * 되돌리는 건 창 크기가 바뀔 때뿐이다.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/** 이보다 더 줄이면 글자가 안 읽힌다 — 그 아래는 칸 스크롤에 맡긴다 */
const MIN_ZOOM = 0.82
/** 무한 루프 방지 */
const MAX_STEPS = 6

export function useFitZoom(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement | null>(null)
  const zRef = useRef(1)
  const [zoom, setZoom] = useState(1)

  const fit = useCallback((reset: boolean) => {
    if (reset) {
      zRef.current = 1
      setZoom(1)
    }
    let steps = 0

    const tick = () => {
      const el = ref.current
      if (!el) return
      const over = Array.from(el.querySelectorAll<HTMLElement>('[data-fit-col]')).reduce(
        (m, c) => Math.max(m, c.scrollHeight - c.clientHeight),
        0,
      )
      const h = el.clientHeight
      const z = zRef.current
      // 넘치지 않거나, 더 줄일 수 없거나, 높이가 자동인 좁은 화면이면 그대로 둔다
      if (over <= 1 || h <= 0 || z <= MIN_ZOOM || steps >= MAX_STEPS) return
      steps += 1
      const next = Math.max(MIN_ZOOM, Math.floor(z * (h / (h + over)) * 1000) / 1000)
      if (next >= z - 0.004) return
      zRef.current = next
      setZoom(next)
      requestAnimationFrame(tick)
    }

    // 방금 바뀐 배율이 실제로 그려진 뒤에 재야 한다
    requestAnimationFrame(() => requestAnimationFrame(tick))
  }, [])

  /*
   * 판이 화면에 붙는 순간에 재야 한다.
   *
   * 이 단계들은 도입 카드를 먼저 띄우므로, 마운트 시점에는 측정할 판이 아직 없다.
   * 콜백 ref 로 두면 판이 실제로 붙을 때(도입을 넘긴 직후) 한 번 재게 된다 — 이걸
   * 놓쳐서 처음에는 배율이 영원히 1 로 남아 있었다.
   */
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node
      if (node) fit(false)
    },
    [fit],
  )

  // 내용이 바뀔 때는 부족한 만큼만 더 줄이고, 창이 바뀔 때만 원래 크기부터 다시 맞춘다
  useLayoutEffect(() => {
    fit(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps])

  useLayoutEffect(() => {
    const onResize = () => fit(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fit])

  return {
    fitRef: attach,
    zoom,
    /**
     * 단계 루트에 그대로 펼쳐 넣는다.
     * 높이는 클래스(`lg:h-[var(--fit-h)]`)가 읽어 간다 — 인라인으로 height 를 박으면
     * 세로로 쌓이는 좁은 화면에서까지 높이가 고정되어 버린다.
     */
    fitStyle: { zoom, '--fit-h': `calc((100vh - 12.5rem) / ${zoom})` } as CSSProperties,
  }
}
