// 설정 → 차량 관리. 목록, 추가, 이름·번호판 수정, 활성 차량 전환.
import { useState } from 'react'
import { AppBar, Confirm, Field, Row, Section } from '../components/ui'
import { db, now, setActiveVehicle, uuid } from '../db'
import { useAppData } from '../hooks'
import type { Vehicle } from '../types'

export default function VehicleSettings() {
  const { vehicles, vehicle, fuelLogs, expenses } = useAppData()
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null)
  const [askDelete, setAskDelete] = useState<Vehicle | null>(null)

  /** 기록이 남아 있거나 마지막 한 대면 지울 수 없다. */
  function canDelete(v: Vehicle): boolean {
    if (vehicles.length <= 1) return false
    const used =
      fuelLogs.some((f) => f.vehicleId === v.id) || expenses.some((e) => e.vehicleId === v.id)
    return !used
  }

  return (
    <>
      <AppBar
        title="차량 관리"
        right={
          <button type="button" className="px-3 text-sm font-medium text-blue-600" onClick={() => setEditing('new')}>
            추가
          </button>
        }
      />

      <Section>
        {vehicles.map((v) => (
          <Row
            key={v.id}
            title={
              <span className="flex items-center gap-2">
                {v.name}
                {v.id === vehicle?.id ? (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">사용 중</span>
                ) : null}
              </span>
            }
            sub={v.plate ?? undefined}
            right={
              <div className="flex shrink-0 items-center gap-1">
                {v.id !== vehicle?.id ? (
                  <button
                    type="button"
                    className="min-h-[36px] rounded-lg border border-slate-300 px-2.5 text-xs font-medium dark:border-slate-700"
                    onClick={() => void setActiveVehicle(v.id)}
                  >
                    사용
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-[36px] rounded-lg px-2.5 text-xs font-medium text-blue-600"
                  onClick={() => setEditing(v)}
                >
                  수정
                </button>
                {canDelete(v) ? (
                  <button
                    type="button"
                    className="min-h-[36px] rounded-lg px-2.5 text-xs font-medium text-red-600"
                    onClick={() => setAskDelete(v)}
                  >
                    삭제
                  </button>
                ) : null}
              </div>
            }
          />
        ))}
      </Section>

      <p className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
        기록은 사용 중인 차량에 저장됩니다. 기록이 있는 차량은 삭제할 수 없습니다.
      </p>

      <VehicleDialog
        target={editing}
        onClose={() => setEditing(null)}
        isFirst={vehicles.length === 0}
      />

      <Confirm
        open={askDelete !== null}
        title={`'${askDelete?.name}' 차량을 삭제할까요?`}
        body="삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        danger
        onConfirm={async () => {
          await db.vehicles.delete(askDelete!.id)
          setAskDelete(null)
        }}
        onCancel={() => setAskDelete(null)}
      />
    </>
  )
}

function VehicleDialog({
  target,
  onClose,
  isFirst,
}: {
  target: Vehicle | 'new' | null
  onClose: () => void
  isFirst: boolean
}) {
  const isNew = target === 'new'
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  if (target === null) return null

  // 창이 열릴 때 한 번 현재 값을 채운다.
  const key = isNew ? 'new' : target.id
  if (loadedFor !== key) {
    setLoadedFor(key)
    setName(isNew ? '' : target.name)
    setPlate(isNew ? '' : (target.plate ?? ''))
  }

  async function save() {
    const n = name.trim()
    if (!n) return
    if (isNew) {
      const id = uuid()
      const ts = now()
      await db.vehicles.add({ id, name: n, plate: plate.trim() || null, isActive: isFirst, createdAt: ts, updatedAt: ts })
    } else {
      await db.vehicles.update((target as Vehicle).id, { name: n, plate: plate.trim() || null, updatedAt: now() })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{isNew ? '차량 추가' : '차량 수정'}</h2>
        <div className="mt-4 space-y-3">
          <Field label="이름">
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 캡티바" />
          </Field>
          <Field label="번호판 (선택)">
            <input className="field" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="예: 12가 3456" />
          </Field>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary flex-1" disabled={!name.trim()} onClick={() => void save()}>저장</button>
        </div>
      </div>
    </div>
  )
}
