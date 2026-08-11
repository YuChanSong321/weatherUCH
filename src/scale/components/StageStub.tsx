/**
 * 아직 구현되지 않은 단계의 자리표.
 *
 * Phase 1 은 S0~S8 의 라우팅·카메라·대시보드가 실제로 도는지 확인하는 골격이다.
 * 빈 화면 대신 "여기에 무엇이 들어오는지"를 적어두면, 다음 Phase 를 시작할 때
 * 기획안을 다시 펴지 않아도 된다. 구현이 끝나면 이 컴포넌트를 지운다.
 */
export function StageStub({
  phase,
  act,
  title,
  lead,
  todos,
  onNext,
}: {
  phase: string
  act: string
  title: string
  lead: string
  todos: string[]
  onNext: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col rise">
      <div className="panel p-6 backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] font-medium tracking-[0.14em] text-act-3">{act}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: 'color-mix(in oklab, var(--color-warn) 20%, transparent)',
              color: 'var(--color-warn)',
            }}
          >
            {phase} 예정
          </span>
        </div>

        <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{lead}</p>

        <ul className="mt-4 flex flex-col gap-1.5 border-t border-white/8 pt-3">
          {todos.map((t) => (
            <li key={t} className="flex gap-2 text-[12px] leading-relaxed text-ink-3">
              <span aria-hidden>·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-ghost px-5 py-2 text-[13px]" onClick={onNext}>
            다음 단계로
          </button>
        </div>
      </div>
    </div>
  )
}
