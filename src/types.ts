// 3절 데이터 모델.
// 나중에 온라인 DB(Supabase 등)로 옮겨도 그대로 쓸 수 있게
// 모든 레코드가 UUID(id)와 updatedAt을 가진다.

/** 'YYYY-MM-DD' 형식 날짜 문자열 */
export type DateStr = string
/** ISO 8601 datetime 문자열 */
export type IsoDateTime = string

/** 차량 */
export interface Vehicle {
  id: string
  name: string
  /** 번호판(선택) */
  plate?: string | null
  /** 현재 사용 차량. 활성 차량은 항상 1대 */
  isActive: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** 카테고리 그룹 (차량구입 / 고정비 / 소모품 / 수리 / 기타) */
export interface Group {
  id: string
  name: string
  /** 그래프 색상 (hex) */
  color: string
  /** 월별·연도별 통계 포함 여부. 차량구입만 false */
  includeInStats: boolean
  sortOrder: number
  updatedAt: IsoDateTime
}

/** 지출 카테고리. 교환주기 정보를 함께 가진다. */
export interface Category {
  id: string
  name: string
  groupId: string
  /** 교환주기(km). null이면 주기 없음 */
  intervalKm?: number | null
  /** 교환주기(개월). null이면 주기 없음 */
  intervalMonths?: number | null
  /** 입력 화면 표시 순서 */
  sortOrder: number
  /** 더 안 쓰는 카테고리 숨김 (기록은 유지) */
  isArchived: boolean
  updatedAt: IsoDateTime
}

/** 주유 기록 */
export interface FuelLog {
  id: string
  vehicleId: string
  date: DateStr
  /** 주유 시점 총주행거리 (km) */
  odometer: number
  /** 리터당 가격 (원) */
  pricePerLiter: number
  /** 주유 금액 (원) */
  totalPrice: number
  /** totalPrice ÷ pricePerLiter (소수 2자리). 사용자가 덮어쓸 수 있다. */
  liters: number
  station?: string | null
  memo?: string | null
  updatedAt: IsoDateTime
}

/** 지출 기록 */
export interface Expense {
  id: string
  vehicleId: string
  date: DateStr
  /** 지출 시점 총주행거리 (km) */
  odometer: number
  categoryId: string
  /** 금액 (원) */
  amount: number
  place?: string | null
  memo?: string | null
  updatedAt: IsoDateTime
}

/** 앱 설정값 (key-value 한 줄씩 저장) */
export interface Setting {
  key: string
  value: string
}

/** 7.1절 백업 JSON 구조 */
export interface BackupFile {
  schemaVersion: number
  exportedAt: IsoDateTime
  vehicles: Vehicle[]
  groups: Group[]
  categories: Category[]
  fuelLogs: FuelLog[]
  expenses: Expense[]
}
