// 7.1 CSV 내보내기 테스트.
import { describe, expect, it } from 'vitest'
import { csvFileName, expenseCsv, fuelCsv } from '../backup'
import type { Category, Expense, FuelLog, Group } from '../../types'

const GROUPS: Group[] = [
  { id: 'g-sup', name: '소모품', color: '#16A34A', includeInStats: true, sortOrder: 0, updatedAt: '' },
]
const CATS: Category[] = [
  { id: 'c-oil', name: '엔진오일', groupId: 'g-sup', intervalKm: 10000, intervalMonths: 12, sortOrder: 0, isArchived: false, updatedAt: '' },
]

function fuel(over: Partial<FuelLog> = {}): FuelLog {
  return {
    id: 'f1', vehicleId: 'v1', date: '2026-06-16', odometer: 42249,
    pricePerLiter: 1995, totalPrice: 85000, liters: 42.61,
    station: null, memo: null, updatedAt: '', ...over,
  }
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1', vehicleId: 'v1', date: '2026-04-15', odometer: 41000,
    categoryId: 'c-oil', amount: 110000, place: null, memo: null, updatedAt: '', ...over,
  }
}

describe('CSV 내보내기', () => {
  it('주유 CSV는 헤더와 값을 날짜순으로 쓴다', () => {
    const csv = fuelCsv([fuel({ date: '2026-06-16' }), fuel({ id: 'f2', date: '2025-01-02', odometer: 100 })])
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('주유날짜,총주행거리,리터당가격,총주유가격,리터,주유소,메모')
    expect(lines[1]).toBe('2025-01-02,100,1995,85000,42.61,,')
    expect(lines[2]).toBe('2026-06-16,42249,1995,85000,42.61,,')
  })

  it('엑셀이 한글을 깨뜨리지 않게 BOM을 붙인다', () => {
    expect(fuelCsv([])).toMatch(/^﻿/)
    expect(expenseCsv([], CATS, GROUPS)).toMatch(/^﻿/)
  })

  it('지출 CSV에 그룹과 항목명을 함께 넣는다', () => {
    const csv = expenseCsv([expense({ place: '동네정비소', memo: '전우' })], CATS, GROUPS)
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('지출날짜,총주행거리,그룹,항목명,금액,장소,메모')
    expect(lines[1]).toBe('2026-04-15,41000,소모품,엔진오일,110000,동네정비소,전우')
  })

  it('콤마·따옴표·줄바꿈이 든 값은 따옴표로 감싼다', () => {
    const csv = expenseCsv(
      [expense({ memo: '전좌,후좌', place: '김"정비"소' })],
      CATS,
      GROUPS,
    )
    expect(csv).toContain('"전좌,후좌"')
    expect(csv).toContain('"김""정비""소"')
  })

  it('삭제된 카테고리를 가리키는 기록도 빈 칸으로 내보낸다', () => {
    const csv = expenseCsv([expense({ categoryId: 'gone' })], CATS, GROUPS)
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[1]).toBe('2026-04-15,41000,,,110000,,')
  })

  it('파일 이름은 ASCII만 쓴다', () => {
    // 크롬은 download 속성에 한글이 있으면 이름을 버리고 확장자 없는 'download'로 저장한다.
    const a = csvFileName('fuel', new Date(2026, 8, 30))
    const b = csvFileName('expenses', new Date(2026, 0, 5))
    expect(a).toBe('car-expense-fuel-2026-09-30.csv')
    expect(b).toBe('car-expense-expenses-2026-01-05.csv')
    for (const n of [a, b]) expect(n).toMatch(/^[\x20-\x7E]+$/)
  })
})
