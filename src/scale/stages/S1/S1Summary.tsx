/** S1 마무리 — 3라운드 총점과 "그럼 2주 뒤는?" 질문으로 S2로 넘긴다. */
import { kmaSeasonSummary, verdictOfTotal, type RoundScore } from '../../lib/forecast'
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
          같은 실력으로도 어떤 날은 맞고 어떤 날은 어긋납니다. 어긋난 날은 당신의 실수가 아니라 대기의 성질이었어요.
        </p>
      </div>

      <KmaScoreboard rounds={rounds} />

      <div className="panel px-5 py-4 text-center">
        <p className="text-[14px] leading-relaxed">
          그렇다면 <span className="font-semibold text-act-1">2주 뒤</span>는 어떨까요?
          <br />
          <span className="text-ink-2">
            같은 방법으로 14일을 밀고 나가면, 오차는 며칠마다 두 배로 자랍니다. 예측은 그 지점에서 무너져요.
          </span>
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={onNext}>
          그 벽 너머로 가보기
        </button>
      </div>
    </div>
  )
}

/**
 * 당신 vs 기상청, 3라운드 평균 오차.
 *
 * 지는 게 정상이다 — 상대는 관측망 전체와 수치모델을 쓴다. 그래서 이 표의 요점은
 * 승패가 아니라 "그 격차조차 며칠짜리"라는 것이고, 문구도 그쪽을 향한다.
 */
function KmaScoreboard({ rounds }: { rounds: RoundScore[] }) {
  const s = kmaSeasonSummary(rounds)
  if (!s) return null

  const gap = s.userMae - s.kmaMae
  const scale = Math.max(s.userMae, s.kmaMae, 1) * 1.15

  return (
    <div className="panel flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] text-ink-2">당신 vs 기상청 · 최고기온 평균 오차</span>
        <span className="text-[11px] text-ink-3">
          비교 가능한 {s.rounds}개 라운드{s.rounds < rounds.length && ' (예보 자료가 있는 날만)'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <MaeBar label="당신" value={s.userMae} scale={scale} color="var(--color-act-1)" />
        <MaeBar label="기상청" value={s.kmaMae} scale={scale} color="var(--color-act-2)" />
      </div>

      <p className="border-t border-white/8 pt-3 text-[12px] leading-relaxed text-ink-2">
        {s.wins > 0 ? (
          <>
            <span className="font-semibold" style={{ color: 'var(--color-good)' }}>
              {s.wins}개 라운드에서 기상청을 이기셨습니다.
            </span>{' '}
          </>
        ) : null}
        {gap <= 0.3 ? (
          <>
            관측망 전체와 슈퍼컴퓨터를 쓰는 쪽과 <span className="text-ink-1">거의 나란히 서셨습니다.</span> 며칠 규모에는
            사람이 읽어낼 수 있는 신호가 그만큼 많이 남아 있다는 뜻이에요.
          </>
        ) : (
          <>
            평균 <span className="tnum">{gap.toFixed(1)}℃</span> 차이입니다. 관측망 전체와 수치모델을 가진 쪽이 앞서는 게
            당연하고요.
          </>
        )}
        {s.kmaMissedRounds > 0 && (
          <>
            {' '}
            그런데 <span className="text-ink-1">기상청도 {s.kmaMissedRounds}개 라운드에서 어긋났습니다.</span> 이 격차는
            실력의 문제가 아니라 대기의 성질이고, 며칠만 더 밀면 양쪽 다 무너져요.
          </>
        )}
      </p>
    </div>
  )
}

function MaeBar({
  label,
  value,
  scale,
  color,
}: {
  label: string
  value: number
  scale: number
  color: string
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3">
      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.min(100, (value / scale) * 100)}%`, background: color }}
        />
      </div>
      <span className="tnum text-right text-[11.5px] text-ink-1">{value.toFixed(2)}℃</span>
    </div>
  )
}
