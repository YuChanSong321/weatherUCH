/** S1 마무리 — 예보의 방법 정리 → 3라운드 총점 → "그럼 2주 뒤는?" 으로 S2로 넘긴다. */
import { useState } from 'react'
import { StageIntro, StageIntroBar, type IntroStep } from '../../components/StageIntro'
import { kmaSeasonSummary, verdictOfTotal, type RoundKind, type RoundScore } from '../../lib/forecast'
import { S1_MAX } from '../../state/journey'

/**
 * 예보의 방법 — 한 번에 한 마디씩 읽는다 (→ [components/StageIntro]).
 *
 * 처음에는 같은 내용을 요약 화면 아래쪽 판에 4열 + 2열로 깔았는데, "부록처럼 붙어
 * 있어서 아무도 읽지 않는다"는 지적을 받았다. 맞는 말이다 — 점수와 등수가 위에 있는
 * 화면에서 그 아래 긴 판은 넘기는 것이 자연스럽다.
 *
 * 이 단계에서 남겨야 하는 문장은 점수가 아니라 **"날씨는 예측하고 기후는 전망한다"**
 * 이고, 뒤의 모든 단계(SSP 시나리오·궤도·임계점)가 그 구분 위에 서 있다. 그래서
 * 도입에서 쓰던 방식을 그대로 쓴다: 카드 하나에 한 마디, 다음을 눌러 진행. 읽고 나면
 * 한 줄로 접혀 요약 화면 위에 남고, 다시 보기로 펼친다.
 */
const METHOD_STEPS: IntroStep[] = [
  {
    label: '방법 ① 지속성',
    body: (
      <>
        오늘 값을 그대로 답으로 냅니다. <span className="text-act-1">오늘 비가 왔으면 내일도 올 확률이 높다</span>는
        성질에 기댄 방법이에요 — 며칠 규모에서는 이 단순한 방법이 놀랄 만큼 강합니다.
      </>
    ),
  },
  {
    label: '방법 ② 기후값(평년값)',
    body: (
      <>
        그 시기의 여러 해 평균을 답으로 냅니다. <span className="text-act-1">오늘 날씨는 아예 보지 않아요.</span> 하루
        뒤에는 지고, 시간이 길어지면 이깁니다 — 이 역전이 예보와 전망의 경계선입니다.
      </>
    ),
  },
  {
    label: '방법 ③ 수치예보',
    body: (
      <>
        대기를 격자로 쪼개 유체·열역학 방정식을 시간에 따라 풉니다. 기상청과 슈퍼컴퓨터가 하는 일이고, 시작하려면{' '}
        <span className="text-act-1">지금 대기의 상태(초기값)</span>가 반드시 필요합니다.
      </>
    ),
  },
  {
    label: '방법 ④ 앙상블 · 확률',
    body: (
      <>
        초기값을 조금씩 흔들어 계산을 수십 번 돌립니다. 결과가 갈라지는 정도가 그대로 확률이 돼요 —{' '}
        <span className="text-act-1">강수확률 60%</span>는 그 계산들 가운데 60%에서 비가 왔다는 뜻입니다.
      </>
    ),
  },
  {
    label: '그래서 · 날씨는 예측한다',
    body: (
      <>
        날씨는 <span className="text-act-1">초기값 문제</span>입니다. 지금 대기의 상태를 알아야 시작할 수 있는데, 거기
        남은 아주 작은 차이가 시간이 갈수록 걷잡을 수 없이 벌어져요 —{' '}
        <span className="text-act-1">나비 한 마리의 날갯짓</span>에 비유되는 그 성질입니다. 그래서 며칠까지는 꽤
        잘 맞지만, 2주 근처부터는 예측이 급격히 어려워집니다.
      </>
    ),
  },
  {
    label: '그래서 · 기후는 전망한다',
    body: (
      <>
        기후는 <span className="text-act-1">경계조건 문제</span>입니다. 30년 평균이 어디로 가는지는 개별 날짜가 아니라
        CO₂·궤도·태양 같은 조건이 정해요. 그래서 8월 15일에 비가 올지는 영원히 못 맞혀도{' '}
        <span className="text-act-1">2100년 여름 평균은 계산할 수 있습니다.</span>
      </>
    ),
  },
  {
    label: '그래서 · 답은 하나가 아니다',
    body: (
      <>
        단, 조건을 <span className="text-act-1">가정</span>해야 하므로 답이 하나로 떨어지지 않습니다 — 배출을 얼마나
        하느냐에 따라 갈라지는 <span className="text-act-1">시나리오별 범위</span>로 말할 수밖에 없어요. 그래서 기후는
        예측이 아니라 <span className="text-act-1">전망</span>이라고 부릅니다. 다음 단계부터 그 전망을 직접 만들어 봅니다.
      </>
    ),
    chip: '지속성·기후값·수치예보·앙상블 — 날씨는 예측(초기값), 기후는 전망(경계조건)',
  },
]

/** 세 라운드는 같은 날을 본다 — 다른 것은 '무엇을, 며칠 앞을' 물었는가다 */
const ROUND_TITLE: Record<RoundKind, string> = {
  tmax: '내일 기온',
  precip: '내일 강수',
  tmax3: '3일 뒤 기온',
}

export function S1Summary({ rounds, onNext }: { rounds: RoundScore[]; onNext: () => void }) {
  const earned = rounds.reduce((s, r) => s + r.earned, 0)
  const verdict = verdictOfTotal(earned, S1_MAX)
  /** 방법 정리를 읽었는가 — 점수보다 이게 먼저다 (위 METHOD_STEPS 주석) */
  const [methodDone, setMethodDone] = useState(false)

  if (!methodDone) {
    return (
      <StageIntro
        eyebrow="1단계 정리 · 예보의 방법"
        steps={METHOD_STEPS}
        tone="var(--color-act-1)"
        onDone={() => setMethodDone(true)}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 rise">
      <div className="text-center">
        <div className="text-[11px] font-medium tracking-[0.14em] text-act-1">1단계 결과</div>
        <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-tight">{verdict.title}</h1>
        <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{verdict.body}</p>
      </div>

      {/* 방금 읽은 방법 정리는 한 줄로 접어 둔다 — 다시 보기로 펼친다 */}
      <div className="flex justify-center">
        <StageIntroBar
          chip={METHOD_STEPS[METHOD_STEPS.length - 1].chip!}
          tone="var(--color-act-1)"
          label="예보의 방법"
          replayLabel="정리 다시 보기"
          onReplay={() => setMethodDone(false)}
        />
      </div>

      <div className="panel flex flex-col gap-3 p-5">
        <div className="flex items-end justify-between">
          <span className="text-[12.5px] text-ink-2">며칠 규모 예보 점수</span>
          <span className="tnum text-[26px] leading-none font-semibold">
            {earned}
            <span className="text-[15px] text-ink-3"> / {S1_MAX}</span>
          </span>
        </div>

        {/* 라운드별 득점. 막대는 배점 대비 획득률이다 — 라운드마다 만점이 다르므로
            점수만 나란히 놓으면 20점짜리 보너스가 초라해 보인다. */}
        <div className="flex flex-col gap-2 border-t border-white/8 pt-3">
          {rounds.map((r) => (
            <div key={r.round} className="grid grid-cols-[8rem_1fr_6.5rem] items-center gap-3">
              <span className="text-[11.5px] whitespace-nowrap text-ink-3">
                R{r.round} · {ROUND_TITLE[r.kind]}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${Math.min(100, (r.earned / r.max) * 100)}%`,
                    background: 'var(--color-act-1)',
                  }}
                />
              </div>
              <span className="tnum text-right text-[11.5px] text-ink-2">
                {r.earned}/{r.max}점
                {r.kind !== 'precip' && <span className="text-ink-3"> · {r.tmaxError.toFixed(1)}℃</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          {/* 이 콘텐츠 전체의 논지를 여기서 한 번 심는다 — S8 의 U자 곡선이 이 문장을 회수한다 */}
          같은 날, 같은 방법으로 찍었는데 하루 뒤와 사흘 뒤의 성적이 다릅니다. 리드타임이 길어질수록 어려워지는
          것 — 그게 이 여정의 주제예요.
        </p>
      </div>

      <KmaScoreboard rounds={rounds} />

      <div className="panel px-5 py-4 text-center">
        <p className="text-[14px] leading-relaxed">
          그런데 <span className="font-semibold text-act-1">2주 뒤</span>는 이렇게 물어보기가 어렵습니다.
          <br />
          <span className="text-ink-2">
            같은 방법으로 날짜를 밀고 나갈수록 처음의 작은 차이가 점점 크게 벌어져서, 그쯤 되면 답이 사실상 아무
            값이나 될 수 있기 때문이에요.
          </span>
        </p>
        {/*
          "왜 어려운가"를 여기서 한 번 이름 붙여 심어둔다.
          점수만 보여주고 넘기면 "내가 못 맞혔다"로 끝나는데, 이 콘텐츠가 말하려는 건
          "아무도 못 맞힌다, 그리고 그건 물리적 이유가 있다" 쪽이다. 마지막 화면의
          앙상블 그래프가 이 문단을 그림으로 회수한다.

          ⚠️ 여기서 "2주 뒤는 어떨까요?"로 물으면 다음 화면이 2주 예보를 보여줄 것처럼 읽힌다.
          실제로 S2 는 시간축을 압축해 질문을 바꾸는 화면이라 곧바로 약속을 어긴 꼴이 된다.
          그래서 물음표를 지우고, 마지막 줄에서 "질문을 바꾼다"를 먼저 밝힌다.
        */}
        <p className="mx-auto mt-3 max-w-xl border-t border-white/8 pt-3 text-[12px] leading-relaxed text-ink-3">
          위에서 말한 초기값 문제의 이름이 <span className="text-ink-2">카오스(초기 조건 민감성)</span>입니다.
          "브라질에서 나비가 날갯짓하면 텍사스에 토네이도가 분다"는 그 이야기예요 — 관측망을 아무리 촘촘히 깔아도
          남는 오늘의 미세한 차이가, 날이 갈수록 걷잡을 수 없이 커집니다. 그래서 2주 안팎은{' '}
          <span className="text-ink-2">기술이 아니라 물리가 만든 한계</span>에 가깝습니다 — 컴퓨터를 훨씬 키워도
          그 한계가 크게 밀리지는 않아요. 그 너머는 예측보다 전망의 영역입니다.
          <br />
          <span className="text-ink-2">
            그래서 다음 화면부터는 “며칠 뒤 몇 도”를 묻지 않습니다. 질문 자체를 바꿔볼게요.
          </span>
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={onNext}>
          질문을 바꿔보기
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
        <span className="text-[12.5px] text-ink-2">당신 vs 기상청 · 내일 최고기온</span>
        <span className="text-[11px] text-ink-3">그날 발표된 단기예보와 비교</span>
      </div>

      <div className="flex flex-col gap-2">
        <MaeBar label="당신" value={s.userMae} scale={scale} color="var(--color-act-1)" />
        <MaeBar label="기상청" value={s.kmaMae} scale={scale} color="var(--color-act-2)" />
      </div>

      {s.precip && (
        <div className="flex items-baseline gap-3 border-t border-white/8 pt-2.5 text-[11.5px]">
          <span className="text-ink-3">강수 등급</span>
          <span className="text-ink-2">당신 {s.precip.userHit ? '적중' : '빗나감'}</span>
          <span className="text-ink-2">기상청 {s.precip.kmaHit ? '적중' : '빗나감'}</span>
        </div>
      )}

      <p className="border-t border-white/8 pt-3 text-[12px] leading-relaxed text-ink-2">
        {s.wins > 0 ? (
          <>
            <span className="font-semibold" style={{ color: 'var(--color-good)' }}>
              기온에서 기상청을 이기셨습니다.
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
            그런데 <span className="text-ink-1">기상청도 이날 어긋났습니다.</span> 이 격차는 실력의 문제가 아니라
            대기의 성질이고, 며칠만 더 밀면 양쪽 다 무너져요.
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
