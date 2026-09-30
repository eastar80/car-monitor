// 5절 계산 규칙 단위 테스트.
// 특히 연비의 '마지막 건 제외'와 교환주기 상태 판정을 집중적으로 확인한다.
import { describe, expect, it } from 'vitest'
import type { Category, Expense, FuelLog, Group } from '../../types'
import {
  bucketByPeriod,
  bucketUnit,
  currentOdometer,
  fuelCostPerKm,
  intervalStatus,
  makeSlices,
  periodMileage,
  presetPeriod,
  previousMonthPeriod,
  statsIncludedExpenses,
  summarize,
  totalCostPerKm,
  totalOwnershipCost,
} from '../calc'
import { addMonths, diffDays, endOfMonth, monthRange } from '../date'

// --- 테스트용 레코드 만들기 도우미 -----------------------------------------

let n = 0
const id = () => `id${++n}`

function fuel(date: string, odometer: number, liters: number, totalPrice = 0): FuelLog {
  return {
    id: id(),
    vehicleId: 'v1',
    date,
    odometer,
    liters,
    totalPrice,
    pricePerLiter: liters > 0 ? totalPrice / liters : 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function expense(date: string, odometer: number, categoryId: string, amount: number): Expense {
  return {
    id: id(),
    vehicleId: 'v1',
    date,
    odometer,
    categoryId,
    amount,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const GROUPS: Group[] = [
  { id: 'g-buy', name: '차량구입', color: '#94A3B8', includeInStats: false, sortOrder: 0, updatedAt: '' },
  { id: 'g-fix', name: '고정비', color: '#7C3AED', includeInStats: true, sortOrder: 1, updatedAt: '' },
  { id: 'g-sup', name: '소모품', color: '#16A34A', includeInStats: true, sortOrder: 2, updatedAt: '' },
]

function cat(idv: string, name: string, groupId: string, intervalKm: number | null, intervalMonths: number | null): Category {
  return { id: idv, name, groupId, intervalKm, intervalMonths, sortOrder: 0, isArchived: false, updatedAt: '' }
}

const CATS: Category[] = [
  cat('c-car', '자동차', 'g-buy', null, null),
  cat('c-ins', '보험', 'g-fix', null, 12),
  cat('c-oil', '엔진오일', 'g-sup', 10000, 12),
  cat('c-urea', '요소수', 'g-sup', 8000, null),
  cat('c-bat', '배터리', 'g-sup', null, 42),
]

// --- 5.1 기간 연비 ----------------------------------------------------------

describe('5.1 기간 연비', () => {
  it('마지막 주유분의 리터를 분모에서 제외한다', () => {
    // 주행 1000 km, 리터 합계 100 L이지만 마지막 40 L은 아직 안 썼으므로 분모는 60 L
    const logs = [
      fuel('2026-01-01', 1000, 20),
      fuel('2026-02-01', 1500, 40),
      fuel('2026-03-01', 2000, 40),
    ]
    const r = periodMileage(logs)
    expect(r.distanceKm).toBe(1000)
    expect(r.litersUsed).toBe(60)
    expect(r.kmPerLiter).toBeCloseTo(1000 / 60, 10)
  })

  it('입력 순서가 뒤섞여 있어도 날짜순으로 첫/마지막을 잡는다', () => {
    const logs = [
      fuel('2026-03-01', 2000, 40),
      fuel('2026-01-01', 1000, 20),
      fuel('2026-02-01', 1500, 40),
    ]
    expect(periodMileage(logs).kmPerLiter).toBeCloseTo(1000 / 60, 10)
  })

  it('주유 기록이 3건 미만이면 계산하지 않고 데이터 부족으로 둔다', () => {
    expect(periodMileage([]).reason).toBe('데이터 부족')
    expect(periodMileage([fuel('2026-01-01', 1000, 20)]).kmPerLiter).toBeNull()
    const two = periodMileage([fuel('2026-01-01', 1000, 20), fuel('2026-02-01', 1500, 40)])
    expect(two.kmPerLiter).toBeNull()
    expect(two.reason).toBe('데이터 부족')
  })

  it('3건이면 계산한다 (경계값)', () => {
    const r = periodMileage([
      fuel('2026-01-01', 0, 10),
      fuel('2026-02-01', 100, 10),
      fuel('2026-03-01', 200, 10),
    ])
    expect(r.count).toBe(3)
    expect(r.kmPerLiter).toBeCloseTo(200 / 20, 10)
  })

  it('주행거리가 0이면 계산하지 않는다', () => {
    const r = periodMileage([
      fuel('2026-01-01', 1000, 10),
      fuel('2026-02-01', 1000, 10),
      fuel('2026-03-01', 1000, 10),
    ])
    expect(r.kmPerLiter).toBeNull()
    expect(r.reason).toBe('주행거리 없음')
  })

  it('같은 날 두 번 주유하면 odometer가 작은 쪽을 앞에 둔다', () => {
    const r = periodMileage([
      fuel('2026-01-01', 1200, 10),
      fuel('2026-01-01', 1000, 10),
      fuel('2026-02-01', 2000, 10),
    ])
    expect(r.distanceKm).toBe(1000)
    expect(r.litersUsed).toBe(20)
  })
})

// --- 5.2 원/km --------------------------------------------------------------

describe('5.2 연료비 원/km', () => {
  it('마지막 주유 금액을 분자에서 제외한다', () => {
    const logs = [
      fuel('2026-01-01', 1000, 20, 30000),
      fuel('2026-02-01', 1500, 40, 60000),
      fuel('2026-03-01', 2000, 40, 60000),
    ]
    // (30000 + 60000) / 1000 km = 90
    expect(fuelCostPerKm(logs)).toBeCloseTo(90, 10)
  })

  it('3건 미만이면 null', () => {
    expect(fuelCostPerKm([fuel('2026-01-01', 0, 10, 1000)])).toBeNull()
  })

  it('요약용 원/km는 통계 포함 지출 전체를 기간 주행거리로 나눈다', () => {
    const logs = [
      fuel('2026-01-01', 1000, 20, 30000),
      fuel('2026-02-01', 1500, 40, 60000),
      fuel('2026-03-01', 2000, 40, 60000),
    ]
    const expenses = [
      expense('2026-02-10', 1600, 'c-oil', 100000),
      // 차량구입 그룹은 요약에서 빠진다
      expense('2026-02-10', 1600, 'c-car', 31000000),
    ]
    // (90000 주유 + 100000 정비) / 1000 km = 190
    expect(totalCostPerKm(logs, expenses, CATS, GROUPS)).toBeCloseTo(190, 10)
  })
})

// --- 5.3 교환주기 -----------------------------------------------------------

describe('5.3 교환주기 상태 판정', () => {
  const TODAY = '2026-06-01'

  it('지출 기록이 없으면 기록 없음', () => {
    const s = intervalStatus(CATS[2], [], 50000, TODAY)
    expect(s.state).toBe('none')
    expect(s.lastDate).toBeNull()
  })

  it('km 주기: 잔여 10% 초과면 정상', () => {
    // 10,000 km 주기, 4,000 km 탔으므로 잔여 6,000 km (60%)
    const s = intervalStatus(cat('c-urea', '요소수', 'g-sup', 10000, null), [expense('2026-01-01', 40000, 'c-urea', 50000)], 44000, TODAY)
    expect(s.remainingKm).toBe(6000)
    expect(s.state).toBe('ok')
    expect(s.basis).toBe('km')
  })

  it('km 주기: 잔여가 정확히 10%면 임박 (경계값)', () => {
    const s = intervalStatus(cat('c-urea', '요소수', 'g-sup', 10000, null), [expense('2026-01-01', 40000, 'c-urea', 50000)], 49000, TODAY)
    expect(s.remainingKm).toBe(1000)
    expect(s.ratio).toBeCloseTo(0.1, 10)
    expect(s.state).toBe('due')
  })

  it('km 주기: 잔여가 음수면 초과', () => {
    const s = intervalStatus(cat('c-urea', '요소수', 'g-sup', 10000, null), [expense('2026-01-01', 40000, 'c-urea', 50000)], 51500, TODAY)
    expect(s.remainingKm).toBe(-1500)
    expect(s.state).toBe('over')
  })

  it('개월 주기: 잔여 일수를 날짜로 계산한다', () => {
    // 2025-06-01 + 12개월 = 2026-06-01. 오늘이 그날이면 잔여 0일 → 임박
    const s = intervalStatus(cat('c-bat', '배터리', 'g-sup', null, 12), [expense('2025-06-01', 10000, 'c-bat', 200000)], 20000, TODAY)
    expect(s.remainingDays).toBe(0)
    expect(s.state).toBe('due')
    expect(s.basis).toBe('months')
  })

  it('개월 주기: 기한이 지나면 초과', () => {
    const s = intervalStatus(cat('c-bat', '배터리', 'g-sup', null, 12), [expense('2025-01-01', 10000, 'c-bat', 200000)], 20000, TODAY)
    expect(s.remainingDays).toBe(diffDays(TODAY, '2026-01-01'))
    expect(s.remainingDays).toBeLessThan(0)
    expect(s.state).toBe('over')
  })

  it('km·개월이 둘 다 있으면 먼저 도래하는 쪽을 기준으로 한다', () => {
    const oil = cat('c-oil', '엔진오일', 'g-sup', 10000, 12)
    const last = [expense('2026-05-01', 40000, 'c-oil', 100000)]
    // 날짜는 이제 한 달 지났을 뿐(잔여 92%)이지만 주행은 9,700 km(잔여 3%) → km 기준 임박
    const s = intervalStatus(oil, last, 49700, TODAY)
    expect(s.basis).toBe('km')
    expect(s.state).toBe('due')
    expect(s.remainingKm).toBe(300)
    expect(s.remainingDays).toBe(diffDays(TODAY, '2027-05-01'))
  })

  it('반대로 개월이 먼저 도래하면 개월 기준으로 판정한다', () => {
    const oil = cat('c-oil', '엔진오일', 'g-sup', 10000, 12)
    // 1년 전 교환, 주행은 1,000 km뿐 → 개월 기준 임박
    const s = intervalStatus(oil, [expense('2025-06-01', 40000, 'c-oil', 100000)], 41000, TODAY)
    expect(s.basis).toBe('months')
    expect(s.state).toBe('due')
    expect(s.remainingKm).toBe(9000)
  })

  it('주기가 없는 카테고리는 마지막 기록만 담고 상태는 none', () => {
    const s = intervalStatus(CATS[0], [expense('2017-03-08', 7, 'c-car', 31000000)], 42249, TODAY)
    expect(s.state).toBe('none')
    expect(s.lastOdometer).toBe(7)
    expect(s.ratio).toBeNull()
  })

  it('같은 카테고리 기록이 여러 건이면 가장 최근 것을 마지막 교환으로 본다', () => {
    const oil = cat('c-oil', '엔진오일', 'g-sup', 10000, null)
    const s = intervalStatus(
      oil,
      [
        expense('2024-01-01', 10000, 'c-oil', 100000),
        expense('2026-01-01', 30000, 'c-oil', 100000),
        expense('2025-01-01', 20000, 'c-oil', 100000),
      ],
      35000,
      TODAY,
    )
    expect(s.lastOdometer).toBe(30000)
    expect(s.remainingKm).toBe(5000)
  })
})

// --- 5.4 월별 집계 ----------------------------------------------------------

describe('5.4 월별 집계', () => {
  it('차량구입 그룹은 월별 집계와 요약에서 빠진다', () => {
    const expenses = [
      expense('2026-01-05', 100, 'c-car', 31000000),
      expense('2026-01-06', 100, 'c-ins', 700000),
    ]
    expect(statsIncludedExpenses(expenses, CATS, GROUPS)).toHaveLength(1)

    const rows = bucketByPeriod(['2026-01'], [fuel('2026-01-10', 200, 30, 60000)], expenses, CATS, GROUPS, 'month')
    expect(rows[0].fuel).toBe(60000)
    expect(rows[0].byGroup['g-fix']).toBe(700000)
    expect(rows[0].byGroup['g-buy']).toBeUndefined()
    expect(rows[0].total).toBe(760000)
  })

  it('월 귀속은 date 기준이며 빈 달도 0으로 채운다', () => {
    const rows = bucketByPeriod(
      monthRange('2026-01-01', '2026-03-31'),
      [fuel('2026-03-02', 100, 30, 50000)],
      [],
      CATS,
      GROUPS,
      'month',
    )
    expect(rows.map((r) => r.key)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(rows[0].total).toBe(0)
    expect(rows[2].fuel).toBe(50000)
  })

  it('연도 단위로도 묶을 수 있다', () => {
    const rows = bucketByPeriod(
      ['2025', '2026'],
      [fuel('2025-05-01', 100, 30, 50000), fuel('2026-05-01', 200, 30, 70000)],
      [],
      CATS,
      GROUPS,
      'year',
    )
    expect(rows[0].fuel).toBe(50000)
    expect(rows[1].fuel).toBe(70000)
  })

  it('요약은 주유비와 정비·기타를 나눠 보여준다', () => {
    const s = summarize(
      [fuel('2026-01-10', 200, 30, 60000)],
      [expense('2026-01-05', 100, 'c-car', 31000000), expense('2026-01-06', 100, 'c-ins', 700000)],
      CATS,
      GROUPS,
    )
    expect(s.fuel).toBe(60000)
    expect(s.etc).toBe(700000)
    expect(s.total).toBe(760000)
  })

  it('전체 보유비용은 차량구입까지 모두 더한다', () => {
    const v = totalOwnershipCost(
      [fuel('2026-01-10', 200, 30, 60000)],
      [expense('2026-01-05', 100, 'c-car', 31000000)],
    )
    expect(v).toBe(31060000)
  })
})

// --- 기타 -------------------------------------------------------------------

describe('현재 주행거리', () => {
  it('주유·지출 기록 중 최대 odometer로 계산한다', () => {
    expect(
      currentOdometer([fuel('2026-01-01', 1000, 10)], [expense('2026-02-01', 2500, 'c-oil', 1)]),
    ).toBe(2500)
  })
  it('기록이 없으면 0', () => {
    expect(currentOdometer([], [])).toBe(0)
  })
})

describe('기간 선택기', () => {
  it('이번 달 / 올해 / 최근 12개월', () => {
    expect(presetPeriod('thisMonth', '2026-06-16')).toEqual({ from: '2026-06-01', to: '2026-06-16' })
    expect(presetPeriod('thisYear', '2026-06-16')).toEqual({ from: '2026-01-01', to: '2026-06-16' })
    expect(presetPeriod('last12', '2026-06-16')).toEqual({ from: '2025-07-01', to: '2026-06-16' })
  })

  it('24개월을 넘으면 연도별 막대로 바꾼다', () => {
    expect(bucketUnit({ from: '2026-01-01', to: '2026-12-31' })).toBe('month')
    expect(bucketUnit({ from: '2025-01-01', to: '2026-12-31' })).toBe('month') // 24개월
    expect(bucketUnit({ from: '2024-12-01', to: '2026-12-31' })).toBe('year') // 25개월
  })

  it('지난달 기간은 그 달 전체를 덮는다', () => {
    expect(previousMonthPeriod('2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousMonthPeriod('2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('도넛 조각 묶기', () => {
  it('3% 미만 조각을 기타로 묶어 6개 이하로 만든다', () => {
    const entries = [
      { id: 'a', name: 'A', color: '#111', amount: 500 },
      { id: 'b', name: 'B', color: '#222', amount: 300 },
      { id: 'c', name: 'C', color: '#333', amount: 150 },
      { id: 'd', name: 'D', color: '#444', amount: 30 },
      { id: 'e', name: 'E', color: '#555', amount: 10 },
      { id: 'f', name: 'F', color: '#666', amount: 5 },
      { id: 'g', name: 'G', color: '#777', amount: 5 },
    ]
    const slices = makeSlices(entries)
    expect(slices.length).toBeLessThanOrEqual(6)
    expect(slices.at(-1)!.name).toBe('그 외')
    expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(1000)
  })

  it('총액이 0이면 빈 배열', () => {
    expect(makeSlices([{ id: 'a', name: 'A', color: '#111', amount: 0 }])).toEqual([])
  })
})

describe('날짜 도우미', () => {
  it('개월 더하기는 없는 날짜를 그 달 마지막 날로 맞춘다', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29') // 윤년
    expect(addMonths('2025-12-15', 1)).toBe('2026-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2025-06-01', 42)).toBe('2028-12-01')
  })

  it('월 마지막 날', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31')
  })

  it('월 목록은 연도를 넘어가도 이어진다', () => {
    expect(monthRange('2025-11-05', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
