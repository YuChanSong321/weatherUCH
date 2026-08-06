/** S1 마무리 — 3라운드 총점과 "그럼 2주 뒤는?" 질문으로 S2로 넘긴다. */
import { verdictOfTotal, type RoundScore } from '../../lib/forecast'
import { S1_MAX } from '../../state/journey'

const ROUND_TITLE: Record<number, string> = {
  1: '조용한 날',
  2: '기압이 움직인 날',
  3: '대기가 어제를 배신한 날',
}

export function S1Summary({ rounds, onNext }: { rounds: RoundScore[]; onNext: () => void }) {
  const earned = rounds.reduce((s, r) => s + r.earned, 0)
  const verdict = verdictOfTotal(earned, S1_MAX)
  const worstError = Math.max(0, ...rounds.map((r) => r.tmaxError))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 rise">
      <div className="text-center">
        <div className="text-[11px] font-medium tracking-[0.14em] text-act-1">1단계 결과</div>
        <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-tight">{verdict.title}</h1>
        <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{verdict.body}</p>
      </div>

      <div className="panel flex flex-col gap-3 p-5">
        <div className="flex items-end justify-between">
          <span className="text-[12.5px] text-ink-2">며칠 규모 예보 점수</span>
          <span className="tnum text-[26px] leading-none font-semibold">
            {earned}
            <span className="text-[15px] text-ink-3"> / {S1_MAX}</span>
          </span>
        </div>

        {/* 라운드별 최고기온 오차 — 리드타임이 아니라 '날의 성격'이 난이도를 정했다 */}
        <div className="flex flex-col gap-2 border-t border-white/8 pt-3">
          {rounds.map((r) => (
            <div key={r.round} className="grid grid-cols-[9.5rem_1fr_5.2rem] items-center gap-3">
              <span className="text-[11.5px] whitespace-nowrap text-ink-3">
                R{r.round} · {ROUND_TITLE[r.round]}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${Math.min(100, (r.tmaxError / Math.max(2, worstError)) * 100)}%`,
                    background: 'var(--color-act-1)',
                  }}
                />
              </div>
              <span className="tnum text-right text-[11.5px] text-ink-2">
                오차 {r.tmaxError.toFixed(1)}℃
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          같은 실력으로도 어떤 날은 맞고 어떤 날은 어긋난다. 어긋난 날은 당신의 실수가 아니라 대기의 성질이었다.
        </p>
      </div>

      <div className="panel px-5 py-4 text-center">
        <p className="text-[14px] leading-relaxed">
          그렇다면 <span className="font-semibold text-act-1">2주 뒤</span>는 어떨까?
          <br />
          <span className="text-ink-2">
            같은 방법으로 14일을 밀고 나가면, 오차는 며칠마다 두 배로 자란다. 예측은 그 지점에서 무너진다.
          </span>
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={onNext}>
          그 벽 너머로 가보기
        </button>
      </div>
    </div>
  )
}
