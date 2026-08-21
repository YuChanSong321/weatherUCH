/**
 * 기상 예측 vs 기후 전망 — 두 예측의 차이 대조표.
 *
 * 원래 이 정리는 여정의 **맨 마지막** 엔딩에 있었다. 그런데 이건 전체의 결론이
 * 아니라 2단계까지의 결론이다 — 기상과 기후를 막 겪고 나온 직후에 나와야
 * "아, 그래서 그랬구나"가 되고, 맨 끝에서 꺼내면 이미 다 지나간 이야기가 된다.
 * 그래서 2단계가 끝나는 자리(S5Future 의 출구)로 옮겼다.
 */
import type { ReactNode } from 'react'

const CONTRAST: Array<{ q: string; weather: string; climate: string }> = [
  {
    q: '묻는 것',
    weather: '"모레 이 도시의 최고기온은 몇 ℃인가"',
    climate: '"2050년대 이 도시의 여름은 지금보다 얼마나 더울까"',
  },
  {
    q: '답의 형태',
    weather: '하나의 값 — 23.4℃, 강수확률 60% (결정론적 예측)',
    climate: '확률 분포 — "평년보다 높을 확률 80%" (확률적 전망)',
  },
  {
    q: '무엇을 푸는 문제인가',
    weather: '초기 조건 문제 — 지금 대기가 정확히 어떤 상태인가',
    climate: '경계 조건 문제 — 지구가 받고 내보내는 에너지가 얼마인가',
  },
  {
    q: '앙상블이 뜻하는 것',
    weather: '초기값을 조금씩 흔들어 여러 번 돌린다 → 퍼짐 = 대기의 불확실성',
    climate: '모델과 배출 시나리오를 바꿔 여러 번 돌린다 → 퍼짐 = 인간 선택의 폭',
  },
  {
    q: '맞았다의 기준',
    weather: '그날 그 값에 얼마나 가까웠나 — 하루 뒤면 채점된다',
    climate: '수십 년을 모아 분포가 맞았나 — 한 해로는 채점할 수 없다',
  },
  {
    q: '한계',
    weather: '약 2주. 관측을 아무리 늘려도 물리적으로 넘을 수 없다',
    climate: '개별 날짜·개별 해는 영원히 못 맞힌다. 대신 방향은 남는다',
  },
]


export function WeatherVsClimate({ footer }: { footer?: ReactNode }) {
  return (

    <section className="panel flex flex-col gap-3 p-5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em] text-ink-3">2단계 정리 · 두 예측의 차이</div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          이름은 비슷하지만 <span className="text-ink-1">서로 다른 일입니다</span>
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          여기까지 두 가지를 직접 해보셨습니다. 하루의 기온을 맞히려 했고(기상), 40년 평균의 방향을 읽고
          2100년까지 끌어봤죠(기후). 둘은 이름만 비슷할 뿐 <span className="text-ink-1">서로 다른 일</span>입니다.
          기후 전망이 더 멀리 보는 이유는 예측 기술이 갑자기 좋아져서가 아니라,{' '}
          <span className="text-ink-1">묻는 질문을 바꿨기 때문</span>이에요.
        </p>
      </div>

      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-5 text-[11.5px]">
        <div className="border-b border-white/12 pb-1.5 text-[10.5px] text-ink-3">비교 항목</div>
        <div
          className="border-b pb-1.5 text-[12px] font-semibold"
          style={{ borderColor: 'color-mix(in oklab, var(--color-act-1) 45%, transparent)', color: 'var(--color-act-1)' }}
        >
          ① 기상 예측 (Weather forecast)
        </div>
        <div
          className="border-b pb-1.5 text-[12px] font-semibold"
          style={{ borderColor: 'color-mix(in oklab, var(--color-act-2) 45%, transparent)', color: 'var(--color-act-2)' }}
        >
          ② 기후 전망 (Climate projection)
        </div>

        {CONTRAST.map((row) => (
          <div key={row.q} className="contents">
            <div className="border-b border-white/6 py-1.5 text-ink-3">{row.q}</div>
            <div className="border-b border-white/6 py-1.5 leading-relaxed text-ink-2">{row.weather}</div>
            <div className="border-b border-white/6 py-1.5 leading-relaxed text-ink-2">{row.climate}</div>
          </div>
        ))}
      </div>

      {footer && <div className="border-t border-white/8 pt-3">{footer}</div>}
    </section>
  )
}
