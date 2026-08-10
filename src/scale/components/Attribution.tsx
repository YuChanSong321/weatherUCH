/**
 * 자료 출처 표기 — 상시 노출.
 *
 * 대회 규정이 데이터 원출처 표기를 필수로 두고, 기상청 자료는 공공누리(KOGL) 유형을
 * 확인해 출처를 구체적으로 적으라고 요구한다. 그래서 한 줄 크레딧은 상단 자에 늘
 * 떠 있고, 누르면 데이터셋별 상세(기관·데이터명·수집일·이용조건)가 펼쳐진다.
 *
 * 표시하는 값은 손으로 적은 상수가 아니라 **각 JSON 의 meta 에서 읽는다.** 합성
 * 데이터를 실측인 것처럼 보이게 만드는 것이 가장 위험하므로, 파일이 바뀌면 화면도
 * 반드시 따라 바뀌어야 한다.
 */
import { useEffect, useState } from 'react'
import { datasetCredits, isAllSynthetic, isDummyData } from '../data/loader'

export function Attribution() {
  const [open, setOpen] = useState(false)
  const someSynthetic = isDummyData
  const allSynthetic = isAllSynthetic

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[10.5px] whitespace-nowrap text-ink-3 transition-colors hover:border-white/25 hover:text-ink-2"
        aria-haspopup="dialog"
      >
        <span aria-hidden>ⓘ</span>
        {/* 전부 합성인 동안에는 상단 한 줄도 '기상청'이라고 단정하지 않는다 */}
        {allSynthetic ? '자료 출처' : '자료 출처: 기상청'}
        {isDummyData && (
          <span
            className="rounded-full px-1.5 py-px text-[9.5px] font-semibold"
            style={{
              background: 'color-mix(in oklab, var(--color-warn) 24%, transparent)',
              color: 'var(--color-warn)',
            }}
          >
            합성
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="자료 출처"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel max-h-full w-full max-w-3xl overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight">자료 출처</h2>
                {/* 문장이 표와 어긋나면 안 된다. 전부 합성인데 "기상청에서 받았습니다"라고
                    적어두면 그 자체가 허위 표기다 — 실제 상태에 따라 문장을 바꾼다. */}
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                  {allSynthetic ? (
                    <>
                      아래 자료는 <span className="text-ink-1">아직 실제 관측이 아닙니다.</span> 화면 구조를
                      검증하기 위해 생성한 합성 데이터이며, 기상청 실측으로 교체할 예정입니다.
                    </>
                  ) : someSynthetic ? (
                    <>
                      관측·예보 자료는 <span className="text-ink-1">기상청</span>에서 받았습니다. 다만 아래 표에서
                      "합성 데이터"로 표시된 항목은 아직 실측이 아닙니다.
                    </>
                  ) : (
                    <>
                      이 콘텐츠의 모든 관측·예보 자료는 <span className="text-ink-1">기상청</span>에서 받았습니다.
                    </>
                  )}{' '}
                  브라우저는 API를 호출하지 않고, 수집 시점에 내려받아 번들한 JSON만 읽습니다.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost shrink-0 px-4 py-1.5 text-[12px]"
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_92px_96px] gap-x-3 gap-y-1.5 text-[11.5px]">
              <div className="text-[10.5px] text-ink-3">데이터</div>
              <div className="text-[10.5px] text-ink-3">출처 · 데이터명</div>
              <div className="text-[10.5px] text-ink-3">수집일</div>
              <div className="text-[10.5px] text-ink-3">이용 조건</div>
              {datasetCredits.map((d) => (
                <div key={d.file} className="contents">
                  <div className="text-ink-1">{d.label}</div>
                  <div className="text-ink-2">
                    {d.provider}
                    {d.dataset && <span className="text-ink-3"> · {d.dataset}</span>}
                  </div>
                  <div className="tnum text-ink-3">{d.fetchedAt ?? '—'}</div>
                  <div className={d.synthetic ? 'text-[var(--color-warn)]' : 'text-ink-3'}>
                    {d.synthetic ? '합성 데이터' : d.license}
                  </div>
                </div>
              ))}
            </div>

            {isDummyData && (
              <p
                className="mt-4 rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed"
                style={{
                  borderColor: 'color-mix(in oklab, var(--color-warn) 45%, transparent)',
                  background: 'color-mix(in oklab, var(--color-warn) 10%, transparent)',
                }}
              >
                <span className="font-semibold" style={{ color: 'var(--color-warn)' }}>
                  일부 자료가 아직 합성 데이터입니다.
                </span>{' '}
                스키마 검증용으로 생성한 값이며 실제 관측이 아닙니다. 실측으로 교체하면 이 배지는 자동으로
                사라집니다.
              </p>
            )}

            <div className="mt-4 border-t border-white/8 pt-3 text-[11px] leading-relaxed text-ink-3">
              <p>
                기상청 공공데이터의 이용 조건은 <span className="text-ink-2">공공누리(KOGL)</span> 유형을 따릅니다.
                유형별 조건(출처표시 / 상업적 이용 / 변경 금지)은 제공처 표기를 확인해 병기해야 합니다.
              </p>
              <p className="mt-1.5">
                지구 텍스처 · 오픈소스 라이브러리의 출처와 라이선스는 저장소의{' '}
                <span className="text-ink-2">README</span> 와{' '}
                <span className="text-ink-2">docs/DATA_AVAILABILITY.md</span> 에 정리되어 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
