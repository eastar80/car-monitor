// 4.1 홈 화면.
// 1단계에서는 교환 임박 카드와 백업 경고를 뺀다(2단계 항목).
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'
import { RecordItem, mergeEntries } from '../components/RecordItem'
import { indexById, useAppData } from '../hooks'
import {
  currentOdometer,
  filterExpenses,
  filterFuel,
  presetPeriod,
  previousMonthPeriod,
  summarize,
} from '../lib/calc'
import { deltaPercent, km, won, wonShort } from '../lib/format'

export default function Home() {
  const { vehicle, groups, categories, fuelLogs, expenses, loading } = useAppData()

  const odoNow = useMemo(() => currentOdometer(fuelLogs, expenses), [fuelLogs, expenses])
  const catMap = useMemo(() => indexById(categories), [categories])
  const groupMap = useMemo(() => indexById(groups), [groups])

  // 이번 달과 지난달 요약 (5.4절: 차량구입 그룹 제외)
  const { thisMonth, lastMonth } = useMemo(() => {
    if (!vehicle) return { thisMonth: null, lastMonth: null }
    const cur = presetPeriod('thisMonth')
    const prev = previousMonthPeriod()
    return {
      thisMonth: summarize(
        filterFuel(fuelLogs, vehicle.id, cur),
        filterExpenses(expenses, vehicle.id, cur),
        categories,
        groups,
      ),
      lastMonth: summarize(
        filterFuel(fuelLogs, vehicle.id, prev),
        filterExpenses(expenses, vehicle.id, prev),
        categories,
        groups,
      ),
    }
  }, [vehicle, fuelLogs, expenses, categories, groups])

  const recent = useMemo(() => mergeEntries(fuelLogs, expenses).slice(0, 5), [fuelLogs, expenses])

  if (loading) return <div className="p-6 text-slate-500">불러오는 중…</div>

  return (
    <div className="space-y-4">
      {/* 1. 현재 차량과 주행거리 */}
      <div className="px-4 pt-5">
        <div className="text-sm text-slate-500 dark:text-slate-400">{vehicle?.name ?? '차량 없음'}</div>
        <div className="text-4xl font-bold tracking-tight">{km(odoNow)}</div>
      </div>

      {/* 2. 큰 버튼 두 개 */}
      <div className="grid grid-cols-2 gap-3 px-4">
        <Link to="/fuel/new" className="btn-primary h-16 text-lg">주유 추가</Link>
        <Link to="/expense/new" className="btn-ghost h-16 text-lg">지출 추가</Link>
      </div>

      {/* 4. 이번 달 요약 */}
      <section className="px-4">
        <div className="card">
          <h2 className="mb-3 text-sm font-bold text-slate-500 dark:text-slate-400">이번 달</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="주유비" value={thisMonth?.fuel ?? 0} prev={lastMonth?.fuel ?? 0} />
            <Stat label="정비·기타" value={thisMonth?.etc ?? 0} prev={lastMonth?.etc ?? 0} />
            <Stat label="합계" value={thisMonth?.total ?? 0} prev={lastMonth?.total ?? 0} strong />
          </div>
        </div>
      </section>

      {/* PC에서만 보이는 안내 (7.3절) */}
      <p className="hidden px-4 text-xs text-slate-500 md:block dark:text-slate-400">
        이 기기의 데이터는 폰과 자동으로 맞춰지지 않습니다. 설정 → 데이터에서 백업 파일을 복원해 조회하세요.
      </p>

      {/* 6. 최근 기록 5건 */}
      <section>
        <div className="flex items-center justify-between px-4 pb-1">
          <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400">최근 기록</h2>
          <Link to="/records" className="text-sm font-medium text-blue-600 dark:text-blue-400">전체 보기</Link>
        </div>
        <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {recent.length === 0 ? (
            <Empty>아직 기록이 없습니다. 위 버튼으로 첫 기록을 남겨보세요.</Empty>
          ) : (
            recent.map((e) => <RecordItem key={e.item.id} entry={e} categories={catMap} groups={groupMap} />)
          )}
        </div>
      </section>
    </div>
  )
}

/** 요약 숫자 한 칸. 지난달 대비 증감을 작은 글씨로 덧붙인다. */
function Stat({ label, value, prev, strong }: { label: string; value: number; prev: number; strong?: boolean }) {
  const delta = deltaPercent(value, prev)
  return (
    <div title={won(value)}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={strong ? 'text-xl font-bold' : 'text-xl font-semibold'}>{wonShort(value)}</div>
      {delta === null ? (
        <div className="text-[11px] text-slate-400">—</div>
      ) : (
        <div className={`text-[11px] ${delta > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
        </div>
      )}
    </div>
  )
}
