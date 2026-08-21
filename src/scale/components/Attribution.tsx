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
import { datasetCredits, hasApprox, hasNonObserved, hasSynthetic, isAllNonObserved } from '../data/loader'
import { useClimate } from '../state/climate'
import { usePlace } from '../state/place'

export function Attribution() {
  const [open, setOpen] = useState(false)
  const { place } = usePlace()
  const climate = useClimate()
  const allNonObserved = isAllNonObserved
  /*
   * 배지 문구는 남아 있는 것이 무엇이냐에 달려 있다.
   *   합성  아직 지어낸 더미가 남아 있다 → 교체해야 할 자료가 있다
   *   근사  더미는 없고 근사 곡선만 남았다 → SSP 처럼 애초에 관측이 없는 자료다
   */
  const badge = hasSynthetic ? '합성' : hasApprox ? '근사' : null
  /*
   * 사용자가 부산 밖을 찍으면 그 지역의 관측은 기상청이 아니라 Open-Meteo 에서 온다.
   * 그때도 "기상청에서 받았습니다"라고 적혀 있으면 그 자체가 허위 출처 표기다.
   */
  const usesOpenMeteo = place?.source === 'open-meteo'
  /*
   * S2~S4 의 40년 시계열도 부산 밖에서는 Open-Meteo(ERA5 재분석) 에서 온다. 관측만
   * 밝히고 시계열은 "기상청"이라고 적으면 화면에 그려지는 자료와 출처가 어긋난다.
   * 아카이브 호출이 실패해 부산 번들로 되돌아갔을 때는 다시 기상청이 맞다.
   */
  const usesArchive = climate.source === 'open-meteo-archive'

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
        {allNonObserved ? '자료 출처' : usesOpenMeteo ? '자료 출처: 기상청 · Open-Meteo' : '자료 출처: 기상청'}
        {badge && (
          <span
            className="rounded-full px-1.5 py-px text-[9.5px] font-semibold"
            style={{
              background: 'color-mix(in oklab, var(--color-warn) 24%, transparent)',
              color: 'var(--color-warn)',
            }}
          >
            {badge}
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
                  {allNonObserved ? (
                    <>
                      아래 자료는 <span className="text-ink-1">아직 실제 관측이 아닙니다.</span> 화면 구조를
                      검증하기 위해 생성한 합성 데이터이며, 기상청 실측으로 교체할 예정입니다.
                    </>
                  ) : usesOpenMeteo ? (
                    <>
                      지금 보고 계신 <span className="text-ink-1">{place.label}</span> 의 관측
                      {usesArchive && '과 40년 기후 시계열'}은{' '}
                      <span className="text-ink-1">Open-Meteo</span> 에서,{' '}
                      {usesArchive ? '시나리오·평년값 등 나머지 자료는' : '기후·시나리오 자료는'}{' '}
                      <span className="text-ink-1">기상청</span>에서 받았습니다.
                      {hasSynthetic && ' 아래 표에서 "합성 데이터"로 표시된 항목은 아직 실측이 아닙니다.'}
                    </>
                  ) : hasSynthetic ? (
                    <>
                      관측·예보 자료는 <span className="text-ink-1">기상청</span>에서 받았습니다. 다만 아래 표에서
                      "합성 데이터"로 표시된 항목은 아직 실측이 아닙니다.
                    </>
                  ) : hasApprox ? (
                    <>
                      관측 자료는 전부 <span className="text-ink-1">기상청 실측</span>입니다. 표의{' '}
                      <span className="text-ink-1">"근사 곡선"</span> 한 줄만 성격이 다릅니다 — 아래 설명을 보세요.
                    </>
                  ) : (
                    <>
                      이 콘텐츠의 모든 관측·예보 자료는 <span className="text-ink-1">기상청</span>에서 받았습니다.
                    </>
                  )}{' '}
                  {usesOpenMeteo
                    ? `번들된 기상청 자료는 수집 시점에 내려받은 JSON을 읽습니다. 부산 밖의 지역을 고르면 그 지역의 자료${usesArchive ? '(관측·기후 시계열)' : '(관측)'}만 Open-Meteo를 실시간으로 호출해 가져옵니다.`
                    : '브라우저는 API를 호출하지 않고, 수집 시점에 내려받아 번들한 JSON만 읽습니다.'}
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
              {/* 실제로 지금 쓰이고 있는 출처만 표에 올린다 */}
              {usesOpenMeteo && place && (
                <div className="contents">
                  <div className="text-ink-1">선택 지역 관측</div>
                  <div className="text-ink-2">
                    Open-Meteo
                    <span className="text-ink-3"> · 일자료 (예보 격자 {place.gridLat.toFixed(2)}, {place.gridLon.toFixed(2)})</span>
                  </div>
                  <div className="tnum text-ink-3">실시간</div>
                  <div className="text-ink-3">CC BY 4.0</div>
                </div>
              )}
              {usesArchive && (
                <div className="contents">
                  <div className="text-ink-1">선택 지역 기후 시계열</div>
                  <div className="text-ink-2">
                    Open-Meteo
                    <span className="text-ink-3"> · 아카이브 (ERA5 재분석) · 1985년~작년 일평균기온</span>
                  </div>
                  <div className="tnum text-ink-3">실시간</div>
                  <div className="text-ink-3">CC BY 4.0</div>
                </div>
              )}
              {datasetCredits.map((d) => (
                <div key={d.file} className="contents">
                  <div className="text-ink-1">{d.label}</div>
                  <div className="text-ink-2">
                    {d.provider}
                    {d.dataset && <span className="text-ink-3"> · {d.dataset}</span>}
                  </div>
                  <div className="tnum text-ink-3">{d.fetchedAt ?? '—'}</div>
                  <div className={d.kind === 'observed' ? 'text-ink-3' : 'text-[var(--color-warn)]'}>
                    {d.license}
                  </div>
                </div>
              ))}
            </div>

            {hasNonObserved && (
              <p
                className="mt-4 rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed"
                style={{
                  borderColor: 'color-mix(in oklab, var(--color-warn) 45%, transparent)',
                  background: 'color-mix(in oklab, var(--color-warn) 10%, transparent)',
                }}
              >
                {hasSynthetic ? (
                  <>
                    <span className="font-semibold" style={{ color: 'var(--color-warn)' }}>
                      일부 자료가 아직 합성 데이터입니다.
                    </span>{' '}
                    스키마 검증용으로 생성한 값이며 실제 관측이 아닙니다. 실측으로 교체하면 이 배지는 자동으로
                    사라집니다.
                  </>
                ) : (
                  <>
                    <span className="font-semibold" style={{ color: 'var(--color-warn)' }}>
                      SSP 시나리오는 근사 곡선입니다.
                    </span>{' '}
                    미래 전망이라 '실측'이라는 것이 존재하지 않습니다. 있어야 할 것은 기상청 기후정보포털이
                    공표한 시나리오 값인데, 그 자료를 아직 확보하지 못해 같은 형태의 곡선으로 근사해 두었습니다.
                    <span className="text-ink-2"> 값의 크기와 갈래의 폭은 참고용으로만 읽어 주세요.</span>
                  </>
                )}
              </p>
            )}

            <div className="mt-4 border-t border-white/8 pt-3 text-[11px] leading-relaxed text-ink-3">
              <p>
                기상청 자료의 이용 조건은 <span className="text-ink-2">공공누리 제1유형(출처표시)</span> 입니다 —
                출처를 밝히면 상업적 이용과 변형까지 자유롭습니다. 이 화면의 표기가 그 출처표시입니다.
              </p>
              {/* 텍스처는 데이터가 아니지만 규정상 같은 '외부 리소스'다. 표에 섞으면
                  데이터 출처와 혼동되므로 줄을 나눠 적는다. */}
              <p className="mt-1.5">
                지구본 텍스처 6장은 <span className="text-ink-2">NASA</span> 의 퍼블릭 도메인 영상입니다 —
                Blue Marble · Black Marble{' '}
                <span className="text-ink-3">(NASA Earth Observatory)</span>, Tycho Catalog Skymap{' '}
                <span className="text-ink-3">(NASA/Goddard SVS)</span>. 저장소에 동봉되어 있어 실행 중
                외부에서 내려받지 않습니다.
              </p>
              {/* 전 지구 지표는 기상청 자료가 아니라 별도 출처다 — 표에 섞으면
                  공공누리 조건이 이 셋에도 적용되는 것처럼 읽힌다. */}
              <p className="mt-1.5">
                전 지구 비교 지표는 <span className="text-ink-2">NASA GISS</span> GISTEMP v4(평균기온) ·{' '}
                <span className="text-ink-2">NOAA GML</span> 전 지구 평균 CO₂ ·{' '}
                <span className="text-ink-2">NSIDC</span> Sea Ice Index v4(북극 9월 해빙)입니다. 모두 미국 정부
                저작물로 퍼블릭 도메인이며, 출처 표기 조건으로 사용합니다.
              </p>
              <p className="mt-1.5">
                파일별 원본 URL과 가공 내역은 <span className="text-ink-2">public/textures/CREDITS.md</span>,
                오픈소스 라이브러리 라이선스는 <span className="text-ink-2">README</span> 에 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
