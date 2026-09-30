// 6.3절 초기 그룹·카테고리 정의. 앱 첫 실행 시 이 표대로 생성한다.
// 주기 값은 일반적인 기준이며 사용자가 설정에서 차량 매뉴얼에 맞게 수정한다.

/** 8.2절 그룹 고정 색상 */
export const GROUP_SEED = [
  { name: '차량구입', color: '#94A3B8', includeInStats: false, sortOrder: 0 },
  { name: '고정비', color: '#7C3AED', includeInStats: true, sortOrder: 1 },
  { name: '소모품', color: '#16A34A', includeInStats: true, sortOrder: 2 },
  { name: '수리', color: '#EA580C', includeInStats: true, sortOrder: 3 },
  { name: '기타', color: '#6B7280', includeInStats: true, sortOrder: 4 },
] as const

/** 주유는 그룹 테이블에 없지만 그래프에서는 하나의 계열로 그린다. */
export const FUEL_SERIES = { key: '__fuel__', name: '주유', color: '#2563EB' }

/** 상태 색 (그룹 색과 분리) */
export const STATUS_COLOR = { due: '#F59E0B', over: '#DC2626' }

type CatSeed = {
  group: string
  name: string
  intervalKm: number | null
  intervalMonths: number | null
}

export const CATEGORY_SEED: CatSeed[] = [
  { group: '차량구입', name: '자동차', intervalKm: null, intervalMonths: null },
  { group: '고정비', name: '제세금', intervalKm: null, intervalMonths: 12 },
  { group: '고정비', name: '보험', intervalKm: null, intervalMonths: 12 },
  { group: '고정비', name: '정기점검', intervalKm: null, intervalMonths: 24 },
  { group: '소모품', name: '엔진오일', intervalKm: 10000, intervalMonths: 12 },
  { group: '소모품', name: '엔진오일필터', intervalKm: 10000, intervalMonths: 12 },
  { group: '소모품', name: '에어콘필터', intervalKm: 15000, intervalMonths: 12 },
  { group: '소모품', name: '연료필터', intervalKm: 30000, intervalMonths: null },
  { group: '소모품', name: '브레이크오일', intervalKm: 40000, intervalMonths: 24 },
  { group: '소모품', name: '와이퍼', intervalKm: null, intervalMonths: 12 },
  { group: '소모품', name: '타이어', intervalKm: 50000, intervalMonths: 48 },
  { group: '소모품', name: '배터리', intervalKm: null, intervalMonths: 42 },
  { group: '소모품', name: '요소수', intervalKm: 8000, intervalMonths: null },
  { group: '소모품', name: '예열플러그', intervalKm: 80000, intervalMonths: null },
  { group: '수리', name: '문수리', intervalKm: null, intervalMonths: null },
  { group: '수리', name: '타이어펑크', intervalKm: null, intervalMonths: null },
  { group: '수리', name: '후면반사판', intervalKm: null, intervalMonths: null },
  { group: '수리', name: '사이드미러', intervalKm: null, intervalMonths: null },
  { group: '수리', name: '라이트', intervalKm: null, intervalMonths: null },
  { group: '수리', name: '공기압센서', intervalKm: null, intervalMonths: null },
  { group: '기타', name: '세차', intervalKm: null, intervalMonths: null },
]

/** 앱 첫 실행 시 만드는 기본 차량 이름 */
export const DEFAULT_VEHICLE_NAME = '캡티바'
