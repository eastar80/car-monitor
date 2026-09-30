// 7절 백업·복원, 그리고 엑셀 가져오기 결과를 DB에 반영하는 부분.
import { SCHEMA_VERSION, db, now, uuid, type CarDB } from '../db'
import type { BackupFile, Expense, FuelLog } from '../types'
import type { ImportPreview } from './excel'

// ---------------------------------------------------------------------------
// 7.1 백업 (내보내기)
// ---------------------------------------------------------------------------

/** 백업 파일 하나가 앱의 전체 상태다. */
export async function buildBackup(database: CarDB = db): Promise<BackupFile> {
  const [vehicles, groups, categories, fuelLogs, expenses] = await Promise.all([
    database.vehicles.toArray(),
    database.groups.toArray(),
    database.categories.toArray(),
    database.fuelLogs.toArray(),
    database.expenses.toArray(),
  ])
  return { schemaVersion: SCHEMA_VERSION, exportedAt: now(), vehicles, groups, categories, fuelLogs, expenses }
}

export function backupFileName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `car-expense-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** 마지막 백업 시각을 적어두는 설정 키 */
export const LAST_BACKUP_KEY = 'lastBackupAt'

/**
 * 백업 파일을 내보낸다.
 * Android에서는 공유 시트를 띄워 구글 드라이브 등으로 바로 보낼 수 있게 하고,
 * 공유를 지원하지 않는 브라우저에서는 일반 다운로드로 대체한다.
 */
export async function exportBackup(database: CarDB = db): Promise<'shared' | 'downloaded'> {
  const data = await buildBackup(database)
  const name = backupFileName()
  const text = JSON.stringify(data, null, 2)
  const file = new File([text], name, { type: 'application/json' })

  let result: 'shared' | 'downloaded' = 'downloaded'
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      result = 'shared'
    } catch (e) {
      // 사용자가 공유를 취소한 경우에는 다운로드로 떨어지지 않게 그대로 끝낸다.
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      downloadText(name, text)
    }
  } else {
    downloadText(name, text)
  }

  await database.settings.put({ key: LAST_BACKUP_KEY, value: now() })
  return result
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// 7.2 복원 (가져오기)
// ---------------------------------------------------------------------------

export class BackupError extends Error {}

/** 백업 JSON을 읽고 구조를 확인한다. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('JSON 파일을 읽을 수 없습니다.')
  }
  const b = raw as Partial<BackupFile>
  if (typeof b?.schemaVersion !== 'number') throw new BackupError('백업 파일 형식이 아닙니다.')
  if (b.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('이 백업은 더 새로운 버전에서 만들어졌습니다. 앱을 업데이트한 뒤 다시 시도하세요.')
  }
  for (const key of ['vehicles', 'groups', 'categories', 'fuelLogs', 'expenses'] as const) {
    if (!Array.isArray(b[key])) throw new BackupError(`백업 파일에 ${key} 목록이 없습니다.`)
  }
  // schemaVersion이 낮으면 여기서 마이그레이션한다. (지금은 버전이 1뿐이라 할 일이 없다)
  return b as BackupFile
}

export type RestoreMode = 'replace' | 'merge'

/**
 * 백업을 되돌린다.
 * - replace: 기존 데이터를 지우고 백업 내용으로 바꾼다.
 * - merge: 같은 id면 updatedAt이 최신인 쪽을 남기고, 없는 id는 추가한다.
 */
export async function restoreBackup(
  backup: BackupFile,
  mode: RestoreMode,
  database: CarDB = db,
): Promise<void> {
  await database.transaction(
    'rw',
    [database.vehicles, database.groups, database.categories, database.fuelLogs, database.expenses],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          database.vehicles.clear(),
          database.groups.clear(),
          database.categories.clear(),
          database.fuelLogs.clear(),
          database.expenses.clear(),
        ])
        await Promise.all([
          database.vehicles.bulkAdd(backup.vehicles),
          database.groups.bulkAdd(backup.groups),
          database.categories.bulkAdd(backup.categories),
          database.fuelLogs.bulkAdd(backup.fuelLogs),
          database.expenses.bulkAdd(backup.expenses),
        ])
        return
      }

      await mergeTable(database.vehicles, backup.vehicles)
      await mergeTable(database.groups, backup.groups)
      await mergeTable(database.categories, backup.categories)
      await mergeTable(database.fuelLogs, backup.fuelLogs)
      await mergeTable(database.expenses, backup.expenses)
    },
  )
}

type HasIdAndTime = { id: string; updatedAt: string }

/** id가 같으면 updatedAt이 최신인 쪽만 남긴다. */
async function mergeTable<T extends HasIdAndTime>(
  table: { bulkGet: (ids: string[]) => Promise<(T | undefined)[]>; bulkPut: (v: T[]) => Promise<unknown> },
  incoming: T[],
): Promise<void> {
  if (incoming.length === 0) return
  const existing = await table.bulkGet(incoming.map((x) => x.id))
  const toPut = incoming.filter((x, i) => {
    const cur = existing[i]
    return !cur || x.updatedAt > cur.updatedAt
  })
  if (toPut.length) await table.bulkPut(toPut)
}

/** 백업 내용 요약 (복원 전 미리보기용) */
export function summarizeBackup(b: BackupFile) {
  const dates = [...b.fuelLogs.map((f) => f.date), ...b.expenses.map((e) => e.date)].sort()
  return {
    fuelCount: b.fuelLogs.length,
    expenseCount: b.expenses.length,
    vehicleCount: b.vehicles.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    exportedAt: b.exportedAt,
  }
}

// ---------------------------------------------------------------------------
// 6.4 엑셀 가져오기 결과를 DB에 반영
// ---------------------------------------------------------------------------

export interface ApplyResult {
  fuelAdded: number
  expenseAdded: number
  createdCategories: { id: string; name: string }[]
}

/**
 * 미리보기 내용을 실제로 저장한다.
 * - mode 'replace'면 이 차량의 기존 주유·지출 기록을 먼저 지운다.
 * - 초기 카테고리 표에 없는 이름은 '기타' 그룹에 새로 만든다. (6.2절 4)
 */
export async function applyExcelImport(
  preview: ImportPreview,
  vehicleId: string,
  mode: 'replace' | 'append',
  database: CarDB = db,
): Promise<ApplyResult> {
  const created: { id: string; name: string }[] = []

  await database.transaction(
    'rw',
    [database.categories, database.groups, database.fuelLogs, database.expenses],
    async () => {
      if (mode === 'replace') {
        await database.fuelLogs.where('vehicleId').equals(vehicleId).delete()
        await database.expenses.where('vehicleId').equals(vehicleId).delete()
      }

      const categories = await database.categories.toArray()
      const byName = new Map(categories.map((c) => [c.name, c.id]))
      const groups = await database.groups.toArray()
      const etcGroupId = groups.find((g) => g.name === '기타')?.id ?? groups.at(-1)!.id
      let order = categories.reduce((m, c) => Math.max(m, c.sortOrder), -1)

      for (const name of preview.newCategoryNames) {
        if (byName.has(name)) continue
        const id = uuid()
        order += 1
        await database.categories.add({
          id,
          name,
          groupId: etcGroupId,
          intervalKm: null,
          intervalMonths: null,
          sortOrder: order,
          isArchived: false,
          updatedAt: now(),
        })
        byName.set(name, id)
        created.push({ id, name })
      }

      const ts = now()
      const fuelLogs: FuelLog[] = preview.fuel.map((f) => ({
        id: uuid(),
        vehicleId,
        date: f.date,
        odometer: f.odometer,
        pricePerLiter: f.pricePerLiter,
        totalPrice: f.totalPrice,
        liters: f.liters,
        station: f.station,
        memo: f.memo,
        updatedAt: ts,
      }))
      const expenses: Expense[] = preview.expenses.map((e) => ({
        id: uuid(),
        vehicleId,
        date: e.date,
        odometer: e.odometer,
        categoryId: byName.get(e.categoryName)!,
        amount: e.amount,
        place: e.place,
        memo: e.memo,
        updatedAt: ts,
      }))
      await database.fuelLogs.bulkAdd(fuelLogs)
      await database.expenses.bulkAdd(expenses)
    },
  )

  return {
    fuelAdded: preview.fuel.length,
    expenseAdded: preview.expenses.length,
    createdCategories: created,
  }
}

