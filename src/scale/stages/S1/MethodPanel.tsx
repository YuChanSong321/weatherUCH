/**
 * 라운드가 끝난 뒤 붙는 방법론 칸 (제목 없음 — 아래 렌더 부분 주석 참고).
 *
 * 왜 필요한가: 점수와 "왜 어긋났나"만 있으면 이 단계가 감으로 찍고 맞았나 틀렸나를
 * 확인하는 놀이로 끝난다. 정작 남겨야 할 것은 **앞날을 말하는 방법이 따로 있다**는
 * 사실과, 그 방법들이 리드타임에 따라 순위가 바뀐다는 사실이다. 기후값이 지속성을
 * 이기기 시작하는 지점이 곧 '예측'이 '전망'으로 바뀌는 지점이기 때문이다.
 *
 * 그래서 같은 문제를 세 가지 표준 방법으로 다시 풀어 오차를 나란히 놓고(기온 라운드),
 * 강수 라운드에서는 지속성이라는 방법 자체를 이 지역의 실제 통계로 증명한다.
 */
import type { ForecastCase, Guess, MethodScore } from '../../lib/forecast'
import { precipPersistence, tmaxMethods } from '../../lib/forecast'
import type { DailyRecord } from '../../types'

const TONE: Record<MethodScore['id'], string> = {
  // 당신은 회색이다 — 색이 붙은 세 방법이 주인공이고, 흰 막대는 '내가 제일 크게
  // 틀렸다'를 강조하는 것처럼 보인다
  you: 'var(--color-ink-2)',
  persistence: 'var(--color-act-1)',
  climatology: 'var(--color-act-2)',
  nwp: 'var(--color-act-3)',
}

export function MethodPanel({
  records,
  forecastCase,
  guess,
}: {
  /** 이 지역의 관측 전체 — 기후값과 지속성 통계를 여기서 낸다 */
  records: DailyRecord[]
  forecastCase: ForecastCase
  guess: Guess
}) {
  return (
    <div
      data-method
      className="rounded-xl border px-3.5 py-3"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-act-1) 30%, transparent)',
        background: 'rgb(255 255 255 / 0.03)',
      }}
    >
      {/*
       * 제목을 붙이지 않는다. "예보관은 이렇게 합니다"를 뺀 것과 같은 이유로 — 방법을
       * 가르치는 칸이라고 선언하는 순간 훈계처럼 읽힌다. 표가 스스로 말하게 둔다.
       * 강수 라운드만 어떤 방법이 놓였는지 한 줄로 알린다.
       */}
      {forecastCase.kind === 'precip' && (
        <div className="text-[10.5px] text-ink-3">지속성과 확률예보</div>
      )}

      {forecastCase.kind === 'precip' ? (
        <PrecipMethods records={records} forecastCase={forecastCase} />
      ) : (
        <TmaxMethods records={records} forecastCase={forecastCase} guess={guess} />
      )}
    </div>
  )
}

function TmaxMethods({
  records,
  forecastCase,
  guess,
}: {
  records: DailyRecord[]
  forecastCase: ForecastCase
  guess: Guess
}) {
  const userGuess = (forecastCase.kind === 'tmax3' ? guess.tmax3 : guess.tmax) ?? forecastCase.today.tmax
  const methods = tmaxMethods(records, forecastCase, userGuess)
  const errors = methods.map((m) => m.error).filter((e): e is number => e !== null)
  const worst = Math.max(...errors, 1)
  const best = methods.reduce<MethodScore | null>(
    (b, m) => (m.error !== null && (b === null || m.error < (b.error ?? Infinity)) ? m : b),
    null,
  )

  const persistence = methods.find((m) => m.id === 'persistence')
  const climatology = methods.find((m) => m.id === 'climatology')

  return (
    <>
      <div className="mt-2 flex flex-col gap-1.5">
        {methods.map((m) => (
          <div key={m.id}>
            <div className="flex items-center gap-2.5">
              <span className="w-[3.6rem] shrink-0 text-[11.5px] font-medium" style={{ color: TONE[m.id] }}>
                {m.name}
              </span>
              <span className="tnum w-[3.2rem] shrink-0 text-right text-[12px] text-ink-2">{m.answer}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                {m.error !== null && (
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${Math.max(2, (m.error / worst) * 100)}%`, background: TONE[m.id] }}
                  />
                )}
              </div>
              <span className="tnum w-[3.4rem] shrink-0 text-right text-[11px] text-ink-3">
                {m.error === null ? '—' : `${m.error.toFixed(1)}℃`}
              </span>
            </div>
            <p className="mt-0.5 pl-[3.6rem] text-[10.5px] leading-snug text-ink-3">
              {m.unavailable ?? m.how}
            </p>
          </div>
        ))}
      </div>

      {/*
        방법의 순위가 곧 이 콘텐츠의 논지다.
        하루 뒤에는 오늘을 아는 방법(지속성·수치예보)이 이기고, 리드타임이 길어지면
        오늘을 아예 보지 않는 방법(기후값)이 이긴다. 그 교차점 뒤가 '전망'의 영역이다.
      */}
      <p className="mt-2.5 border-t border-white/8 pt-2 text-[11.5px] leading-relaxed text-ink-2">
        {best && (
          <>
            이 문제에서 가장 정확했던 건 <span className="font-semibold text-ink-1">{best.name}</span>
            {best.error !== null && <span className="tnum text-ink-3"> ({best.error.toFixed(1)}℃)</span>}입니다.{' '}
          </>
        )}
        {persistence?.error !== undefined && persistence?.error !== null && climatology?.error == null ? (
          forecastCase.kind === 'tmax3' ? (
            <>
              사흘 뒤에는 <span className="text-ink-1">오늘을 아는 것</span>만으로 부족합니다. 이 지역은 여러 해 자료가
              없어 기후값을 낼 수 없었지만, 리드타임이 길어지면 오늘을 아예 보지 않는 기후값이 이깁니다 — 그 지점부터가
              예측이 아니라 <span className="text-ink-1">전망</span>의 영역이에요.
            </>
          ) : (
            <>
              하루 뒤에는 <span className="text-ink-1">오늘을 아는 방법</span>이 강합니다 — 지속성과 수치예보가 둘 다
              오늘의 대기에서 출발하는 방법이에요.
            </>
          )
        ) : persistence && climatology && climatology.error !== null && persistence.error !== null ? (
          forecastCase.kind === 'tmax3' ? (
            climatology.error <= persistence.error ? (
              <>
                사흘 뒤에는 <span className="text-ink-1">오늘을 아예 보지 않는 기후값</span>이 지속성을 이겼습니다 —
                리드타임이 길어질수록 이 역전이 확실해져요. 여기서부터가 예측이 아니라{' '}
                <span className="text-ink-1">전망</span>의 영역입니다.
              </>
            ) : (
              <>
                아직은 오늘을 아는 쪽이 이깁니다. 다만 그 우위는 하루 뒤보다 줄었어요 — 며칠만 더 밀면 기후값이
                역전하고, 그 뒤부터는 예측이 아니라 <span className="text-ink-1">전망</span>이 됩니다.
              </>
            )
          ) : climatology.error < persistence.error ? (
            /* 하루 뒤인데도 기후값이 이기는 날이 있다 — 전선이 지나간 날이다.
               그런 날에 "오늘을 아는 쪽이 강하다"고만 쓰면 화면이 데이터와 어긋난다. */
            <>
              그런데 하루 뒤인데도 <span className="text-ink-1">기후값이 이겼습니다</span> — 대기가 어제를 배신한
              날이에요. 평균적으로는 짧은 시간에서 오늘을 아는 쪽(지속성·수치예보)이 강하고, 시간이 길어지면 순위가
              완전히 뒤집힙니다.
            </>
          ) : (
            <>
              하루 뒤에는 <span className="text-ink-1">오늘을 아는 방법</span>이 강합니다. 기후값은 오늘 날씨를 아예
              보지 않으므로 이런 짧은 시간에는 질 수밖에 없어요 — 대신 시간이 길어지면 순위가 뒤집힙니다.
            </>
          )
        ) : null}
      </p>
    </>
  )
}

function PrecipMethods({ records, forecastCase }: { records: DailyRecord[]; forecastCase: ForecastCase }) {
  const stat = precipPersistence(records, forecastCase.today)
  const prob = forecastCase.kma?.precipProb ?? null

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      {stat ? (
        <div>
          <div className="text-[11.5px] font-medium" style={{ color: 'var(--color-act-1)' }}>
            방법 ① 지속성 — 어제가 오늘을 알려준다
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">
            오늘은 {stat.todayWet ? '비가 왔습니다' : '비가 오지 않았습니다'}. 이 지역 관측{' '}
            <span className="tnum">{stat.days.toLocaleString()}</span>일을 세어 보면,{' '}
            <span className="text-ink-1">비 온 날의 다음 날에 또 비가 온 비율</span>은{' '}
            <span className="tnum font-semibold" style={{ color: 'var(--color-act-1)' }}>
              {stat.wetAfterWet.toFixed(0)}%
            </span>
            인데, 맑았던 날의 다음 날은{' '}
            <span className="tnum font-semibold">{stat.wetAfterDry.toFixed(0)}%</span>뿐이에요. 그래서 "어제 비가 왔으면
            오늘도 올 확률이 높다"는 감이 아니라 <span className="text-ink-1">근거 있는 방법</span>입니다.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <ProbBar label="비 온 다음 날" value={stat.wetAfterWet} tone="var(--color-act-1)" />
            <ProbBar label="맑은 다음 날" value={stat.wetAfterDry} tone="var(--color-ink-3)" />
            <ProbBar label="아무 날이나 (기후값)" value={stat.base} tone="var(--color-act-2)" />
          </div>
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-ink-2">
          <span className="font-medium" style={{ color: 'var(--color-act-1)' }}>
            방법 ① 지속성
          </span>{' '}
          — 오늘 비가 왔으면 내일도 올 확률이 높습니다. 확률로 말하려면 여러 해의 기록이 필요한데, 이 지역은 최근 2주
          관측만 받아와서 여기서는 세어 보여드릴 수 없어요.
        </p>
      )}

      <div className="border-t border-white/8 pt-2">
        <div className="text-[11.5px] font-medium" style={{ color: 'var(--color-act-3)' }}>
          방법 ② 확률예보 — 하나의 답을 못 내면 분포로 답한다
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">
          {prob !== null ? (
            <>
              기상청은 이날 강수확률 <span className="tnum font-semibold">{prob}%</span>를 냈습니다. 이 숫자는 "10번 중
              몇 번" 이라는 뜻이에요 —{' '}
            </>
          ) : (
            <>예보가 "강수확률 60%"처럼 나오는 이유가 있습니다 — </>
          )}
          초기 조건을 조금씩 다르게 넣어 계산을 수십 번 돌리면(<span className="text-ink-1">앙상블</span>) 결과가
          갈라집니다. 그 가운데 비가 온 비율이 그대로 확률이 됩니다. 대기가 초기값에 민감해서{' '}
          <span className="text-ink-1">하나의 답을 낼 수가 없고</span>, 그래서 정직한 예보는 확률로 말합니다.
        </p>
      </div>
    </div>
  )
}

function ProbBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[8.5rem] shrink-0 text-[10.5px] text-ink-3">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: tone }} />
      </div>
      <span className="tnum w-[2.6rem] shrink-0 text-right text-[11px] text-ink-2">{value.toFixed(0)}%</span>
    </div>
  )
}
