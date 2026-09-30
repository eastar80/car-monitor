// 7절 백업·복원과 6.4 엑셀 반영 테스트. fake-indexeddb 위에서 실제 DB 동작을 확인한다.
import { beforeEach, describe, expect, it } from 'vitest'
import { CarDB, ensureSeeded, getActiveVehicle, setActiveVehicle, wipeAll } from '../../db'
import { CATEGORY_SEED, GROUP_SEED, DEFAULT_VEHICLE_NAME } from '../../seed'
import { applyExcelImport, buildBackup, backupFileName, parseBackup, restoreBackup, summarizeBackup } from '../backup'
import type { ImportPreview } from '../excel'

let db: CarDB
let counter = 0

beforeEach(async () => {
  // 테스트마다 새 DB 이름을 써서 서로 영향을 주지 않게 한다.
  db = new CarDB(`test-${++counter}`)
  await ensureSeeded(db)
})

describe('첫 실행 시드', () => {
  it('그룹 5개와 카테고리 표, 기본 차량 1대를 만든다', async () => {
    expect(await db.groups.count()).toBe(GROUP_SEED.length)
    expect(await db.categories.count()).toBe(CATEGORY_SEED.length)
    const v = await getActiveVehicle(db)
    expect(v?.name).toBe(DEFAULT_VEHICLE_NAME)
    expect(v?.isActive).toBe(true)
  })

  it('차량구입 그룹만 통계에서 빠진다', async () => {
    const groups = await db.groups.toArray()
    expect(groups.filter((g) => !g.includeInStats).map((g) => g.name)).toEqual(['차량구입'])
  })

  it('두 번 불러도 중복해서 만들지 않는다', async () => {
    await ensureSeeded(db)
    expect(await db.categories.count()).toBe(CATEGORY_SEED.length)
    expect(await db.vehicles.count()).toBe(1)
  })

  it('엔진오일 기본 주기는 10,000km / 12개월', async () => {
    const oil = await db.categories.filter((c) => c.name === '엔진오일').first()
    expect(oil?.intervalKm).toBe(10000)
    expect(oil?.intervalMonths).toBe(12)
  })
})

describe('활성 차량 전환', () => {
  it('항상 한 대만 활성으로 남는다', async () => {
    const ts = new Date().toISOString()
    await db.vehicles.add({ id: 'v2', name: '두 번째 차', plate: null, isActive: false, createdAt: ts, updatedAt: ts })
    await setActiveVehicle('v2', db)
    const actives = (await db.vehicles.toArray()).filter((v) => v.isActive)
    expect(actives).toHaveLength(1)
    expect(actives[0].id).toBe('v2')
  })
})

describe('7.1 백업', () => {
  it('모든 테이블을 담고 schemaVersion을 붙인다', async () => {
    const b = await buildBackup(db)
    expect(b.schemaVersion).toBe(1)
    expect(b.groups).toHaveLength(GROUP_SEED.length)
    expect(b.categories).toHaveLength(CATEGORY_SEED.length)
    expect(b.vehicles).toHaveLength(1)
  })

  it('파일 이름은 car-expense-backup-YYYY-MM-DD.json', () => {
    expect(backupFileName(new Date(2026, 8, 30))).toBe('car-expense-backup-2026-09-30.json')
  })
})

describe('7.2 복원', () => {
  it('형식이 아닌 파일은 거부한다', () => {
    expect(() => parseBackup('{')).toThrow(/읽을 수 없습니다/)
    expect(() => parseBackup('{"a":1}')).toThrow(/형식이 아닙니다/)
    expect(() => parseBackup('{"schemaVersion":1}')).toThrow(/목록이 없습니다/)
  })

  it('앱보다 새로운 schemaVersion은 거부하고 업데이트를 안내한다', () => {
    const json = JSON.stringify({ schemaVersion: 99, vehicles: [], groups: [], categories: [], fuelLogs: [], expenses: [] })
    expect(() => parseBackup(json)).toThrow(/업데이트/)
  })

  it('replace는 기존 데이터를 지우고 백업 내용으로 바꾼다', async () => {
    const v = (await getActiveVehicle(db))!
    await db.fuelLogs.add(fuelLog('keep-me', v.id, '2026-01-01'))

    const backup = {
      schemaVersion: 1,
      exportedAt: '2026-06-01T00:00:00.000Z',
      vehicles: [{ ...v, name: '다른 차' }],
      groups: await db.groups.toArray(),
      categories: await db.categories.toArray(),
      fuelLogs: [fuelLog('from-backup', v.id, '2026-05-01')],
      expenses: [],
    }
    await restoreBackup(backup, 'replace', db)

    expect((await db.fuelLogs.toArray()).map((f) => f.id)).toEqual(['from-backup'])
    expect((await db.vehicles.get(v.id))!.name).toBe('다른 차')
  })

  it('merge는 없는 id를 더하고, 같은 id면 updatedAt이 최신인 쪽을 남긴다', async () => {
    const v = (await getActiveVehicle(db))!
    await db.fuelLogs.add({ ...fuelLog('shared', v.id, '2026-01-01'), totalPrice: 10000, updatedAt: '2026-01-01T00:00:00.000Z' })
    await db.fuelLogs.add(fuelLog('mine-only', v.id, '2026-02-01'))

    await restoreBackup(
      {
        schemaVersion: 1,
        exportedAt: '2026-06-01T00:00:00.000Z',
        vehicles: [],
        groups: [],
        categories: [],
        fuelLogs: [
          // 더 최신이라 이쪽이 이긴다
          { ...fuelLog('shared', v.id, '2026-01-01'), totalPrice: 99999, updatedAt: '2026-06-01T00:00:00.000Z' },
          fuelLog('theirs-only', v.id, '2026-03-01'),
        ],
        expenses: [],
      },
      'merge',
      db,
    )

    const ids = (await db.fuelLogs.toArray()).map((f) => f.id).sort()
    expect(ids).toEqual(['mine-only', 'shared', 'theirs-only'])
    expect((await db.fuelLogs.get('shared'))!.totalPrice).toBe(99999)
  })

  it('merge에서 내 기록이 더 최신이면 그대로 둔다', async () => {
    const v = (await getActiveVehicle(db))!
    await db.fuelLogs.add({ ...fuelLog('shared', v.id, '2026-01-01'), totalPrice: 50000, updatedAt: '2026-06-01T00:00:00.000Z' })
    await restoreBackup(
      {
        schemaVersion: 1,
        exportedAt: '2026-06-01T00:00:00.000Z',
        vehicles: [], groups: [], categories: [], expenses: [],
        fuelLogs: [{ ...fuelLog('shared', v.id, '2026-01-01'), totalPrice: 111, updatedAt: '2026-01-01T00:00:00.000Z' }],
      },
      'merge',
      db,
    )
    expect((await db.fuelLogs.get('shared'))!.totalPrice).toBe(50000)
  })

  it('요약은 건수와 기간을 알려준다', async () => {
    const v = (await getActiveVehicle(db))!
    const s = summarizeBackup({
      schemaVersion: 1,
      exportedAt: '2026-06-01T00:00:00.000Z',
      vehicles: [v], groups: [], categories: [], expenses: [],
      fuelLogs: [fuelLog('a', v.id, '2020-01-01'), fuelLog('b', v.id, '2026-05-05')],
    })
    expect(s).toMatchObject({ fuelCount: 2, expenseCount: 0, from: '2020-01-01', to: '2026-05-05' })
  })
})

describe('6.4 엑셀 가져오기 반영', () => {
  const preview: ImportPreview = {
    fuel: [
      { date: '2017-03-11', odometer: 25, pricePerLiter: 1265, totalPrice: 73000, liters: 57.71, station: null, memo: null },
    ],
    expenses: [
      { date: '2017-03-08', odometer: 7, amount: 31000000, categoryName: '자동차', place: null, memo: null },
      { date: '2026-04-15', odometer: 41000, amount: 22330, categoryName: '라이트', place: null, memo: '전우' },
      { date: '2026-05-01', odometer: 41500, amount: 30000, categoryName: '하이패스', place: null, memo: null },
    ],
    errors: [],
    newCategoryNames: ['하이패스'],
    from: '2017-03-08',
    to: '2026-05-01',
  }

  it('기록을 넣고, 표에 없는 카테고리는 기타 그룹에 만든다', async () => {
    const v = (await getActiveVehicle(db))!
    const r = await applyExcelImport(preview, v.id, 'append', db)

    expect(r).toMatchObject({ fuelAdded: 1, expenseAdded: 3 })
    expect(r.createdCategories.map((c) => c.name)).toEqual(['하이패스'])

    const etc = await db.groups.filter((g) => g.name === '기타').first()
    const created = await db.categories.get(r.createdCategories[0].id)
    expect(created!.groupId).toBe(etc!.id)

    // 기존 카테고리는 새로 만들지 않고 그대로 쓴다
    expect(await db.categories.filter((c) => c.name === '라이트').count()).toBe(1)
    expect(await db.expenses.count()).toBe(3)
    expect(await db.fuelLogs.count()).toBe(1)
  })

  it('append는 두 번 부르면 기록이 중복된다 (6.4절 안내대로)', async () => {
    const v = (await getActiveVehicle(db))!
    await applyExcelImport(preview, v.id, 'append', db)
    await applyExcelImport(preview, v.id, 'append', db)
    expect(await db.expenses.count()).toBe(6)
    // 카테고리는 다시 만들지 않는다
    expect(await db.categories.filter((c) => c.name === '하이패스').count()).toBe(1)
  })

  it('replace는 그 차량의 기존 기록만 지우고 가져온다', async () => {
    const v = (await getActiveVehicle(db))!
    const ts = new Date().toISOString()
    await db.vehicles.add({ id: 'v2', name: '다른 차', plate: null, isActive: false, createdAt: ts, updatedAt: ts })
    await db.fuelLogs.add(fuelLog('other-car', 'v2', '2020-01-01'))
    await db.fuelLogs.add(fuelLog('old', v.id, '2019-01-01'))

    await applyExcelImport(preview, v.id, 'replace', db)

    const ids = (await db.fuelLogs.toArray()).map((f) => f.id)
    expect(ids).toContain('other-car') // 다른 차 기록은 남는다
    expect(ids).not.toContain('old')
    expect(await db.fuelLogs.where('vehicleId').equals(v.id).count()).toBe(1)
  })
})

describe('전체 삭제', () => {
  it('기록을 모두 지우고 처음 상태로 되돌린다', async () => {
    const v = (await getActiveVehicle(db))!
    await db.fuelLogs.add(fuelLog('a', v.id, '2026-01-01'))
    await wipeAll(db)
    expect(await db.fuelLogs.count()).toBe(0)
    expect(await db.categories.count()).toBe(CATEGORY_SEED.length)
    expect((await getActiveVehicle(db))?.name).toBe(DEFAULT_VEHICLE_NAME)
  })
})

function fuelLog(id: string, vehicleId: string, date: string) {
  return {
    id,
    vehicleId,
    date,
    odometer: 1000,
    pricePerLiter: 1500,
    totalPrice: 60000,
    liters: 40,
    station: null,
    memo: null,
    updatedAt: `${date}T00:00:00.000Z`,
  }
}
