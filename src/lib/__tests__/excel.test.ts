// 6절 엑셀 가져오기 파싱 테스트.
// 실제 데이터는 저장소에 올리지 않고, 같은 구조의 표본을 테스트 안에서 만들어 쓴다.
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseItemName, parseWorkbook, toDateStr, toNumber } from '../excel'
import { CATEGORY_SEED } from '../../seed'

const KNOWN = CATEGORY_SEED.map((c) => c.name)

describe('6.2 항목명 → 카테고리 변환', () => {
  it('괄호 안의 내용을 메모로 옮긴다', () => {
    expect(parseItemName('라이트(전우)', KNOWN)).toEqual({ categoryName: '라이트', memo: '전우' })
    expect(parseItemName('공기압센서(전좌,후좌,전우)', KNOWN)).toEqual({
      categoryName: '공기압센서',
      memo: '전좌,후좌,전우',
    })
    expect(parseItemName('공기압센서(후우)', KNOWN)).toEqual({ categoryName: '공기압센서', memo: '후우' })
  })

  it('공백 뒤 숫자+단위를 메모로 옮긴다', () => {
    expect(parseItemName('예열플러그 4개', KNOWN)).toEqual({ categoryName: '예열플러그', memo: '4개' })
    expect(parseItemName('요소수 2통', KNOWN)).toEqual({ categoryName: '요소수', memo: '2통' })
    expect(parseItemName('엔진오일 5L', KNOWN)).toEqual({ categoryName: '엔진오일', memo: '5L' })
  })

  it("괄호를 빠뜨리고 띄어 쓴 '라이트 전좌'도 '라이트(전좌)'와 같게 본다", () => {
    expect(parseItemName('라이트 전좌', KNOWN)).toEqual({ categoryName: '라이트', memo: '전좌' })
    expect(parseItemName('공기압센서 후우', KNOWN)).toEqual({ categoryName: '공기압센서', memo: '후우' })
  })

  it("긴 이름을 짧은 이름으로 잘라먹지 않는다", () => {
    // '엔진오일필터'가 '엔진오일' + '필터'로 갈리면 안 된다
    expect(parseItemName('엔진오일필터', KNOWN)).toEqual({ categoryName: '엔진오일필터', memo: null })
    expect(parseItemName('엔진오일필터 2개', KNOWN)).toEqual({ categoryName: '엔진오일필터', memo: '2개' })
  })

  it('괄호와 수량이 함께 있으면 둘 다 메모로 합친다', () => {
    expect(parseItemName('타이어(전좌) 2개', KNOWN)).toEqual({ categoryName: '타이어', memo: '2개, 전좌' })
  })

  it('앞뒤 공백을 없애고, 표에 있는 이름은 그대로 쓴다', () => {
    expect(parseItemName('  엔진오일  ', KNOWN)).toEqual({ categoryName: '엔진오일', memo: null })
    expect(parseItemName('세차', KNOWN)).toEqual({ categoryName: '세차', memo: null })
  })

  it('표에 없는 이름은 그대로 두어 새 카테고리가 되게 한다', () => {
    expect(parseItemName('하이패스 단말기', KNOWN)).toEqual({ categoryName: '하이패스 단말기', memo: null })
  })
})

describe('엑셀 값 읽기', () => {
  it('날짜는 Date · 일련번호 · 문자열을 모두 받는다', () => {
    expect(toDateStr(new Date(2017, 2, 11))).toBe('2017-03-11')
    expect(toDateStr(42805)).toBe('2017-03-11') // 엑셀 일련번호
    expect(toDateStr('2017-03-11')).toBe('2017-03-11')
    expect(toDateStr('2017.3.11')).toBe('2017-03-11')
    expect(toDateStr('2017/3/11')).toBe('2017-03-11')
    expect(toDateStr('날짜아님')).toBeNull()
    expect(toDateStr('')).toBeNull()
    expect(toDateStr(null)).toBeNull()
  })

  it('숫자는 콤마와 단위를 떼고 읽는다', () => {
    expect(toNumber(1265)).toBe(1265)
    expect(toNumber('73,000')).toBe(73000)
    expect(toNumber('73,000원')).toBe(73000)
    expect(toNumber('25 km')).toBe(25)
    expect(toNumber('숫자아님')).toBeNull()
    expect(toNumber('')).toBeNull()
  })
})

// --- 표본 워크북 만들기 ------------------------------------------------------

function makeWorkbook(fuelRows: unknown[][], expenseRows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const fuel = XLSX.utils.aoa_to_sheet([
    ['리터당가격', '총주유가격', '총주행거리', '주유날짜', '주유소', '메모'],
    ...fuelRows,
  ])
  const exp = XLSX.utils.aoa_to_sheet([
    ['항목명', '금액', '총주행거리', '지출날짜', '장소', '메모'],
    ...expenseRows,
  ])
  XLSX.utils.book_append_sheet(wb, fuel, '주유')
  XLSX.utils.book_append_sheet(wb, exp, '지출')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer
}

describe('6.1 시트 읽기', () => {
  it('헤더로 주유·지출 시트를 판별하고 필드를 옮긴다', () => {
    const buf = makeWorkbook(
      [
        [1265, 73000, 25, new Date(2017, 2, 11), '', ''],
        [1249, 74000, 656, new Date(2017, 3, 7), '상록주유소', '가득'],
      ],
      [
        ['자동차', 31000000, 7, new Date(2017, 2, 8), '', ''],
        ['라이트(전우)', 22330, 41000, new Date(2026, 3, 15), '동네정비소', ''],
      ],
    )
    const p = parseWorkbook(buf, KNOWN)

    expect(p.fuel).toHaveLength(2)
    expect(p.fuel[0]).toEqual({
      date: '2017-03-11',
      odometer: 25,
      pricePerLiter: 1265,
      totalPrice: 73000,
      liters: 57.71, // 73000 / 1265, 소수 2자리
      station: null,
      memo: null,
    })
    expect(p.fuel[1].station).toBe('상록주유소')
    expect(p.fuel[1].memo).toBe('가득')

    expect(p.expenses).toHaveLength(2)
    expect(p.expenses[0].categoryName).toBe('자동차')
    expect(p.expenses[1]).toMatchObject({
      date: '2026-04-15',
      odometer: 41000,
      amount: 22330,
      categoryName: '라이트',
      place: '동네정비소',
      memo: '전우',
    })

    expect(p.from).toBe('2017-03-08')
    expect(p.to).toBe('2026-04-15')
    expect(p.errors).toEqual([])
    expect(p.newCategoryNames).toEqual([])
  })

  it('항목명에서 뽑은 메모와 엑셀 메모 칸을 합친다', () => {
    const buf = makeWorkbook([], [['예열플러그 4개', 200000, 30000, new Date(2024, 0, 5), '', '보증 적용']])
    const p = parseWorkbook(buf, KNOWN)
    expect(p.expenses[0].memo).toBe('4개, 보증 적용')
  })

  it('표에 없는 카테고리는 새로 만들 목록에 올린다', () => {
    const buf = makeWorkbook([], [['하이패스', 30000, 30000, new Date(2024, 0, 5), '', '']])
    const p = parseWorkbook(buf, KNOWN)
    expect(p.newCategoryNames).toEqual(['하이패스'])
  })

  it('첫 행의 총주행거리가 7km처럼 작아도 정상으로 받는다', () => {
    const buf = makeWorkbook([], [['자동차', 31000000, 7, new Date(2017, 2, 8), '', '']])
    const p = parseWorkbook(buf, KNOWN)
    expect(p.expenses[0].odometer).toBe(7)
    expect(p.errors).toEqual([])
  })

  it('잘못된 행은 건너뛰고 행 번호와 이유를 남긴다', () => {
    const buf = makeWorkbook(
      [
        [1265, 73000, 25, new Date(2017, 2, 11), '', ''],
        [1265, 73000, 100, '날짜아님', '', ''], // 3행: 날짜 오류
        ['', 73000, 200, new Date(2017, 3, 1), '', ''], // 4행: 단가 없음
      ],
      [
        ['', 10000, 300, new Date(2018, 0, 1), '', ''], // 2행: 항목명 없음
        ['세차', '숫자아님', 400, new Date(2018, 0, 2), '', ''], // 3행: 금액 오류
      ],
    )
    const p = parseWorkbook(buf, KNOWN)
    expect(p.fuel).toHaveLength(1)
    expect(p.expenses).toHaveLength(0)
    expect(p.errors).toEqual([
      { sheet: '주유', row: 3, reason: '주유날짜를 읽을 수 없습니다' },
      { sheet: '주유', row: 4, reason: '리터당가격이 비었거나 숫자가 아닙니다' },
      { sheet: '지출', row: 2, reason: '항목명이 비었습니다' },
      { sheet: '지출', row: 3, reason: '금액이 비었거나 숫자가 아닙니다' },
    ])
  })

  it('시트 이름이 달라도 헤더로 알아본다', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['리터당가격', '총주유가격', '총주행거리', '주유날짜', '주유소', '메모'],
        [1500, 60000, 1000, new Date(2020, 0, 1), '', ''],
      ]),
      'Sheet1',
    )
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer
    expect(parseWorkbook(buf, KNOWN).fuel).toHaveLength(1)
  })

  it('빈 행은 오류로 세지 않는다', () => {
    const buf = makeWorkbook([[1500, 60000, 1000, new Date(2020, 0, 1), '', ''], ['', '', '', '', '', '']], [])
    const p = parseWorkbook(buf, KNOWN)
    expect(p.fuel).toHaveLength(1)
    expect(p.errors).toEqual([])
  })
})
