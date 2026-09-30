// 화면 표시용 포맷 함수. (8.1절)

/** 12345 → '12,345' */
export function num(n: number, digits = 0): string {
  return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** 금액 전체 표기. 12345 → '12,345원' */
export function won(n: number): string {
  return `${num(Math.round(n))}원`
}

/**
 * 요약 카드용 짧은 금액. 만 원 이상은 '12.3만', 억 이상은 '1.2억'으로 줄인다.
 * 전체 금액은 툴팁이나 title 속성으로 따로 보여준다.
 */
export function wonShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${trim(n / 1e8)}억`
  if (abs >= 1e4) return `${trim(n / 1e4)}만`
  return num(Math.round(n))
}

/** 소수 첫째 자리까지 쓰되 .0은 떼어낸다. */
function trim(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** 12345 → '12,345 km' */
export function km(n: number): string {
  return `${num(Math.round(n))} km`
}

/** 리터. 소수 2자리 */
export function liters(n: number): string {
  return `${num(n, 2)} L`
}

/** '2025-03-10' → '2025.03.10' */
export function dateDot(d: string): string {
  return d.replaceAll('-', '.')
}

/** '2025-03' → '25.3' (그래프 x축 라벨용) */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y.slice(2)}.${Number(m)}`
}

/** 증감 표시. +12.3% / −5.0% / 비교 불가면 null */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}
