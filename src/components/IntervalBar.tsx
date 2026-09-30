// 교환주기 진행 막대와 상태 표시. 홈 카드와 설정 현황 화면이 함께 쓴다. (8.3절)
import type { IntervalStatus } from '../lib/calc'
import { STATUS_COLOR } from '../seed'
import { dateDot, km, num } from '../lib/format'

/** 상태별 색. 정상은 회색, 임박 주황, 초과 빨강. 그룹 색과는 분리한다. */
export function statusColor(state: IntervalStatus['state']): string {
  if (state === 'over') return STATUS_COLOR.over
  if (state === 'due') return STATUS_COLOR.due
  return '#94A3B8'
}

/** 잔여량을 한 줄 문장으로. "3,200 km 남음" / "45일 초과" */
export function remainText(s: IntervalStatus): string {
  if (s.state === 'none') return '기록 없음'
  // 판정 기준이 된 쪽을 먼저 쓴다.
  if (s.basis === 'km' && s.remainingKm !== null) {
    return s.remainingKm >= 0 ? `${num(s.remainingKm)} km 남음` : `${num(-s.remainingKm)} km 초과`
  }
  if (s.remainingDays !== null) {
    return s.remainingDays >= 0 ? `${num(s.remainingDays)}일 남음` : `${num(-s.remainingDays)}일 초과`
  }
  return ''
}

/** 마지막 교환 시점 설명 */
export function lastChangeText(s: IntervalStatus): string {
  if (!s.lastDate) return '교환 기록이 없습니다'
  const parts = [dateDot(s.lastDate)]
  if (s.lastOdometer !== null) parts.push(km(s.lastOdometer))
  return `마지막 교환 ${parts.join(' · ')}`
}

/**
 * 가로 진행 막대. 채워진 비율 = 사용량 / 주기.
 * 초과한 경우에도 100%를 꽉 채워 빨갛게 보여준다.
 */
export function IntervalBar({ status }: { status: IntervalStatus }) {
  // ratio는 '남은 비율'이므로 사용량은 1 - ratio다.
  const used = status.ratio === null ? 0 : Math.min(Math.max(1 - status.ratio, 0), 1)
  const color = statusColor(status.state)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${used * 100}%`, background: color }}
      />
    </div>
  )
}

/** 주기 설명. "10,000 km / 12개월" */
export function intervalText(intervalKm?: number | null, intervalMonths?: number | null): string {
  const parts: string[] = []
  if (intervalKm) parts.push(`${num(intervalKm)} km`)
  if (intervalMonths) parts.push(`${intervalMonths}개월`)
  return parts.join(' / ')
}
