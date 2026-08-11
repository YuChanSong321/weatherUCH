/**
 * S0 · 도전장 — "당신이 사는 곳을 찍어라".
 *
 * 설명 화면이 없다. 진입하면 지구가 천천히 돌고 있고, 문구는 한 줄이다.
 * 첫 조작은 읽는 것이 아니라 **찍는 것**이다 (기획안 §2 원칙 1).
 *
 * 이 화면은 자료를 직접 부르지 않는다. 좌표만 [state/place] 에 넘기고, 번들
 * 실측이냐 Open-Meteo 냐 폴백이냐는 전부 그쪽이 정한다.
 */
import { useEffect } from 'react'
import { useGlobe } from '../components/GlobeLayer'
import { formatLatLon } from '../lib/geo'
import { usePlace } from '../state/place'
import type { DailyRecord } from '../types'

export function S0Intro({ onStart }: { onStart: () => void }) {
  const { onPick } = useGlobe()
  const { place, status, notice, select, selectBusan } = usePlace()

  // 지구 표면 클릭 구독. S0 을 벗어나면 해제된다 — 다른 단계에서 지구를 끌다가
  // 지역이 바뀌면 안 된다.
  useEffect(() => onPick(({ lat, lon }) => void select(lat, lon)), [onPick, select])

  return (
    /* 높이를 명시해야 문구가 위, 카드가 아래로 갈라진다. 가운데는 비워 둔다 —
       거기 지구가 있고, 사용자가 찍은 마커가 있다. 카드가 그 위를 덮으면 안 된다. */
    <div className="pointer-events-none mx-auto flex min-h-[420px] lg:h-[calc(100vh-13rem)] w-full max-w-6xl flex-col justify-between">
      {/* 한 줄. 설명하지 않는다. */}
      <div className="rise text-center">
        <h1 className="text-[34px] leading-[1.2] font-semibold tracking-[-0.02em] drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          당신은 며칠 앞을 맞힐 수 있을까요?
        </h1>
        <p className="mt-2 text-[14px] text-ink-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          먼저, <span className="text-ink-1">당신이 사는 곳</span>을 찍으세요 — 지구를 끌어 돌릴 수 있습니다.
        </p>
      </div>

      <div className="flex justify-center">
        {status === 'idle' ? (
          <IdlePrompt onBusan={selectBusan} />
        ) : status === 'loading' ? (
          <div className="panel pointer-events-auto px-5 py-3 text-[12.5px] text-ink-2 backdrop-blur-md">
            이 지역의 관측 자료를 받는 중…
          </div>
        ) : place ? (
          <PlaceCard place={place} notice={notice} onStart={onStart} />
        ) : null}
      </div>
    </div>
  )
}

function IdlePrompt({ onBusan }: { onBusan: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2">
      <div className="pulse-soft rounded-full bg-black/55 px-4 py-2 text-[12.5px] text-ink-2 backdrop-blur-sm">
        지구본을 클릭해 지역을 고르세요
      </div>
      {/* 지구본 조작이 막히는 환경(터치·저사양)에서도 여정이 시작될 수 있어야 한다 */}
      <button type="button" className="text-[11px] text-ink-3 underline underline-offset-4" onClick={onBusan}>
        부산으로 바로 시작하기
      </button>
    </div>
  )
}

function PlaceCard({
  place,
  notice,
  onStart,
}: {
  place: ReturnType<typeof usePlace>['place'] & object
  notice: string | null
  onStart: () => void
}) {
  const latest = place.records[place.records.length - 1]
  return (
    <div className="panel rise pointer-events-auto w-full max-w-3xl p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[19px] font-semibold tracking-tight">{place.label}</h2>
            <span className="tnum text-[11px] text-ink-3">{formatLatLon(place.lat, place.lon)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-3">
            {place.source === 'kma-bundle'
              ? '기상청 종관기상관측(ASOS) 실측 · 번들'
              : `Open-Meteo 예보 격자 ${formatLatLon(place.gridLat, place.gridLon)}`}
            {' · '}
            {latest.date} 관측
          </div>
        </div>
        <button type="button" className="btn btn-primary shrink-0 px-6 py-2.5 text-[14px]" onClick={onStart}>
          이 지역으로 예보 시작하기
        </button>
      </div>

      <ObservedRow day={latest} />

      {notice && (
        <p
          className="mt-3 rounded-lg border px-3 py-1.5 text-[11.5px] leading-relaxed"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-warn) 45%, transparent)',
            color: 'var(--color-warn)',
          }}
        >
          {notice}
        </p>
      )}
    </div>
  )
}

/** 기획안 S0 이 요구하는 다섯 값 — 기온·습도·강수량·풍속·기압 */
function ObservedRow({ day }: { day: DailyRecord }) {
  const cells: { label: string; value: string; unit: string }[] = [
    { label: '최고 / 최저', value: `${day.tmax.toFixed(1)} / ${day.tmin.toFixed(1)}`, unit: '℃' },
    { label: '습도', value: day.humidity.toFixed(0), unit: '%' },
    { label: '강수량', value: day.precip.toFixed(1), unit: 'mm' },
    { label: '풍속', value: `${day.windSpeed.toFixed(1)}`, unit: `m/s ${day.windDir}` },
    { label: '기압', value: day.pressure.toFixed(1), unit: 'hPa' },
  ]
  return (
    <div className="mt-3 grid grid-cols-5 gap-2 border-t border-white/8 pt-3">
      {cells.map((c) => (
        <div key={c.label}>
          <div className="text-[10px] text-ink-3">{c.label}</div>
          <div className="flex items-baseline gap-1">
            <span className="tnum text-[17px] leading-tight font-semibold">{c.value}</span>
            <span className="text-[10px] text-ink-3">{c.unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
