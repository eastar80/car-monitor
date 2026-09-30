// IndexedDB 접근 계층. Dexie.js를 쓰는 이유는 IndexedDB의 저수준 API를
// 직접 다루지 않고 테이블/인덱스/트랜잭션을 간단히 선언할 수 있기 때문이다.
import Dexie, { type Table } from 'dexie'
import type { Category, Expense, FuelLog, Group, Setting, Vehicle } from './types'
import { CATEGORY_SEED, DEFAULT_VEHICLE_NAME, GROUP_SEED } from './seed'

/** 백업 파일 호환성 판단에 쓰는 스키마 버전 */
export const SCHEMA_VERSION = 1

export class CarDB extends Dexie {
  vehicles!: Table<Vehicle, string>
  groups!: Table<Group, string>
  categories!: Table<Category, string>
  fuelLogs!: Table<FuelLog, string>
  expenses!: Table<Expense, string>
  settings!: Table<Setting, string>

  constructor(name = 'car-monitor') {
    super(name)
    this.version(1).stores({
      // '&id'는 기본키, 뒤의 이름들은 조회에 쓰는 인덱스다.
      vehicles: '&id, isActive',
      groups: '&id, sortOrder',
      categories: '&id, groupId, sortOrder, isArchived',
      fuelLogs: '&id, vehicleId, date, odometer',
      expenses: '&id, vehicleId, date, odometer, categoryId',
      settings: '&key',
    })
  }
}

export const db = new CarDB()

/** UUID 생성. 구형 브라우저를 대비해 crypto.randomUUID가 없으면 직접 만든다. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 현재 시각 ISO 문자열 */
export function now(): string {
  return new Date().toISOString()
}

/**
 * 첫 실행 시 기본 그룹·카테고리·차량을 만든다.
 * 이미 만들어져 있으면 아무것도 하지 않으므로 앱 시작마다 불러도 안전하다.
 */
export async function ensureSeeded(database: CarDB = db): Promise<void> {
  await database.transaction(
    'rw',
    database.vehicles,
    database.groups,
    database.categories,
    async () => {
      if ((await database.groups.count()) === 0) {
        const ts = now()
        const groups: Group[] = GROUP_SEED.map((g) => ({
          id: uuid(),
          name: g.name,
          color: g.color,
          includeInStats: g.includeInStats,
          sortOrder: g.sortOrder,
          updatedAt: ts,
        }))
        await database.groups.bulkAdd(groups)

        const byName = new Map(groups.map((g) => [g.name, g.id]))
        const categories: Category[] = CATEGORY_SEED.map((c, i) => ({
          id: uuid(),
          name: c.name,
          groupId: byName.get(c.group)!,
          intervalKm: c.intervalKm,
          intervalMonths: c.intervalMonths,
          sortOrder: i,
          isArchived: false,
          updatedAt: ts,
        }))
        await database.categories.bulkAdd(categories)
      }

      if ((await database.vehicles.count()) === 0) {
        const ts = now()
        await database.vehicles.add({
          id: uuid(),
          name: DEFAULT_VEHICLE_NAME,
          plate: null,
          isActive: true,
          createdAt: ts,
          updatedAt: ts,
        })
      }
    },
  )
}

/** 활성 차량을 가져온다. 활성 표시가 없으면 첫 차량을 쓴다. */
export async function getActiveVehicle(database: CarDB = db): Promise<Vehicle | undefined> {
  const active = await database.vehicles.filter((v) => v.isActive).first()
  return active ?? (await database.vehicles.orderBy('id').first())
}

/** 차량 한 대만 활성으로 남긴다. */
export async function setActiveVehicle(vehicleId: string, database: CarDB = db): Promise<void> {
  await database.transaction('rw', database.vehicles, async () => {
    const all = await database.vehicles.toArray()
    for (const v of all) {
      const shouldBeActive = v.id === vehicleId
      if (v.isActive !== shouldBeActive) {
        await database.vehicles.update(v.id, { isActive: shouldBeActive, updatedAt: now() })
      }
    }
  })
}

/** 설정값 읽기 */
export async function getSetting(key: string, database: CarDB = db): Promise<string | undefined> {
  return (await database.settings.get(key))?.value
}

/** 설정값 쓰기 */
export async function setSetting(key: string, value: string, database: CarDB = db): Promise<void> {
  await database.settings.put({ key, value })
}

/** 모든 기록을 지운다. 그룹·카테고리·차량은 다시 시드한다. */
export async function wipeAll(database: CarDB = db): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.vehicles,
      database.groups,
      database.categories,
      database.fuelLogs,
      database.expenses,
      database.settings,
    ],
    async () => {
      await Promise.all([
        database.fuelLogs.clear(),
        database.expenses.clear(),
        database.categories.clear(),
        database.groups.clear(),
        database.vehicles.clear(),
        database.settings.clear(),
      ])
    },
  )
  await ensureSeeded(database)
}
