// 4.5 통계 화면.
// 1단계 범위: 기간 선택기, 요약 숫자, 월별 누적 막대, 비중 도넛, 전체 보유비용.
// (연비·유가 추이·원/km는 2단계)
import { useMemo, useState } from 'react'
import { Donut, MileageBars, PriceLine, StackedBars, type Series } from '../components/charts'
import { PageTitle } from '../components/ui'
import { useAppData } from '../hooks'
import { FUEL_SERIES, STACK_ORDER } from '../seed'
import {
  bucketByPeriod,
  bucketUnit,
  filterExpenses,
  filterFuel,
  fuelCostPerKm,
  makeSlices,
  periodMileage,
  presetPeriod,
  pricePoints,
  statsIncludedExpenses,
  summarize,
  totalCostPerKm,
  totalOwnershipCost,
  yearlyMileage,
  type Period,
  type PeriodPreset,
} from '../lib/calc'
import { monthRange, today, yearRange } from '../lib/date'
import { dateDot, num, won, wonShort } from '../lib/format'

export default function Stats() {
  const { vehicle, groups, categories, fuelLogs, expenses, loading } = useAppData()
  const [preset, setPreset] = useState<PeriodPreset>('thisYear')
  const [custom, setCustom] = useState<Period>({ from: `${today().slice(0, 4)}-01-01`, to: today() })
  /** 도넛 드릴다운: 선택한 그룹 id (null이면 그룹 단위) */
  const [drill, setDrill] = useState<string | null>(null)

  const period: Period = preset === 'custom' ? custom : presetPeriod(preset)

  const view = useMemo(() => {
    if (!vehicle) return null
    const f = filterFuel(fuelLogs, vehicle.id, period)
    const e = filterExpenses(expenses, vehicle.id, period)
    const unit = bucketUnit(period)
    const keys = unit === 'month' ? monthRange(period.from, period.to) : yearRange(period.from, period.to)
    return {
      fuel: f,
      exp: e,
      unit,
      rows: bucketByPeriod(keys, f, e, categories, groups, unit),
      summary: summarize(f, e, categories, groups),
      // 5.2절: 요약의 원/km는 통계 포함 지출 전체 ÷ 기간 주행거리.
      // 주유비만의 원/km는 툴팁에 따로 보여준다.
      costPerKm: totalCostPerKm(f, e, categories, groups),
      fuelPerKm: fuelCostPerKm(f),
      mileage: periodMileage(f),
      prices: pricePoints(f),
      // 전체 보유비용은 기간과 무관한 누적 합계(차량구입 포함)
      ownership: totalOwnershipCost(
        filterFuel(fuelLogs, vehicle.id),
        filterExpenses(expenses, vehicle.id),
      ),
    }
  }, [vehicle, fuelLogs, expenses, categories, groups, period.from, period.to])

  /** 8.3절 쌓는 순서: 주유가 맨 아래, 그 위로 소모품·고정비·수리·기타 */
  const series: Series[] = useMemo(() => {
    const included = groups
      .filter((g) => g.includeInStats)
      .sort((a, b) => order(a.name) - order(b.name))
      .map((g) => ({ key: g.id, name: g.name, color: g.color }))
    return [{ key: FUEL_SERIES.key, name: FUEL_SERIES.name, color: FUEL_SERIES.color }, ...included]
  }, [groups])

  /** 도넛 데이터. 드릴다운 중이면 그 그룹의 카테고리별로 나눈다. */
  const slices = useMemo(() => {
    if (!view) return []
    if (drill === null) {
      const byGroup = new Map<string, number>()
      for (const e of statsIncludedExpenses(view.exp, categories, groups)) {
        const gid = categories.find((c) => c.id === e.categoryId)!.groupId
        byGroup.set(gid, (byGroup.get(gid) ?? 0) + e.amount)
      }
      const entries = [
        {
          id: FUEL_SERIES.key,
          name: FUEL_SERIES.name,
          color: FUEL_SERIES.color,
          amount: view.summary.fuel,
        },
        ...groups
          .filter((g) => g.includeInStats)
          .map((g) => ({ id: g.id, name: g.name, color: g.color, amount: byGroup.get(g.id) ?? 0 })),
      ]
      return makeSlices(entries)
    }
    // 특정 그룹의 카테고리별 비중
    const group = groups.find((g) => g.id === drill)
    const cats = categories.filter((c) => c.groupId === drill)
    const byCat = new Map<string, number>()
    for (const e of view.exp) {
      if (!cats.some((c) => c.id === e.categoryId)) continue
      byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount)
    }
    return makeSlices(
      cats.map((c, i) => ({
        id: c.id,
        name: c.name,
        color: shade(group?.color ?? '#6B7280', i),
        amount: byCat.get(c.id) ?? 0,
      })),
    )
  }, [view, drill, categories, groups])

  /**
   * 연비 막대는 '연도별'이 기본 단위라 기간 선택기와 무관하게
   * 전체 기록의 연도 범위를 쓴다. (4.5-4)
   */
  const { yearRows, recent12 } = useMemo(() => {
    if (!vehicle) return { yearRows: [], recent12: null }
    const all = filterFuel(fuelLogs, vehicle.id)
    if (all.length === 0) return { yearRows: [], recent12: null }
    const dates = all.map((f) => f.date).sort()
    const years = yearRange(dates[0], dates.at(-1)!)
    const last12 = presetPeriod('last12')
    return {
      yearRows: yearlyMileage(all, years),
      recent12: periodMileage(filterFuel(fuelLogs, vehicle.id, last12)),
    }
  }, [vehicle, fuelLogs])

  const drillGroup = drill ? groups.find((g) => g.id === drill) : null

  if (loading) return <div className="p-6 text-slate-500">불러오는 중…</div>

  return (
    <div className="pb-4">
      <PageTitle>통계</PageTitle>

      {/* 기간 선택기 — 모든 그래프에 공통 적용된다 */}
      <div className="space-y-2 px-4 pb-3">
        <div className="flex gap-1.5">
          {([
            ['thisMonth', '이번 달'],
            ['thisYear', '올해'],
            ['last12', '최근 12개월'],
            ['custom', '직접'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setPreset(v); setDrill(null) }}
              className={`min-h-[38px] flex-1 rounded-lg px-1 text-[13px] font-medium ${
                preset === v
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="flex items-center gap-2">
            <input type="date" className="field py-2 text-sm" value={custom.from}
                   onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className="text-slate-400">~</span>
            <input type="date" className="field py-2 text-sm" value={custom.to}
                   onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {dateDot(period.from)} ~ {dateDot(period.to)}
          </p>
        )}
      </div>

      {/* PC에서는 2열로 배치한다 (7.3절) */}
      <div className="space-y-4 px-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {/* 1. 요약 숫자 4개 */}
        <section className="card md:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Big label="총지출" value={view?.summary.total ?? 0} />
            <Big label="주유비" value={view?.summary.fuel ?? 0} />
            <Big label="정비·기타" value={view?.summary.etc ?? 0} />
            <div
              title={
                view?.fuelPerKm != null
                  ? `주유비만: ${num(view.fuelPerKm, 1)}원/km`
                  : '주유 기록이 3건 이상이어야 계산합니다'
              }
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">원/km</div>
              <div className="text-2xl font-bold">
                {view?.costPerKm != null ? num(view.costPerKm, 0) : '—'}
              </div>
              <div className="text-[11px] text-slate-400">
                {view?.fuelPerKm != null ? `주유 ${num(view.fuelPerKm, 0)}` : '데이터 부족'}
              </div>
            </div>
          </div>
        </section>

        {/* 2. 월별(또는 연도별) 누적 막대 */}
        <section className="card">
          <h2 className="mb-1 font-bold">{view?.unit === 'year' ? '연도별 지출' : '월별 지출'}</h2>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">막대를 누르면 그룹별 금액이 보입니다</p>
          <StackedBars rows={view?.rows ?? []} series={series} unit={view?.unit ?? 'month'} />
          {/* 범례: 색만으로 구분하지 않도록 항상 둔다 */}
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </li>
            ))}
          </ul>
        </section>

        {/* 3. 비중 도넛 */}
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">{drillGroup ? `${drillGroup.name} 비중` : '지출 비중'}</h2>
            {drill ? (
              <button type="button" className="text-sm font-medium text-blue-600 dark:text-blue-400"
                      onClick={() => setDrill(null)}>
                ← 전체
              </button>
            ) : (
              <span className="text-xs text-slate-500">조각을 누르면 카테고리별로 보입니다</span>
            )}
          </div>
          <Donut
            slices={slices}
            centerLabel={drillGroup ? drillGroup.name : '총지출'}
            onSelect={
              drill
                ? undefined
                : (id) => {
                    // 주유와 '기타로 묶인 조각'은 더 들어갈 곳이 없다.
                    if (id === FUEL_SERIES.key || id === '__rest__') return
                    setDrill(id)
                  }
            }
          />
        </section>

        {/* 4. 연비 */}
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-bold">연비</h2>
            <span className="text-xs text-slate-500">주유 건별로는 계산하지 않습니다</span>
          </div>
          {/* 최근 12개월 연비는 막대 옆이 아니라 카드 상단에 큰 숫자로 (8.3절) */}
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold">
              {recent12?.kmPerLiter != null ? num(recent12.kmPerLiter, 2) : '—'}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              km/L · 최근 12개월
              {recent12?.kmPerLiter == null ? ' (데이터 부족)' : ''}
            </span>
          </div>
          <MileageBars rows={yearRows} />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            연도별. 마지막 주유분은 아직 쓰지 않은 기름이라 계산에서 뺍니다.
          </p>
        </section>

        {/* 5. 유가 추이 */}
        <section className="card">
          <h2 className="mb-2 font-bold">유가 추이</h2>
          <PriceLine points={view?.prices ?? []} />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            선택한 기간의 리터당 가격입니다.
          </p>
        </section>

        {/* 6. 전체 보유비용 */}
        <section className="card md:col-span-2">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="font-bold">전체 보유비용</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">기간과 무관한 누적 합계 (차량구입 포함)</div>
            </div>
            <div className="text-xl font-bold" title={won(view?.ownership ?? 0)}>
              {wonShort(view?.ownership ?? 0)}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Big({ label, value }: { label: string; value: number }) {
  return (
    <div title={won(value)}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold">{wonShort(value)}</div>
    </div>
  )
}

/** 쌓는 순서에서의 자리. 목록에 없으면 뒤로 보낸다. */
function order(name: string): number {
  const i = STACK_ORDER.indexOf(name)
  return i === -1 ? STACK_ORDER.length : i
}

/**
 * 드릴다운 도넛용 색. 그룹 색을 흰색 쪽으로 단계적으로 섞어
 * 색조는 유지한 채 밝기만 달라지게 한다. ("같은 그룹 안"이라는 것이 보이게)
 * 각 채널에 곱하는 방식은 한 채널만 먼저 255에 닿아 형광색이 되므로 쓰지 않는다.
 */
function shade(hex: string, step: number): string {
  const n = parseInt(hex.slice(1), 16)
  // 0% → 56%까지 5단계로 흰색을 섞는다.
  const t = (step % 5) * 0.14
  const mix = (v: number) => Math.round(v + (255 - v) * t)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
