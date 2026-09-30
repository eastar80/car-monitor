// 4.1 홈 화면.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, useToast } from '../components/ui'
import { RecordItem, mergeEntries } from '../components/RecordItem'
import { remainText, statusColor } from '../components/IntervalBar'
import { indexById, useAppData } from '../hooks'
import {
  allIntervalStatuses,
  currentOdometer,
  filterExpenses,
  filterFuel,
  presetPeriod,
  previousMonthPeriod,
  summarize,
} from '../lib/calc'
import { diffDays, today } from '../lib/date'
import { deltaPercent, km, won, wonShort } from '../lib/format'
import { exportBackup } from '../lib/backup'

/** 마지막 백업 후 이 일수가 지나면 홈에 경고를 띄운다. (4.1-5) */
const BACKUP_WARN_DAYS = 30

export default function Home() {
  const { vehicle, groups, categories, fuelLogs, expenses, lastBackupAt, loading } = useAppData()
  const { show, node: toast } = useToast()
  const [backingUp, setBackingUp] = useState(false)

  const odoNow = useMemo(() => currentOdometer(fuelLogs, expenses), [fuelLogs, expenses])
  const catMap = useMemo(() => indexById(categories), [categories])
  const groupMap = useMemo(() => indexById(groups), [groups])

  /**
   * 교환 임박·초과 카테고리. (4.1-3)
   * '기록 없음'은 홈에 띄우지 않고 설정의 교환주기 현황에만 보여준다. (5.3절)
   */
  const alerts = useMemo(() => {
    const list = allIntervalStatuses(categories, expenses, odoNow).filter(
      (s) => s.state === 'due' || s.state === 'over',
    )
    // 초과가 먼저, 그 안에서는 더 급한 것부터
    return list.sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0))
  }, [categories, expenses, odoNow])

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

  /** 마지막 백업 후 지난 날짜. 백업한 적이 없으면 null */
  const daysSinceBackup = lastBackupAt ? diffDays(lastBackupAt.slice(0, 10), today()) : null
  const hasRecords = fuelLogs.length + expenses.length > 0
  const showBackupWarning =
    hasRecords && (daysSinceBackup === null || daysSinceBackup >= BACKUP_WARN_DAYS)

  async function doBackup() {
    setBackingUp(true)
    try {
      const how = await exportBackup()
      show(how === 'shared' ? '백업 파일을 공유했습니다' : '백업 파일을 저장했습니다')
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) show('백업에 실패했습니다')
    } finally {
      setBackingUp(false)
    }
  }

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

      {/* 3. 교환 임박 카드. 해당하는 카테고리가 없으면 카드 자체를 숨긴다. */}
      {alerts.length > 0 ? (
        <section className="px-4">
          <Link to="/settings/intervals" className="card block active:bg-slate-50 dark:active:bg-slate-800">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={statusColor(alerts[0].state)}
                   strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
              </svg>
              교환·갱신 시기
            </h2>
            <ul className="space-y-1.5">
              {alerts.map((s) => (
                <li key={s.categoryId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{s.categoryName}</span>
                  <span className="shrink-0 font-semibold" style={{ color: statusColor(s.state) }}>
                    {remainText(s)}
                  </span>
                </li>
              ))}
            </ul>
          </Link>
        </section>
      ) : null}

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

      {/* 5. 백업 경고 */}
      {showBackupWarning ? (
        <section className="px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {daysSinceBackup === null ? '아직 백업한 적이 없습니다' : `마지막 백업 ${daysSinceBackup}일 전`}
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-200/70">
                기록은 이 브라우저에만 저장됩니다
              </div>
            </div>
            <button
              type="button"
              disabled={backingUp}
              onClick={() => void doBackup()}
              className="btn min-h-[40px] shrink-0 bg-amber-500 px-3 text-sm text-white"
            >
              백업
            </button>
          </div>
        </section>
      ) : null}

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

      {toast}
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
