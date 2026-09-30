// 홈·기록 목록에서 함께 쓰는 기록 한 줄.
import { Link } from 'react-router-dom'
import { FUEL_SERIES } from '../seed'
import { dateDot, liters as fmtLiters, km, won } from '../lib/format'
import type { Category, Expense, FuelLog, Group } from '../types'

/** 주유·지출을 한 목록에 섞어 보여주기 위한 공통 형태 */
export type Entry =
  | { kind: 'fuel'; date: string; item: FuelLog }
  | { kind: 'expense'; date: string; item: Expense }

/** 주유와 지출을 날짜 역순 한 목록으로 합친다. */
export function mergeEntries(fuelLogs: FuelLog[], expenses: Expense[]): Entry[] {
  const all: Entry[] = [
    ...fuelLogs.map((f) => ({ kind: 'fuel' as const, date: f.date, item: f })),
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.date, item: e })),
  ]
  return all.sort((a, b) =>
    a.date === b.date ? (a.item.updatedAt < b.item.updatedAt ? 1 : -1) : a.date < b.date ? 1 : -1,
  )
}

export function RecordItem({
  entry,
  categories,
  groups,
}: {
  entry: Entry
  categories: Map<string, Category>
  groups: Map<string, Group>
}) {
  if (entry.kind === 'fuel') {
    const f = entry.item
    return (
      <Link to={`/fuel/${f.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-100 dark:active:bg-slate-800">
        <Dot color={FUEL_SERIES.color} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">주유</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {dateDot(f.date)} · {km(f.odometer)} · {fmtLiters(f.liters)}
            {f.station ? ` · ${f.station}` : ''}
          </div>
        </div>
        <div className="shrink-0 font-semibold">{won(f.totalPrice)}</div>
      </Link>
    )
  }

  const e = entry.item
  const cat = categories.get(e.categoryId)
  const group = cat ? groups.get(cat.groupId) : undefined
  const sub = [dateDot(e.date), km(e.odometer), e.memo, e.place].filter(Boolean).join(' · ')
  return (
    <Link to={`/expense/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-100 dark:active:bg-slate-800">
      <Dot color={group?.color ?? '#6B7280'} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{cat?.name ?? '알 수 없음'}</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      </div>
      <div className="shrink-0 font-semibold">{won(e.amount)}</div>
    </Link>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
}
