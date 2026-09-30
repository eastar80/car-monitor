// 화면에서 쓰는 데이터 조회 훅.
// dexie-react-hooks의 useLiveQuery는 IndexedDB가 바뀌면 화면을 자동으로 다시 그려준다.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { LAST_BACKUP_KEY } from './lib/backup'
import type { Category, Expense, FuelLog, Group, Vehicle } from './types'

export interface AppData {
  vehicles: Vehicle[]
  /** 활성 차량 */
  vehicle?: Vehicle
  groups: Group[]
  categories: Category[]
  /** 활성 차량의 주유 기록 (날짜 내림차순) */
  fuelLogs: FuelLog[]
  /** 활성 차량의 지출 기록 (날짜 내림차순) */
  expenses: Expense[]
  /** 마지막 백업 시각 (ISO). 백업한 적이 없으면 null */
  lastBackupAt: string | null
  loading: boolean
}

/**
 * 앱 전체 데이터를 한 번에 읽는다.
 * 개인용이라 기록이 많아야 수천 건이고, 통계마다 전체를 훑어야 하므로
 * 화면별로 쪼개 읽지 않고 통째로 들고 있는 편이 단순하다.
 */
export function useAppData(): AppData {
  const data = useLiveQuery(async () => {
    const [vehicles, groups, categories, lastBackup] = await Promise.all([
      db.vehicles.toArray(),
      db.groups.orderBy('sortOrder').toArray(),
      db.categories.orderBy('sortOrder').toArray(),
      db.settings.get(LAST_BACKUP_KEY),
    ])
    const vehicle = vehicles.find((v) => v.isActive) ?? vehicles[0]
    const [fuelLogs, expenses] = vehicle
      ? await Promise.all([
          db.fuelLogs.where('vehicleId').equals(vehicle.id).toArray(),
          db.expenses.where('vehicleId').equals(vehicle.id).toArray(),
        ])
      : [[], []]

    return {
      vehicles,
      vehicle,
      groups,
      categories,
      fuelLogs: fuelLogs.sort(byDateDesc),
      expenses: expenses.sort(byDateDesc),
      lastBackupAt: lastBackup?.value ?? null,
    }
  }, [])

  if (!data) {
    return {
      vehicles: [], groups: [], categories: [], fuelLogs: [], expenses: [],
      lastBackupAt: null, loading: true,
    }
  }
  return { ...data, loading: false }
}

/** 날짜 내림차순. 같은 날이면 나중에 등록한 것(updatedAt)이 위로 */
function byDateDesc(a: { date: string; updatedAt: string }, b: { date: string; updatedAt: string }) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.updatedAt < b.updatedAt ? 1 : -1
}

/** 카테고리 id → 카테고리 */
export function indexById<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]))
}
