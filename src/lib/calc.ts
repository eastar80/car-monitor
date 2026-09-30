// 5절 계산 규칙. 화면과 분리된 순수 함수만 두어 단위 테스트가 쉽게 한다.
import type { Category, DateStr, Expense, FuelLog, Group } from '../types'
import { addMonths, diffDays, monthKey, today, yearKey } from './date'

/** 조회 기간 (양 끝 포함) */
export interface Period {
  from: DateStr
  to: DateStr
}

/** 날짜가 기간 안에 드는지 */
export function inPeriod(date: DateStr, p: Period): boolean {
  return date >= p.from && date <= p.to
}

// ---------------------------------------------------------------------------
// 5.1 기간 연비 (km/L)
// ---------------------------------------------------------------------------

export interface MileageResult {
  /** 연비(km/L). 계산 불가면 null */
  kmPerLiter: number | null
  /** 기간 주행거리 = 마지막 odometer − 첫 odometer */
  distanceKm: number
  /** 분모에 쓴 리터 합 (마지막 건 제외) */
  litersUsed: number
  /** 계산에 쓴 주유 건수 */
  count: number
  /** null인 이유 */
  reason?: '데이터 부족' | '주행거리 없음'
}

/**
 * 기간 연비를 계산한다.
 *
 * 연비 = (마지막 주유의 odometer − 첫 주유의 odometer) ÷ Σ liters(마지막 건 제외)
 *
 * 마지막 주유분은 아직 소모되지 않은 연료이므로 분모에서 뺀다.
 * 기간 내 주유 기록이 3건 미만이면 계산하지 않고 '데이터 부족'으로 둔다.
 */
export function periodMileage(logs: FuelLog[]): MileageResult {
  const sorted = sortFuel(logs)
  if (sorted.length < 3) {
    return { kmPerLiter: null, distanceKm: 0, litersUsed: 0, count: sorted.length, reason: '데이터 부족' }
  }
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const distanceKm = last.odometer - first.odometer
  // 마지막 건을 뺀 나머지의 리터 합
  const litersUsed = sorted.slice(0, -1).reduce((s, f) => s + f.liters, 0)
  if (distanceKm <= 0 || litersUsed <= 0) {
    return { kmPerLiter: null, distanceKm, litersUsed, count: sorted.length, reason: '주행거리 없음' }
  }
  return { kmPerLiter: distanceKm / litersUsed, distanceKm, litersUsed, count: sorted.length }
}

// ---------------------------------------------------------------------------
// 5.2 연료비 원/km
// ---------------------------------------------------------------------------

/**
 * 주유비 기준 원/km.
 * = Σ totalPrice(마지막 건 제외) ÷ (마지막 odometer − 첫 odometer)
 * 연비와 같은 이유로 마지막 주유 금액은 분자에서 뺀다.
 */
export function fuelCostPerKm(logs: FuelLog[]): number | null {
  const sorted = sortFuel(logs)
  if (sorted.length < 3) return null
  const distanceKm = sorted[sorted.length - 1].odometer - sorted[0].odometer
  if (distanceKm <= 0) return null
  const cost = sorted.slice(0, -1).reduce((s, f) => s + f.totalPrice, 0)
  return cost / distanceKm
}

/**
 * 통계 요약에 쓰는 원/km.
 * 주유비만이 아니라 기간 내 '통계 포함' 지출 전체(주유 + 정비·기타)를
 * 기간 주행거리로 나눈 값이다. 주행거리는 주유 기록의 odometer 차로 잡는다.
 */
export function totalCostPerKm(
  logs: FuelLog[],
  expenses: Expense[],
  categories: Category[],
  groups: Group[],
): number | null {
  const sorted = sortFuel(logs)
  if (sorted.length < 3) return null
  const distanceKm = sorted[sorted.length - 1].odometer - sorted[0].odometer
  if (distanceKm <= 0) return null
  const fuelCost = sorted.slice(0, -1).reduce((s, f) => s + f.totalPrice, 0)
  const etcCost = statsIncludedExpenses(expenses, categories, groups).reduce((s, e) => s + e.amount, 0)
  return (fuelCost + etcCost) / distanceKm
}

/** 주유 기록을 날짜순으로 정렬한다. 같은 날이면 odometer가 작은 쪽을 앞에 둔다. */
export function sortFuel(logs: FuelLog[]): FuelLog[] {
  return [...logs].sort((a, b) => (a.date === b.date ? a.odometer - b.odometer : a.date < b.date ? -1 : 1))
}

// ---------------------------------------------------------------------------
// 5.3 교환주기 잔여량
// ---------------------------------------------------------------------------

export type IntervalState = 'none' | 'ok' | 'due' | 'over'

export interface IntervalStatus {
  categoryId: string
  categoryName: string
  state: IntervalState
  /** 마지막 교환 기록 */
  lastDate: DateStr | null
  lastOdometer: number | null
  /** 잔여 km. intervalKm가 없으면 null */
  remainingKm: number | null
  /** 잔여 일수. intervalMonths가 없으면 null */
  remainingDays: number | null
  /** 상태 판정의 기준이 된 쪽 */
  basis: 'km' | 'months' | null
  /** 잔여 비율(0~1). 1이면 막 교환한 상태, 0 이하면 도래/초과 */
  ratio: number | null
}

/**
 * 한 카테고리의 교환주기 상태를 판정한다.
 *
 * - 잔여 km   = 마지막 교환 odometer + intervalKm − 현재 주행거리
 * - 잔여 일수 = (마지막 교환 date + intervalMonths) − 오늘
 * - 둘 다 있으면 잔여 비율이 더 작은(= 먼저 도래하는) 쪽을 기준으로 한다.
 * - 상태: 정상(ok, 잔여 10% 초과) / 임박(due, 잔여 10% 이하) / 초과(over, 잔여 음수)
 *   / 기록 없음(none, 해당 카테고리 지출이 한 건도 없음)
 */
export function intervalStatus(
  category: Category,
  expenses: Expense[],
  currentOdometer: number,
  todayStr: DateStr = today(),
): IntervalStatus {
  const base: IntervalStatus = {
    categoryId: category.id,
    categoryName: category.name,
    state: 'none',
    lastDate: null,
    lastOdometer: null,
    remainingKm: null,
    remainingDays: null,
    basis: null,
    ratio: null,
  }

  const mine = expenses
    .filter((e) => e.categoryId === category.id)
    .sort((a, b) => (a.date === b.date ? a.odometer - b.odometer : a.date < b.date ? -1 : 1))
  const last = mine[mine.length - 1]
  if (!last) return base

  base.lastDate = last.date
  base.lastOdometer = last.odometer

  // 주기가 아예 없는 카테고리는 상태를 판정하지 않는다.
  if (!category.intervalKm && !category.intervalMonths) return base

  let ratioKm: number | null = null
  if (category.intervalKm) {
    base.remainingKm = last.odometer + category.intervalKm - currentOdometer
    ratioKm = base.remainingKm / category.intervalKm
  }

  let ratioMonths: number | null = null
  if (category.intervalMonths) {
    const due = addMonths(last.date, category.intervalMonths)
    base.remainingDays = diffDays(todayStr, due)
    const totalDays = diffDays(last.date, due)
    ratioMonths = totalDays > 0 ? base.remainingDays / totalDays : 0
  }

  // 먼저 도래하는 쪽 = 잔여 비율이 더 작은 쪽
  if (ratioKm !== null && ratioMonths !== null) {
    base.basis = ratioKm <= ratioMonths ? 'km' : 'months'
    base.ratio = Math.min(ratioKm, ratioMonths)
  } else if (ratioKm !== null) {
    base.basis = 'km'
    base.ratio = ratioKm
  } else {
    base.basis = 'months'
    base.ratio = ratioMonths
  }

  base.state = base.ratio! < 0 ? 'over' : base.ratio! <= 0.1 ? 'due' : 'ok'
  return base
}

/** 여러 카테고리의 교환주기 상태를 한 번에 구한다. 주기가 있는 카테고리만 대상. */
export function allIntervalStatuses(
  categories: Category[],
  expenses: Expense[],
  currentOdometer: number,
  todayStr: DateStr = today(),
): IntervalStatus[] {
  return categories
    .filter((c) => !c.isArchived && (c.intervalKm || c.intervalMonths))
    .map((c) => intervalStatus(c, expenses, currentOdometer, todayStr))
}

// ---------------------------------------------------------------------------
// 5.4 월별 집계
// ---------------------------------------------------------------------------

/** 통계에 포함되는 그룹(차량구입 제외)에 속한 지출만 남긴다. */
export function statsIncludedExpenses(
  expenses: Expense[],
  categories: Category[],
  groups: Group[],
): Expense[] {
  const included = includedGroupIds(groups)
  const catGroup = new Map(categories.map((c) => [c.id, c.groupId]))
  return expenses.filter((e) => {
    const gid = catGroup.get(e.categoryId)
    return gid !== undefined && included.has(gid)
  })
}

/** includeInStats가 true인 그룹 id 집합 */
export function includedGroupIds(groups: Group[]): Set<string> {
  return new Set(groups.filter((g) => g.includeInStats).map((g) => g.id))
}

/** 기간·차량으로 거른 기록 */
export function filterFuel(logs: FuelLog[], vehicleId: string, p?: Period): FuelLog[] {
  return logs.filter((f) => f.vehicleId === vehicleId && (!p || inPeriod(f.date, p)))
}

export function filterExpenses(expenses: Expense[], vehicleId: string, p?: Period): Expense[] {
  return expenses.filter((e) => e.vehicleId === vehicleId && (!p || inPeriod(e.date, p)))
}

/** 한 구간(월 또는 연)의 그룹별 금액 */
export interface BucketRow {
  /** 'YYYY-MM' 또는 'YYYY' */
  key: string
  /** 주유비 */
  fuel: number
  /** 그룹 id → 금액 */
  byGroup: Record<string, number>
  /** 합계 (주유 + 통계 포함 그룹) */
  total: number
}

/**
 * 월(또는 연)별로 주유비와 그룹별 지출을 모은다.
 * 월 귀속은 date 기준이고 odometer는 쓰지 않는다.
 * includeInStats가 false인 그룹(차량구입)은 여기서 빠진다.
 */
export function bucketByPeriod(
  keys: string[],
  logs: FuelLog[],
  expenses: Expense[],
  categories: Category[],
  groups: Group[],
  unit: 'month' | 'year',
): BucketRow[] {
  const keyOf = unit === 'month' ? monthKey : yearKey
  const included = includedGroupIds(groups)
  const catGroup = new Map(categories.map((c) => [c.id, c.groupId]))

  const rows = new Map<string, BucketRow>(
    keys.map((k) => [k, { key: k, fuel: 0, byGroup: {}, total: 0 }]),
  )
  const touch = (k: string) => {
    let r = rows.get(k)
    if (!r) { r = { key: k, fuel: 0, byGroup: {}, total: 0 }; rows.set(k, r) }
    return r
  }

  for (const f of logs) {
    const r = touch(keyOf(f.date))
    r.fuel += f.totalPrice
    r.total += f.totalPrice
  }
  for (const e of expenses) {
    const gid = catGroup.get(e.categoryId)
    if (gid === undefined || !included.has(gid)) continue
    const r = touch(keyOf(e.date))
    r.byGroup[gid] = (r.byGroup[gid] ?? 0) + e.amount
    r.total += e.amount
  }

  return keys.map((k) => rows.get(k)!)
}

/** 통계 요약 숫자 */
export interface Summary {
  /** 총지출 = 주유비 + 정비·기타 (차량구입 제외) */
  total: number
  /** 주유비 */
  fuel: number
  /** 정비·기타 (통계 포함 그룹의 지출 합) */
  etc: number
}

export function summarize(
  logs: FuelLog[],
  expenses: Expense[],
  categories: Category[],
  groups: Group[],
): Summary {
  const fuel = logs.reduce((s, f) => s + f.totalPrice, 0)
  const etc = statsIncludedExpenses(expenses, categories, groups).reduce((s, e) => s + e.amount, 0)
  return { total: fuel + etc, fuel, etc }
}

/** 4.5-6 전체 보유비용: 기간과 무관한 누적 합계(차량구입 포함) */
export function totalOwnershipCost(logs: FuelLog[], expenses: Expense[]): number {
  return (
    logs.reduce((s, f) => s + f.totalPrice, 0) + expenses.reduce((s, e) => s + e.amount, 0)
  )
}

/** 차량의 현재 주행거리 = 그 차량의 주유·지출 기록 중 최대 odometer */
export function currentOdometer(logs: FuelLog[], expenses: Expense[]): number {
  let max = 0
  for (const f of logs) if (f.odometer > max) max = f.odometer
  for (const e of expenses) if (e.odometer > max) max = e.odometer
  return max
}

/** 도넛용 카테고리별 합계 (금액 내림차순) */
export interface Slice {
  id: string
  name: string
  color: string
  amount: number
  ratio: number
}

/**
 * 비중 도넛 데이터를 만든다.
 * 조각이 3% 미만이면 '기타'로 묶어 조각 수를 6개 이하로 유지한다. (8.3절)
 */
export function makeSlices(
  entries: { id: string; name: string; color: string; amount: number }[],
  maxSlices = 6,
  minRatio = 0.03,
): Slice[] {
  const total = entries.reduce((s, e) => s + e.amount, 0)
  if (total <= 0) return []
  const sorted = [...entries].filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount)

  const keep: typeof sorted = []
  const lump: typeof sorted = []
  for (const e of sorted) {
    if (e.amount / total >= minRatio && keep.length < maxSlices - (sorted.length > maxSlices ? 1 : 0)) {
      keep.push(e)
    } else {
      lump.push(e)
    }
  }
  const out: Slice[] = keep.map((e) => ({ ...e, ratio: e.amount / total }))
  if (lump.length === 1) {
    // 하나뿐이면 굳이 묶지 않는다.
    out.push({ ...lump[0], ratio: lump[0].amount / total })
  } else if (lump.length > 1) {
    const amount = lump.reduce((s, e) => s + e.amount, 0)
    // 실제 '기타' 그룹과 헷갈리지 않도록 묶음 조각은 '그 외'로 부른다.
    out.push({ id: '__rest__', name: '그 외', color: '#94A3B8', amount, ratio: amount / total })
  }
  return out
}

// ---------------------------------------------------------------------------
// 기간 선택기 (4.5절)
// ---------------------------------------------------------------------------

export type PeriodPreset = 'thisMonth' | 'thisYear' | 'last12' | 'custom'

/** 프리셋 이름 → 실제 기간. 기준일을 넘기면 테스트에서 '오늘'을 고정할 수 있다. */
export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, base: DateStr = today()): Period {
  const y = base.slice(0, 4)
  switch (preset) {
    case 'thisMonth':
      return { from: `${base.slice(0, 7)}-01`, to: base }
    case 'thisYear':
      return { from: `${y}-01-01`, to: base }
    case 'last12': {
      // 11개월 전 1일부터 오늘까지 = 이번 달을 포함한 12개월
      const start = addMonths(`${base.slice(0, 7)}-01`, -11)
      return { from: start, to: base }
    }
  }
}

/** 기간이 24개월을 넘으면 월별 대신 연도별 막대로 전환한다. (4.5-2) */
export function bucketUnit(p: Period): 'month' | 'year' {
  const months =
    (Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4))) * 12 +
    (Number(p.to.slice(5, 7)) - Number(p.from.slice(5, 7))) +
    1
  return months > 24 ? 'year' : 'month'
}

/** 직전 기간(지난달 대비 증감용). 이번 달 기간을 주면 지난달 전체를 돌려준다. */
export function previousMonthPeriod(base: DateStr = today()): Period {
  const prev = addMonths(`${base.slice(0, 7)}-01`, -1)
  const [py, pm] = prev.split('-').map(Number)
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate()
  return { from: prev, to: `${prev.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` }
}

// ---------------------------------------------------------------------------
// 연비 집계 (2단계 통계용)
// ---------------------------------------------------------------------------

export interface YearMileage {
  year: string
  /** 그 해의 연비. 계산 불가면 null */
  kmPerLiter: number | null
  /** 그 해 주유 건수 */
  count: number
}

/**
 * 연도별 연비.
 * 각 연도 1/1~12/31을 기간으로 잡아 5.1절 규칙을 그대로 적용한다.
 * '마지막 건 제외' 규칙 때문에 연도 경계에서 데이터가 일부 겹칠 수 있는데,
 * 개발요청서 5.1절에서 이를 허용한다.
 */
export function yearlyMileage(logs: FuelLog[], years: string[]): YearMileage[] {
  return years.map((y) => {
    const ofYear = logs.filter((f) => f.date.startsWith(y))
    const r = periodMileage(ofYear)
    return { year: y, kmPerLiter: r.kmPerLiter, count: ofYear.length }
  })
}

/** 유가 추이용 점 목록. 날짜순으로 정렬한 리터당 가격. */
export interface PricePoint {
  date: DateStr
  price: number
}

export function pricePoints(logs: FuelLog[]): PricePoint[] {
  return sortFuel(logs).map((f) => ({ date: f.date, price: f.pricePerLiter }))
}
