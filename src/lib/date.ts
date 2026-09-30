// 날짜 계산 도우미.
// 날짜는 모두 'YYYY-MM-DD' 문자열로 다루고, 계산할 때만 UTC 기준 Date로 바꾼다.
// (현지 시간대를 쓰면 기기 시간대에 따라 하루가 밀릴 수 있어서 UTC로 고정한다.)
import type { DateStr } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' → UTC 자정 Date */
export function toUTC(date: DateStr): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Date → 'YYYY-MM-DD' */
export function fromUTC(d: Date): DateStr {
  return d.toISOString().slice(0, 10)
}

/** 오늘 날짜를 기기의 현지 날짜 기준 'YYYY-MM-DD'로 돌려준다. */
export function today(): DateStr {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 두 날짜의 차이(일). b - a */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS)
}

/**
 * 개월 더하기. 더한 달에 그 일자가 없으면 그 달의 마지막 날로 맞춘다.
 * 예: 2025-01-31 + 1개월 = 2025-02-28
 */
export function addMonths(date: DateStr, months: number): DateStr {
  const [y, m, d] = date.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = total % 12
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return fromUTC(new Date(Date.UTC(ny, nm, Math.min(d, lastDay))))
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthKey(date: DateStr): string {
  return date.slice(0, 7)
}

/** 'YYYY-MM-DD' → 'YYYY' */
export function yearKey(date: DateStr): string {
  return date.slice(0, 4)
}

/** 시작 월부터 끝 월까지의 'YYYY-MM' 목록 (양 끝 포함) */
export function monthRange(fromDate: DateStr, toDate: DateStr): string[] {
  const out: string[] = []
  let [y, m] = [Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7))]
  const [ey, em] = [Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7))]
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/** 시작 연도부터 끝 연도까지의 'YYYY' 목록 (양 끝 포함) */
export function yearRange(fromDate: DateStr, toDate: DateStr): string[] {
  const out: string[] = []
  for (let y = Number(fromDate.slice(0, 4)); y <= Number(toDate.slice(0, 4)); y++) {
    out.push(String(y))
  }
  return out
}

/** 해당 월의 1일 */
export function startOfMonth(date: DateStr): DateStr {
  return `${date.slice(0, 7)}-01`
}

/** 해당 월의 마지막 날 */
export function endOfMonth(date: DateStr): DateStr {
  const [y, m] = date.split('-').map(Number)
  return fromUTC(new Date(Date.UTC(y, m, 0)))
}
