// 설정 → 교환주기 현황.
// 주기가 있는 모든 카테고리의 마지막 교환일·주행거리, 잔여량, 진행 막대를 보여준다. (4.6절)
import { useMemo } from 'react'
import { AppBar, Empty } from '../components/ui'
import { IntervalBar, intervalText, lastChangeText, remainText, statusColor } from '../components/IntervalBar'
import { useAppData } from '../hooks'
import { allIntervalStatuses, currentOdometer } from '../lib/calc'
import { km } from '../lib/format'

export default function IntervalStatusPage() {
  const { categories, groups, fuelLogs, expenses, loading } = useAppData()

  const odoNow = useMemo(() => currentOdometer(fuelLogs, expenses), [fuelLogs, expenses])

  const rows = useMemo(() => {
    const list = allIntervalStatuses(categories, expenses, odoNow)
    const byId = new Map(categories.map((c) => [c.id, c]))
    const groupById = new Map(groups.map((g) => [g.id, g]))
    // 급한 것부터: 초과 → 임박 → 정상 → 기록 없음
    const rank = { over: 0, due: 1, ok: 2, none: 3 }
    return list
      .map((s) => {
        const c = byId.get(s.categoryId)!
        return { status: s, category: c, group: groupById.get(c.groupId) }
      })
      .sort((a, b) =>
        rank[a.status.state] - rank[b.status.state] ||
        (a.status.ratio ?? 99) - (b.status.ratio ?? 99),
      )
  }, [categories, groups, expenses, odoNow])

  if (loading) return <div className="p-6 text-slate-500">불러오는 중…</div>

  return (
    <>
      <AppBar title="교환주기 현황" />

      <div className="px-4 pb-2 pt-3 text-sm text-slate-500 dark:text-slate-400">
        현재 주행거리 {km(odoNow)}
      </div>

      {rows.length === 0 ? (
        <Empty>교환주기가 설정된 카테고리가 없습니다</Empty>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {rows.map(({ status, category, group }) => (
            <li key={status.categoryId} className="px-4 py-3">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group?.color ?? '#6B7280' }} />
                <span className="flex-1 truncate font-medium">{category.name}</span>
                <span
                  className="shrink-0 text-sm font-semibold"
                  style={{ color: status.state === 'none' ? undefined : statusColor(status.state) }}
                >
                  {remainText(status)}
                </span>
              </div>
              <IntervalBar status={status} />
              <div className="mt-1.5 flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{lastChangeText(status)}</span>
                <span className="shrink-0">
                  주기 {intervalText(category.intervalKm, category.intervalMonths)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="px-4 py-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        막대는 마지막 교환 이후 쓴 만큼을 나타냅니다. 잔여가 10% 이하면 주황, 기한을 넘기면 빨강입니다.
        km와 개월이 모두 있는 카테고리는 먼저 도래하는 쪽을 기준으로 합니다.
        주기는 설정 → 카테고리 관리에서 차량 매뉴얼에 맞게 고칠 수 있습니다.
      </p>
    </>
  )
}
