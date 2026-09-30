// 4.4 기록 목록. 주유와 지출을 날짜 역순 한 목록으로 보여주고 필터를 건다.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, PageTitle } from '../components/ui'
import { RecordItem, mergeEntries } from '../components/RecordItem'
import { indexById, useAppData } from '../hooks'
import { dateDot, won } from '../lib/format'

type Filter = 'all' | 'fuel' | 'expense'

export default function Records() {
  const { groups, categories, fuelLogs, expenses, loading } = useAppData()
  const [filter, setFilter] = useState<Filter>('all')
  const [categoryId, setCategoryId] = useState<string>('')

  const catMap = useMemo(() => indexById(categories), [categories])
  const groupMap = useMemo(() => indexById(groups), [groups])

  const entries = useMemo(() => {
    const fuels = filter === 'expense' ? [] : fuelLogs
    let exps = filter === 'fuel' ? [] : expenses
    if (categoryId) exps = exps.filter((e) => e.categoryId === categoryId)
    return mergeEntries(fuels, exps)
  }, [filter, categoryId, fuelLogs, expenses])

  /** 기록이 있는 카테고리만 필터 목록에 띄운다. */
  const usedCategories = useMemo(() => {
    const used = new Set(expenses.map((e) => e.categoryId))
    return categories.filter((c) => used.has(c.id))
  }, [categories, expenses])

  const total = useMemo(
    () => entries.reduce((s, e) => s + (e.kind === 'fuel' ? e.item.totalPrice : e.item.amount), 0),
    [entries],
  )

  if (loading) return <div className="p-6 text-slate-500">불러오는 중…</div>

  return (
    <div>
      <PageTitle>기록</PageTitle>

      <div className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-slate-50/95 px-4 pb-3 pt-1 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex gap-2">
          {([['all', '전체'], ['fuel', '주유만'], ['expense', '지출만']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setFilter(v)
                if (v === 'fuel') setCategoryId('')
              }}
              className={`min-h-[36px] flex-1 rounded-lg px-3 text-sm font-medium ${
                filter === v
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {filter !== 'fuel' ? (
          <select
            className="field py-2 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">카테고리 전체</option>
            {usedCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : null}
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{entries.length}건</span>
          <span>합계 {won(total)}</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <Empty />
      ) : (
        <div className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
          {entries.map((e) => (
            <RecordItem key={e.item.id} entry={e} categories={catMap} groups={groupMap} />
          ))}
        </div>
      )}

      {/* 목록 끝에 기간 안내 */}
      {entries.length > 0 ? (
        <p className="px-4 py-4 text-center text-xs text-slate-400">
          {dateDot(entries.at(-1)!.date)} ~ {dateDot(entries[0].date)}
        </p>
      ) : null}

      {/* 엄지가 닿는 위치의 추가 버튼 */}
      <div className="fixed bottom-20 right-4 z-20 flex flex-col gap-2">
        <Link to="/expense/new" className="btn-ghost h-12 w-12 !px-0 shadow-lg" aria-label="지출 추가">＋</Link>
        <Link to="/fuel/new" className="btn-primary h-14 w-14 !px-0 text-2xl shadow-lg" aria-label="주유 추가">⛽</Link>
      </div>
    </div>
  )
}
