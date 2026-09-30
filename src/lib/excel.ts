// 6절 기존 엑셀(.xlsx) 가져오기.
// SheetJS(xlsx)를 쓰는 이유는 브라우저에서 서버 없이 .xlsx를 바로 읽을 수 있기 때문이다.
// 이 파일의 파싱 함수는 DB를 건드리지 않는 순수 함수라 단위 테스트가 쉽다.
import * as XLSX from 'xlsx'
import type { DateStr } from '../types'

export interface ParsedFuel {
  date: DateStr
  odometer: number
  pricePerLiter: number
  totalPrice: number
  liters: number
  station: string | null
  memo: string | null
}

export interface ParsedExpense {
  date: DateStr
  odometer: number
  amount: number
  /** 6.2 규칙으로 뽑아낸 카테고리 이름 */
  categoryName: string
  place: string | null
  memo: string | null
}

export interface ImportError {
  sheet: string
  /** 엑셀 기준 행 번호 (헤더가 1행) */
  row: number
  reason: string
}

export interface ImportPreview {
  fuel: ParsedFuel[]
  expenses: ParsedExpense[]
  errors: ImportError[]
  /** 기존 카테고리에 없어서 새로 만들어야 하는 이름 */
  newCategoryNames: string[]
  /** 읽어들인 기록의 기간 */
  from: DateStr | null
  to: DateStr | null
}

// ---------------------------------------------------------------------------
// 6.2 항목명 → 카테고리 변환
// ---------------------------------------------------------------------------

/** '4개', '2통', '5L', '3개입'처럼 수량을 나타내는 꼬리표 */
const QUANTITY = /\s+(\d+(?:\.\d+)?\s*(?:개입|개|통|말|병|장|셋트|세트|쌍|L|리터|ml|kg|g)?)$/i

export interface NameParse {
  categoryName: string
  memo: string | null
}

/**
 * 엑셀의 항목명을 카테고리 이름과 메모로 나눈다.
 *
 * 1. 괄호와 그 안의 내용을 떼어 memo로 옮긴다.  '라이트(전우)' → '라이트' + '전우'
 * 2. 공백 뒤에 숫자+단위가 오면 떼어 memo로 옮긴다.  '예열플러그 4개' → '예열플러그' + '4개'
 * 3. 앞뒤 공백을 제거하고 알려진 카테고리 이름과 맞춰본다.
 * 4. 그래도 못 찾으면, 알려진 이름으로 시작하는지 보고 나머지를 memo로 넘긴다.
 *    '라이트 전좌'는 '라이트(전좌)'를 띄어 쓴 것이므로 '라이트' + '전좌'로 본다.
 */
export function parseItemName(raw: string, knownNames: string[] = []): NameParse {
  const parts: string[] = []
  let name = String(raw ?? '')

  // 1. 괄호 안의 내용
  name = name.replace(/[（(]([^）)]*)[）)]/g, (_m, inner: string) => {
    const t = inner.trim()
    if (t) parts.push(t)
    return ' '
  })

  // 2. 공백 뒤 숫자+단위
  name = name.trim()
  const q = name.match(QUANTITY)
  if (q) {
    parts.unshift(q[1].replace(/\s+/g, ''))
    name = name.slice(0, q.index).trim()
  }

  name = name.replace(/\s+/g, ' ').trim()

  // 3~4. 알려진 이름과 맞춰보고, 안 맞으면 접두어로 다시 찾는다.
  if (name && !knownNames.includes(name)) {
    // 긴 이름부터 살펴 '엔진오일필터'가 '엔진오일'로 잘리지 않게 한다.
    const candidates = [...knownNames].sort((a, b) => b.length - a.length)
    for (const known of candidates) {
      if (name.startsWith(known + ' ')) {
        parts.unshift(name.slice(known.length).trim())
        name = known
        break
      }
    }
  }

  return { categoryName: name, memo: parts.filter(Boolean).join(', ') || null }
}

// ---------------------------------------------------------------------------
// 시트 읽기
// ---------------------------------------------------------------------------

/** 엑셀 날짜(Date · 일련번호 · 문자열)를 'YYYY-MM-DD'로 바꾼다. 실패하면 null. */
export function toDateStr(v: unknown): DateStr | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  if (typeof v === 'number') {
    // 엑셀 일련번호: 1899-12-30을 0으로 센 날짜 수
    if (!Number.isFinite(v) || v <= 0) return null
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  // 2017-03-11 / 2017.3.11 / 2017/3/11
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
    if (Number.isNaN(dt.getTime())) return null
    return dt.toISOString().slice(0, 10)
  }
  return null
}

/** 숫자 칸을 읽는다. 콤마와 '원' 같은 꼬리표는 떼어낸다. 실패하면 null. */
export function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[,\s원km]/gi, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

/**
 * .xlsx 파일을 읽어 주유·지출 기록을 뽑아낸다.
 * 시트 이름은 고정이 아니므로 헤더에 '리터당가격'이 있으면 주유 시트,
 * '항목명'이 있으면 지출 시트로 판별한다. (6.1절)
 */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, knownNames: string[] = []): ImportPreview {
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  const out: ImportPreview = {
    fuel: [],
    expenses: [],
    errors: [],
    newCategoryNames: [],
    from: null,
    to: null,
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    // 헤더 행을 그대로 살려 읽는다. raw:true라야 날짜가 Date, 숫자가 number로 들어온다.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
    if (rows.length < 2) continue

    const header = (rows[0] ?? []).map((h) => String(h ?? '').trim())
    const col = (name: string) => header.indexOf(name)

    if (col('리터당가격') >= 0) readFuelSheet(sheetName, header, rows, out)
    else if (col('항목명') >= 0) readExpenseSheet(sheetName, header, rows, out, knownNames)
  }

  // 기간과 새로 만들 카테고리 목록 정리
  const dates = [...out.fuel.map((f) => f.date), ...out.expenses.map((e) => e.date)].sort()
  out.from = dates[0] ?? null
  out.to = dates.at(-1) ?? null

  const known = new Set(knownNames)
  const fresh = new Set<string>()
  for (const e of out.expenses) if (!known.has(e.categoryName)) fresh.add(e.categoryName)
  out.newCategoryNames = [...fresh].sort()

  return out
}

/** 컬럼 이름으로 자리를 찾되, 헤더가 다르면 정해진 순서를 그대로 쓴다. */
function indexer(header: string[]) {
  return (name: string, fallback: number) => {
    const i = header.indexOf(name)
    return i >= 0 ? i : fallback
  }
}

function readFuelSheet(sheetName: string, header: string[], rows: unknown[][], out: ImportPreview) {
  const at = indexer(header)
  const cPrice = at('리터당가격', 0)
  const cTotal = at('총주유가격', 1)
  const cOdo = at('총주행거리', 2)
  const cDate = at('주유날짜', 3)
  const cStation = at('주유소', 4)
  const cMemo = at('메모', 5)

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const rowNo = i + 1
    if (r.every((v) => v == null || String(v).trim() === '')) continue

    const date = toDateStr(r[cDate])
    const odometer = toNumber(r[cOdo])
    const pricePerLiter = toNumber(r[cPrice])
    const totalPrice = toNumber(r[cTotal])

    if (!date) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '주유날짜를 읽을 수 없습니다' }); continue }
    if (odometer === null) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '총주행거리가 비었거나 숫자가 아닙니다' }); continue }
    if (!pricePerLiter) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '리터당가격이 비었거나 숫자가 아닙니다' }); continue }
    if (!totalPrice) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '총주유가격이 비었거나 숫자가 아닙니다' }); continue }

    out.fuel.push({
      date,
      odometer,
      pricePerLiter,
      totalPrice,
      liters: Math.round((totalPrice / pricePerLiter) * 100) / 100,
      station: str(r[cStation]),
      memo: str(r[cMemo]),
    })
  }
}

function readExpenseSheet(
  sheetName: string,
  header: string[],
  rows: unknown[][],
  out: ImportPreview,
  knownNames: string[],
) {
  const at = indexer(header)
  const cName = at('항목명', 0)
  const cAmount = at('금액', 1)
  const cOdo = at('총주행거리', 2)
  const cDate = at('지출날짜', 3)
  const cPlace = at('장소', 4)
  const cMemo = at('메모', 5)

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const rowNo = i + 1
    if (r.every((v) => v == null || String(v).trim() === '')) continue

    const rawName = str(r[cName])
    const date = toDateStr(r[cDate])
    const odometer = toNumber(r[cOdo])
    const amount = toNumber(r[cAmount])

    if (!rawName) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '항목명이 비었습니다' }); continue }
    if (!date) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '지출날짜를 읽을 수 없습니다' }); continue }
    if (odometer === null) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '총주행거리가 비었거나 숫자가 아닙니다' }); continue }
    if (amount === null) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '금액이 비었거나 숫자가 아닙니다' }); continue }

    const { categoryName, memo } = parseItemName(rawName, knownNames)
    if (!categoryName) { out.errors.push({ sheet: sheetName, row: rowNo, reason: '항목명에서 카테고리를 뽑아낼 수 없습니다' }); continue }

    // 엑셀의 메모 칸과 항목명에서 떼어낸 내용을 합친다. (6.1절)
    const sheetMemo = str(r[cMemo])
    const merged = [memo, sheetMemo].filter(Boolean).join(', ') || null

    out.expenses.push({
      date,
      odometer,
      amount,
      categoryName,
      place: str(r[cPlace]),
      memo: merged,
    })
  }
}
