/**
 * 궤도 단계의 시점 전환.
 *
 * 기울기는 지구에 붙어서, 이심률은 궤도 전체에서 잘 보인다. 단계 진입 시 기본
 * 시점은 [components/GlobeLayer] 의 단계별 정책이 정하고, 여기서는 사용자가 그
 * 둘을 오갈 수 있게만 해준다. 지구본 자체는 앱 전체가 공유한다.
 */
import { useGlobe } from './GlobeLayer'

const MODES = [
  ['earth', '지구'],
  ['system', '궤도'],
] as const

export function GlobeViewToggle() {
  const { ready, view, setView } = useGlobe()

  if (!ready) {
    return (
      <div className="absolute inset-0 grid place-items-center text-[11.5px] tracking-[0.14em] text-ink-3">
        우주로 나가는 중…
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1">
      {MODES.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => setView(mode)}
          aria-pressed={view === mode}
          className="pointer-events-auto rounded-full border px-3 py-1 text-[11px] backdrop-blur-sm transition-colors"
          style={{
            borderColor: view === mode ? 'var(--color-act-3)' : 'rgb(255 255 255 / 0.14)',
            color: view === mode ? 'var(--color-ink-1)' : 'var(--color-ink-3)',
            background: view === mode ? 'rgb(144 133 233 / 0.22)' : 'rgb(0 0 0 / 0.42)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
