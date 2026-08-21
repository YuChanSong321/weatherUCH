/**
 * S7 · 엔딩 — S0의 질문을 회수한다.
 *
 * ⚠️ 두 번의 개편을 거쳤다. 둘 다 심사·동료 피드백이 원인이고, 순서대로 읽어야
 * 지금 구조가 왜 이렇게 생겼는지 이해된다.
 *
 * (1) U자 곡선 하나 → 그래프 둘.
 *   원래는 하루부터 수만 년까지를 가로축 하나에 놓고 세로축을 '예측 가능성'이라는
 *   한 가지 양으로 그린 U자였다. 지적:
 *     "기상 예측은 정확한 값이므로, 기후 예측은 경향이나 앙상블로 확률적인 정보로써
 *      평년보다 높고 낮은 정도의 예측만 가능하다. 같은 곡선으로 표현하기엔 개념의
 *      차이가 존재한다."
 *   맞는 말이다. 두 예측은 **정확도가 다른 같은 일**이 아니라 **애초에 다른 일**이다.
 *     기상 — 초기 조건 문제. 하나의 값을 답으로 낸다. 하루 뒤면 채점된다.
 *     기후 — 경계 조건 문제. 확률 분포를 답으로 낸다. 개별 해는 영원히 못 맞힌다.
 *   세로축의 의미가 다른 두 양을 한 곡선으로 이으면 그 이음매가 곧 거짓말이 된다.
 *   그래서 쪼갰고, **이어지지 않는다는 사실 자체**를 이 화면의 결론으로 삼았다.
 *
 * (2) 한 화면에 다 쌓기 → 네 장면으로 진행.
 *   쪼갠 결과 그래프 2 + 대조표 + 요약카드 3 + 액션 + 점수, 블록 여섯이 같은 무게로
 *   쌓였다. 지적: "그래프가 메인처럼 보이고 그 위아래로 글이 붙어 루즈하다, 시선이
 *   분산돼 난잡하다, 일방향으로 흐르게 해달라."
 *   그래서 **한 장면에 초점 하나**로 다시 짰다.
 *     ① 기상 — 값을 맞히는 일      ② 기후 — 분포를 맞히는 일
 *     ③ 두 예측의 차이 (대조표)     ④ 선택 — 사람이 잡은 다이얼
 *   장면 안에서도 방향은 하나다: 왼쪽 그림 → 오른쪽 번호 붙은 설명 → 아래 다음 버튼.
 *   중복이던 요약 카드 3장과 점수 스트립은 없앴다 — 각 장면이 자기 몫의 점수를
 *   그 자리에서 회수하는 편이 짧고, 같은 말을 두 번 하지 않는다.
 */
import { useMemo, useState } from 'react'
import { Item, Scene, SIGMA_WIDEN, normPdf } from '../components/PredictionScenes'
import { AnimatePresence, motion } from 'framer-motion'
import { ChartFrame } from '../components/ChartFrame'
import { scenarios } from '../data/loader'
import { linearScale, smoothPath } from '../lib/scales'
import { ORBIT_MISSION_MAX, useJourney, type OrbitMissionResult } from '../state/journey'
import { trendOf, useClimate } from '../state/climate'
import { useWorld } from '../state/world'
import { S6Carbon } from './S6Carbon'

/* ─────────────────────────────  장면 진행  ───────────────────────────── */

type SceneDef = { key: string; tab: string; tone: string }

/*
 * 네 장면의 순서.
 *
 * 기상·기후 장면은 여기 없다 — 2단계가 닫히는 자리(S5Future 의 출구)로 옮겼다.
 * 남은 넷은 "3단계를 닫고 → 사람의 시계를 겹쳐보고 → 여정 전체를 되짚고 →
 * 선택으로 끝낸다"는 한 줄기다.
 */
const SCENES: SceneDef[] = [
  { key: 'orbit', tab: '3단계 정리', tone: 'var(--color-act-3)' },
  { key: 'carbon', tab: '탄소', tone: 'var(--color-act-2)' },
  { key: 'journey', tab: '여정', tone: 'var(--color-ink-2)' },
  { key: 'choice', tab: '선택', tone: 'var(--color-act-3)' },
]

export function S7Ending() {
  const { orbitResult, dragged2100, totals, restart } = useJourney()
  const climate = useClimate()
  const [scene, setScene] = useState(0)


  /**
   * 연평균기온의 자연 변동 폭 σ — 사용자가 고른 지역의 실제 시계열에서 뽑는다.
   *
   * 추세를 뺀 나머지의 표준편차다. 이 값이 곧 "기후가 그대로여도 해마다 이만큼은
   * 튄다"는 폭이고, 기후 장면의 종 모양 너비가 된다. 상수로 박아두면 지역을
   * 바꿔도 같은 그림이 나와 거짓이 된다.
   */
  const sigma = useMemo(() => {
    const s = climate.yearly
    if (s.length < 10) return 0.55
    const t = trendOf(s)
    const resid = s.map((r) => r.tavg - (t.slope * r.year + t.intercept))
    return Math.max(0.25, Math.sqrt(resid.reduce((acc, v) => acc + v * v, 0) / (resid.length - 1)))
  }, [climate.yearly])

  /** SSP 세 경로가 2100년에 데려가는 곳 — 기준은 '지금(2025)' 이다 */
  const futures = useMemo(
    () =>
      scenarios.map((s) => {
        const first = s.points[0]
        const last = s.points[s.points.length - 1]
        return { id: s.id, label: s.label, color: s.color, shift: last.anomaly - first.anomaly }
      }),
    [],
  )
  // 기본 선택은 가운데 경로 — 지금 궤도의 연장선에 가장 가깝다
  const [pick, setPick] = useState(() => Math.min(1, futures.length - 1))

  const def = SCENES[scene]
  const last = scene === SCENES.length - 1

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3.5">
      <SceneRail scene={scene} onPick={setScene} totals={totals} />

      {/*
        mode="wait" — 앞 장면이 완전히 빠진 뒤 다음 장면이 들어온다.
        두 장면이 한 순간이라도 겹치면 "한 번에 하나만 본다"는 이 화면의 약속이 깨진다.
      */}
      <AnimatePresence mode="wait">
        <motion.div
          key={def.key}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        >
          {scene === 0 && <SceneOrbitSummary orbitResult={orbitResult} />}
          {/* 탄소 레이어는 내용 그대로, 껍데기만 이 레일의 장면 형식으로 (embedded) */}
          {scene === 1 && <S6Carbon embedded />}
          {scene === 2 && <SceneJourney totals={totals} />}
          {scene === 3 && (
            <SceneChoice
              sigma={sigma}
              futures={futures}
              pick={pick}
              onPick={setPick}
              dragged2100={dragged2100}
              orbitResult={orbitResult}
              totals={totals}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-6">
        <button
          type="button"
          className="text-[12px] text-ink-3 transition-colors hover:text-ink-1 disabled:opacity-0"
          onClick={() => setScene((n) => n - 1)}
          disabled={scene === 0}
        >
          ← 이전
        </button>
        {last ? (
          <button type="button" className="btn btn-primary px-6" onClick={restart}>
            다시 도전하기
          </button>
        ) : (
          <button type="button" className="btn btn-primary px-6" onClick={() => setScene((n) => n + 1)}>
            {NEXT_LABEL[scene]}
          </button>
        )}
      </div>
    </div>
  )
}

/** 다음 장면으로 넘기는 버튼의 문구 — 다음 장면이 답할 질문을 미리 던진다 */
const NEXT_LABEL = [
  '사람의 시계와 겹쳐볼까요',
  '여기까지 어디를 지나왔을까요',
  '그럼 미래는 누가 정하나요',
]

/* ─────────────────────────────  공통 껍데기  ───────────────────────────── */

function SceneRail({
  scene,
  onPick,
  totals,
}: {
  scene: number
  onPick: (i: number) => void
  totals: { earned: number; max: number }
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        <div className="text-[11px] font-medium tracking-[0.14em] text-ink-3">
          여정의 끝 · 처음의 질문 —{' '}
          <span className="text-ink-2">“당신은 며칠 앞을 맞힐 수 있을까요?”</span>
        </div>
        {/* 발표 중 되짚어야 할 때가 있으므로 눌러서 되돌아갈 수 있게 둔다 */}
        <div className="mt-1.5 flex items-center gap-1">
          {SCENES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && <span className="h-px w-4" style={{ background: 'rgb(255 255 255 / 0.16)' }} />}
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === scene}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  borderColor: i === scene ? s.tone : 'rgb(255 255 255 / 0.12)',
                  background: i === scene ? `color-mix(in oklab, ${s.tone} 18%, transparent)` : 'transparent',
                  color: i === scene ? 'var(--color-ink-1)' : i < scene ? 'var(--color-ink-2)' : 'var(--color-ink-3)',
                }}
              >
                <span className="tnum font-semibold" style={{ color: i <= scene ? s.tone : undefined }}>
                  {i + 1}
                </span>
                {s.tab}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tnum text-[26px] leading-none font-semibold">
          {totals.earned}
          <span className="text-[13px] text-ink-3"> / {totals.max}</span>
        </div>
        <div className="text-[10.5px] text-ink-3">총점</div>
      </div>
    </div>
  )
}

/** 장면 하나 — 제목 한 줄, 왼쪽 그림, 오른쪽 번호 붙은 설명. 방향은 항상 이 하나. */

/**
 * 경로별 대응방안.
 *
 * 심사에서 가장 잘 전달됐다고 꼽힌 지점("우리 행위에 따라 미래가 달라진다")을
 * 더 살려 달라는 요청을 받았다. 살리는 방법으로 훈계 문장을 늘리지 않는다 —
 * 마지막 장면에서 버튼을 누르면 옆의 종 모양이 그 자리에서 움직이게 했다.
 * 문장이 아니라 화면이 인과를 보여주는 쪽이다.
 */
const LEVERS: Record<string, { headline: string; body: string; acts: string[] }> = {
  ssp126: {
    /*
     * "배출 총량이 0" 이라고 적었더니 배출을 아예 멈춘다는 뜻으로 읽혔다. 넷제로는
     * 그런 뜻이 아니다 — 내보내는 양과 흡수하는 양이 같아져 **합이 0** 이 되는 상태다.
     * 화석연료를 한 톤도 안 태우는 세상이 아니라, 남은 배출만큼을 숲·갯벌·포집으로
     * 되거둬 상쇄하는 세상이다.
     */
    headline: '이 길로 가려면, 2050년 무렵 배출과 흡수가 같아져야 합니다',
    body: '내보내는 양을 0으로 만든다는 뜻이 아니라, 남은 배출만큼을 숲·바다·포집 기술로 다시 거둬들여 합을 0으로 맞춘다는 뜻입니다(넷제로). 이미 내보낸 몫 때문에 당분간은 계속 더워지지만, 세기 후반에 곡선이 눕는 유일한 경로예요.',
    acts: [
      '발전을 재생에너지·원자력 등 무탄소 전원으로 교체',
      '건물 단열·수송 전동화로 에너지 수요 자체를 줄이기',
      '숲·갯벌 흡수원 복원과 탄소 포집·저장',
    ],
  },
  ssp245: {
    headline: '지금 발표된 각국 감축 목표를 그대로 지키면 대략 여기입니다',
    body: '선언은 있고 이행은 절반쯤인 세상. 지금 궤도의 연장선에 가장 가까운 경로입니다.',
    acts: [
      '감축 목표를 선언에서 이행으로 — 점검·공시 체계',
      '폭염·집중호우에 맞춘 도시 인프라 재설계',
      '농업 품종 전환과 물 관리 적응 계획',
    ],
  },
  ssp585: {
    headline: '화석연료로 성장을 계속 밀어붙이면 도달하는 곳입니다',
    body: '적응으로 감당할 수 있는 범위를 여러 지역에서 넘어섭니다. 되돌리는 다이얼은 없습니다.',
    acts: [
      '이 경로는 대응이 아니라 회피의 대상입니다',
      '적응만으로 감당할 수 없는 지역이 나옵니다',
      '넘고 나서 고치는 비용이 넘지 않는 비용보다 훨씬 큽니다',
    ],
  },
}

/* ─────────────────────────  ① 3단계 정리 — 자연이 돌리는 손잡이  ───────────────────────── */

/**
 * 3단계(궤도 · 임계)를 닫는 정리.
 *
 * 공통 3단 구조를 그대로 따른다: 무엇을 했나 → 왜 그렇게 했나 → 그래서 무엇을 아나.
 * 왼쪽에는 **사용자가 실제로 만든 값**을 놓는다 — 글로만 되짚으면 "내가 뭘 했더라"가
 * 남지 않는다. 미션 결과는 여정 상태에서 읽으므로 다시 하기를 하면 함께 비워진다.
 */
function SceneOrbitSummary({ orbitResult }: { orbitResult: OrbitMissionResult | null }) {
  const { orbit, magneticField } = useWorld()
  const tone = 'var(--color-act-3)'
  const dials = [
    { k: '자전축 기울기', v: `${orbit.obliquity.toFixed(2)}°`, base: '현재 지구 23.44°' },
    { k: '궤도 이심률', v: orbit.eccentricity.toFixed(3), base: '현재 지구 0.017' },
    { k: '지자기 세기', v: `${magneticField.toFixed(0)}%`, base: '현재 지구 100%' },
  ]
  return (
    <Scene
      tone={tone}
      kicker="① 3단계 정리 · 수만 년"
      title={
        <>
          사람이 <span className="text-ink-1">만질 수 없는 다이얼</span>을 만져봤습니다
        </>
      }
      figure={
        <div className="flex flex-col gap-3">
          {/* 사용자가 남긴 값 — 이 화면의 '내가 한 일'이다 */}
          <div className="hud-tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
            {dials.map((d) => (
              <div key={d.k} className="hud-tile">
                <div className="hud-tile-k">{d.k}</div>
                <div className="hud-tile-v">{d.v}</div>
                <div className="mt-0.5 text-[10px] text-ink-3">{d.base}</div>
              </div>
            ))}
          </div>
          <div
            className="rounded-xl border px-4 py-3"
            style={{
              borderColor: orbitResult?.success
                ? 'color-mix(in oklab, var(--color-good) 40%, transparent)'
                : 'rgb(255 255 255 / 0.1)',
              background: orbitResult?.success
                ? 'color-mix(in oklab, var(--color-good) 8%, transparent)'
                : 'rgb(255 255 255 / 0.02)',
            }}
          >
            <div className="text-[10.5px] tracking-[0.06em] text-ink-3">임계 미션</div>
            <div className="mt-0.5 text-[13px] font-semibold text-ink-1">
              {orbitResult
                ? orbitResult.success
                  ? `복구 성공 — ${orbitResult.secondsLeft.toFixed(1)}초 남기고 안전 구간으로 되돌렸습니다`
                  : '시간 안에 되돌리지 못했습니다 — 그게 임계점의 성질입니다'
                : '아직 도전하지 않았습니다'}
            </div>
            {orbitResult && (
              <div className="tnum mt-1 text-[11.5px] text-ink-2">
                획득 {orbitResult.earned} / {orbitResult.max}점
              </div>
            )}
          </div>
        </div>
      }
    >
      <Item n={1} tone={tone} title="무엇을 했나">
        궤도의 모양과 자전축을 직접 돌려 <span className="text-ink-1">북위 65° 여름 햇빛</span>을 바꿔봤고, 그
        값들이 위험 쪽으로 넘어간 지구를 안전 구간으로 되돌려봤습니다.
      </Item>
      <Item n={2} tone={tone} title="왜 그렇게 했나">
        수만 년 규모의 기후는 사람이 아니라 <span className="text-ink-1">천체역학</span>이 정합니다. 시계처럼
        규칙적이라 이 규모가 오히려 가장 잘 예측돼요 — 예측 가능성의 U자에서 오른쪽 끝입니다.
      </Item>
      <Item n={3} tone={tone} title="그래서 무엇을 아나">
        이 다이얼들은 <span className="text-ink-1">우리 소관이 아닙니다.</span> 그리고 임계점은 한 방향으로만
        열려서, 넘고 나면 되돌리는 다이얼이 없습니다. 그럼 사람이 실제로 쥔 다이얼은 무엇일까요 —
        다음 화면이 그 하나를 놓고 벌어지는 이야기입니다.
      </Item>
    </Scene>
  )
}

/* ─────────────────────────  ③ 여정 — 하루에서 수만 년까지  ───────────────────────── */

/**
 * 지나온 시간 규모를 한 화면에 되짚는다.
 *
 * 왜 필요한가. 이 콘텐츠는 규모를 계속 넓혀가는 여정인데, 정작 **넓혀왔다는 사실
 * 자체를 정리해주는 자리가 없었다.** 마지막에 와서도 사용자는 마지막 화면(궤도)만
 * 기억한 채로 끝난다. 여기서 다섯 칸을 한 줄에 세워 "내가 이만큼 물러났다"를
 * 눈으로 확인시키고, 그 다음 장면(④ 선택)으로 넘긴다.
 *
 * 마지막 줄은 이 여정 전체의 논지다 — 자연은 만 년이 걸리는 일을 하고, 우리는
 * 같은 크기를 수백 년에 하고 있다. 속도가 다르다는 것이 결론이다.
 */
const JOURNEY: Array<{ scale: string; what: string; kind: string; tone: string; body: string }> = [
  {
    scale: '하루~며칠',
    what: '내일의 기온·비',
    kind: '날씨',
    tone: 'var(--color-act-1)',
    body: '값 하나를 맞히는 일. 잘 맞지만 2주에서 벽을 만납니다.',
  },
  {
    scale: '한 해',
    what: '365일을 누른 평균 하나',
    kind: '날씨 → 기후',
    tone: 'var(--color-act-1)',
    body: '묻는 대상을 하루에서 1년으로 바꾼 자리. 여기서 기후가 시작됩니다.',
  },
  {
    scale: '수십 년',
    what: '40년 추세선',
    kind: '기후',
    tone: 'var(--color-act-2)',
    body: '개별 연도는 튀어도 방향은 남습니다. 값이 아니라 방향을 읽습니다.',
  },
  {
    scale: '100년',
    what: 'SSP 세 갈래',
    kind: '기후',
    tone: 'var(--color-act-2)',
    body: '하나의 예측이 아니라 부채꼴. 어느 갈래로 갈지는 배출 선택이 정합니다.',
  },
  {
    scale: '수만 년',
    what: '궤도·자전축',
    kind: '천체역학',
    tone: 'var(--color-act-3)',
    body: '가장 잘 예측되는 규모. 지구가 스스로 돌리는, 사람이 못 만지는 손잡이.',
  },
]

function SceneJourney({ totals }: { totals: { earned: number; max: number } }) {
  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em] text-ink-3">③ 여정 · 지나온 시간 규모</div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          하루에서 시작해 <span className="text-ink-1">수만 년까지</span> 물러났습니다
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          카메라를 한 칸씩 뒤로 빼면서, 같은 지구를 다섯 번 다른 자로 재봤어요. 규모가 바뀌면 답할 수 있는 질문도
          바뀝니다 — 그게 이 여정이 보여주려던 것입니다.
        </p>
      </div>

      {/* 다섯 칸을 한 줄로. 왼쪽이 가깝고 오른쪽이 멀다 — 자의 방향과 같다. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-5">
        {JOURNEY.map((j, i) => (
          <div key={j.scale} className="flex flex-col gap-1.5 bg-space-1 px-3 py-3">
            <div className="flex items-baseline gap-1.5">
              <span className="tnum text-[10px] font-semibold" style={{ color: j.tone }}>
                {i + 1}
              </span>
              <span className="text-[12.5px] font-semibold text-ink-1">{j.scale}</span>
            </div>
            <span
              className="self-start rounded-full px-1.5 py-px text-[9.5px] font-semibold"
              style={{ background: `color-mix(in oklab, ${j.tone} 20%, transparent)`, color: j.tone }}
            >
              {j.kind}
            </span>
            <div className="text-[11.5px] font-medium text-ink-2">{j.what}</div>
            <p className="text-[11px] leading-relaxed text-ink-3">{j.body}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div
          className="rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in oklab, var(--color-act-3) 38%, transparent)',
            background: 'color-mix(in oklab, var(--color-act-3) 8%, transparent)',
          }}
        >
          {/* "자연은 느리고, 지금은 빠릅니다" 였는데 두 절의 주어가 어긋나 읽히지
              않았다(자연 ↔ 지금). 같은 주어로 견주도록 고쳤다. */}
          <h3 className="text-[13px] font-semibold text-ink-1">
            같은 크기의 변화를, 훨씬 짧은 시간에
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
            궤도가 빙하기를 켜고 끄는 데는 <span className="text-ink-1">수만 년</span>이 걸립니다. 방금 그 다이얼을
            직접 돌려보셨죠. 그런데 산업화 이후 <span className="text-ink-1">약 270년</span> 만에 우리는 그와 비슷한
            크기의 변화를 만들었습니다. 달라진 건 변화의 크기가 아니라{' '}
            <span className="text-act-3">그 변화가 일어나는 속도</span>예요.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
            그리고 이 다섯 칸 중 <span className="text-ink-1">사람이 손을 댈 수 있는 칸은 하나뿐</span>입니다 —
            100년 규모의 부채꼴. 다음 화면이 그 이야기예요.
          </p>
        </div>

        <div className="panel-quiet flex flex-col justify-center gap-1 px-4 py-3">
          <div className="text-[10.5px] text-ink-3">여기까지 얻은 점수</div>
          <div className="flex items-baseline gap-1">
            <span className="tnum text-[30px] leading-none font-semibold text-ink-1">{totals.earned}</span>
            <span className="text-[13px] text-ink-3">/ {totals.max}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            맞고 틀린 것보다, 어느 규모에서 맞았는지가 이 여정의 답입니다.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────  ④ 선택 — 사람이 잡은 다이얼  ───────────────────────── */

const MINI_W = 380
const MINI_H = 176
const MINI_M = { top: 16, right: 14, bottom: 28, left: 14 }
const TONE_CH = 'var(--color-act-3)'

function SceneChoice({
  sigma,
  futures,
  pick,
  onPick,
  dragged2100,
  orbitResult,
  totals,
}: {
  sigma: number
  futures: Array<{ id: string; label: string; color: string; shift: number }>
  pick: number
  onPick: (i: number) => void
  dragged2100: number | null
  orbitResult: { success: boolean; earned: number } | null
  totals: { earned: number; max: number }
}) {
  const future = futures[pick]
  const lever = LEVERS[future.id]

  return (
    <section className="panel flex flex-col gap-3 p-5" style={{ borderColor: `color-mix(in oklab, ${future.color} 40%, transparent)` }}>
      <div>
        <div className="text-[10.5px] font-medium tracking-[0.14em]" style={{ color: TONE_CH }}>
          ④ 선택 · 사람이 잡은 다이얼
        </div>
        <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">
          못 바꾸는 것과, <span style={{ color: TONE_CH }}>아직 바꿀 수 있는 것</span>
        </h1>
        <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">
          기상의 2주 벽은 <span className="text-ink-1">물리가 정한 것</span>이라 사람이 옮길 수 없습니다. 관측 위성을 몇
          대 더 띄워도 2주는 2주예요. 궤도가 정하는 수만 년의 자연 곡선도 마찬가지고요. 그런데 방금 본 종 모양이 어디까지
          미끄러질지는 <span className="text-ink-1">아직 정해지지 않았습니다.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* 왼쪽 — 버튼이 주인공이다. 누르면 오른쪽 종 모양이 그 자리에서 움직인다. */}
        <div className="flex min-w-0 flex-col gap-2">
          {futures.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(i)}
              aria-pressed={i === pick}
              className="rounded-xl border px-3.5 py-2.5 text-left transition-colors"
              style={{
                borderColor: i === pick ? f.color : 'rgb(255 255 255 / 0.12)',
                background: i === pick ? `color-mix(in oklab, ${f.color} 14%, transparent)` : 'transparent',
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold" style={{ color: f.color }}>
                  {f.label}
                </span>
                <span className="tnum text-[13px] font-semibold text-ink-1">지금보다 +{f.shift.toFixed(1)}℃</span>
              </div>
              {/* 확률은 세 경로 모두 100% 로 포화한다. 갈라지는 것은 '얼마나' 이므로,
                  자연 변동폭(σ)의 몇 배인지로 적는다 — 자연으로는 설명되지 않는 크기다. */}
              <div className="tnum mt-0.5 text-[10.5px] text-ink-3">
                해마다 튀는 폭의 <span className="text-ink-2">{(f.shift / sigma).toFixed(1)}배</span>
              </div>
            </button>
          ))}

          <div className="mt-1 rounded-xl border border-white/10 px-3.5 py-2.5">
            <h3 className="text-[12.5px] font-semibold" style={{ color: future.color }}>
              {lever.headline}
            </h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{lever.body}</p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {lever.acts.map((a) => (
                <li key={a} className="text-[11.5px] leading-relaxed text-ink-3">
                  · {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 오른쪽 — 버튼을 누르면 여기가 움직인다. 그게 이 장면의 인과다. */}
        <div className="flex flex-col gap-2.5">
          <MiniShift sigma={sigma} future={future} />
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            {dragged2100 !== null && (
              <>
                아까 2100년을 <span className="tnum text-ink-1">{dragged2100.toFixed(2)}℃</span>로 직접 끌어보셨습니다.{' '}
              </>
            )}
            버튼을 옮기면 종 모양이 그만큼 덜, 또는 더 미끄러집니다 —{' '}
            <span className="text-ink-1">그 버튼이 실제로는 우리가 지금 하는 선택입니다.</span>
          </p>

          {orbitResult && (
            <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `color-mix(in oklab, ${TONE_CH} 40%, transparent)` }}>
              <div className="text-[10.5px] text-ink-3">3단계 · 임계점 복구</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[15px] font-semibold" style={{ color: orbitResult.success ? 'var(--color-good)' : 'var(--color-warn)' }}>
                  {orbitResult.success ? '복구 성공' : '복구 실패'}
                </span>
                <span className="tnum text-[11.5px] text-ink-2">
                  {orbitResult.earned}/{ORBIT_MISSION_MAX}점
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                거기선 다이얼이 양방향으로 돌았지만, 실제 임계점은 한 방향으로만 열립니다.
              </p>
            </div>
          )}

          <div className="mt-auto rounded-xl border border-white/10 px-3.5 py-3 text-center">
            <div className="text-[10.5px] text-ink-3">최종 점수</div>
            <div className="tnum mt-0.5 text-[30px] leading-none font-semibold">
              {totals.earned}
              <span className="text-[15px] text-ink-3"> / {totals.max}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** 선택한 경로에서 분포가 얼마나 밀리는지 — ② 장면의 그림을 작게 되풀이한다 */
function MiniShift({
  sigma,
  future,
}: {
  sigma: number
  future: { label: string; color: string; shift: number }
}) {
  const sigmaF = sigma * SIGMA_WIDEN
  /* 축은 세 경로에 대해 **고정**이다. 선택에 따라 축이 늘었다 줄면 종 모양이 옮겨간 건지
     자가 바뀐 건지 알 수 없어, 이 장면이 보여주려는 인과가 그대로 사라진다.
     가장 먼 경로(SSP5)의 종 모양 오른쪽 끝까지 담을 폭으로 잡는다. */
  const xDomain: [number, number] = [-3 * sigma, 5.5 + 3 * sigmaF]
  const x = linearScale(xDomain, [MINI_M.left, MINI_W - MINI_M.right])
  const peak = normPdf(0, 0, sigma)
  const y = linearScale([0, peak * 1.2], [MINI_H - MINI_M.bottom, MINI_M.top])

  const curve = (mu: number, sd: number) => {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 80; i++) {
      const v = xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / 80
      pts.push([x(v), y(normPdf(v, mu, sd))])
    }
    return pts
  }
  const area = (pts: Array<[number, number]>) =>
    `${smoothPath(pts)} L${pts[pts.length - 1][0]} ${y(0)} L${pts[0][0]} ${y(0)} Z`

  return (
    <div>
      <ChartFrame
        width={MINI_W}
        height={MINI_H}
        margins={MINI_M}
        x={x}
        y={y}
        xTicks={[0, 2, 4, 6]}
        yTicks={[]}
        xTickFormat={(v) => (v === 0 ? '지금' : `+${v}℃`)}
      >
        <path d={area(curve(0, sigma))} fill="var(--color-series-obs)" opacity={0.1} />
        <path d={smoothPath(curve(0, sigma))} fill="none" stroke="var(--color-series-obs)" strokeWidth={1.4} />
        {/* 색과 위치가 동시에 바뀐다 — 버튼을 누른 결과가 한눈에 보여야 한다 */}
        <path d={area(curve(future.shift, sigmaF))} fill={future.color} opacity={0.22} />
        <path d={smoothPath(curve(future.shift, sigmaF))} fill="none" stroke={future.color} strokeWidth={2.2} />
        <text
          x={Math.min(MINI_W - MINI_M.right - 26, x(future.shift))}
          y={y(normPdf(future.shift, future.shift, sigmaF)) - 6}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          fill={future.color}
        >
          {future.label}
        </text>
      </ChartFrame>
      <div className="-mt-1 text-center text-[10.5px] text-ink-3">2100년 연평균기온의 분포</div>
    </div>
  )
}
