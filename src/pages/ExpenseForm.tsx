// 4.3 지출 입력 / 수정 화면.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppBar, Confirm, Field, NumInput } from '../components/ui'
import { db, now, uuid } from '../db'
import { useAppData } from '../hooks'
import { currentOdometer } from '../lib/calc'
import { today } from '../lib/date'
import { km, num } from '../lib/format'
import type { Category, Group } from '../types'

export default function ExpenseForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { vehicle, groups, categories, fuelLogs, expenses, loading } = useAppData()
  const editing = Boolean(id)

  const [date, setDate] = useState(today())
  const [odometer, setOdometer] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [place, setPlace] = useState('')
  const [memo, setMemo] = useState('')
  const [ready, setReady] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [newCatOpen, setNewCatOpen] = useState(false)

  const odoNow = useMemo(() => currentOdometer(fuelLogs, expenses), [fuelLogs, expenses])

  useEffect(() => {
    if (loading || ready) return
    if (editing) {
      db.expenses.get(id!).then((e) => {
        if (!e) return navigate('/records', { replace: true })
        setDate(e.date)
        setOdometer(String(e.odometer))
        setCategoryId(e.categoryId)
        setAmount(String(e.amount))
        setPlace(e.place ?? '')
        setMemo(e.memo ?? '')
        setReady(true)
      })
    } else {
      setReady(true)
    }
  }, [loading, ready, editing, id, navigate])

  /** 카테고리를 그룹별로 묶고, 그룹 안에서는 자주 쓴 순서로 정렬한다. */
  const chipGroups = useMemo(() => {
    const useCount = new Map<string, number>()
    for (const e of expenses) useCount.set(e.categoryId, (useCount.get(e.categoryId) ?? 0) + 1)
    const byGroup = new Map<string, Category[]>()
    for (const c of categories) {
      // 보관한 카테고리는 숨기되, 수정 중인 기록이 쓰고 있으면 남겨둔다.
      if (c.isArchived && c.id !== categoryId) continue
      const list = byGroup.get(c.groupId) ?? []
      list.push(c)
      byGroup.set(c.groupId, list)
    }
    for (const list of byGroup.values()) {
      list.sort((a, b) => (useCount.get(b.id) ?? 0) - (useCount.get(a.id) ?? 0) || a.sortOrder - b.sortOrder)
    }
    return groups
      .map((g) => ({ group: g, items: byGroup.get(g.id) ?? [] }))
      .filter((x) => x.items.length > 0)
  }, [categories, groups, expenses, categoryId])

  const odoValue = Number(odometer)
  const odoWarning = odometer !== '' && odoNow > 0 && odoValue < odoNow
  const canSave = date !== '' && odometer !== '' && categoryId !== '' && Number(amount) > 0

  async function save() {
    if (!vehicle || !canSave) return
    const record = {
      vehicleId: vehicle.id,
      date,
      odometer: odoValue,
      categoryId,
      amount: Number(amount),
      place: place.trim() || null,
      memo: memo.trim() || null,
      updatedAt: now(),
    }
    if (editing) await db.expenses.update(id!, record)
    else await db.expenses.add({ id: uuid(), ...record })
    navigate(-1)
  }

  async function remove() {
    await db.expenses.delete(id!)
    navigate('/records', { replace: true })
  }

  return (
    <>
      <AppBar
        title={editing ? '지출 수정' : '지출 추가'}
        right={
          editing ? (
            <button type="button" className="px-3 text-sm font-medium text-red-600" onClick={() => setAskDelete(true)}>
              삭제
            </button>
          ) : null
        }
      />
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="날짜">
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field
          label="총주행거리"
          hint={
            odoWarning ? (
              <span className="text-amber-600 dark:text-amber-400">
                현재 주행거리({km(odoNow)})보다 작습니다. 그대로 저장할 수 있습니다.
              </span>
            ) : odoNow > 0 ? (
              `현재 ${km(odoNow)}`
            ) : undefined
          }
        >
          <NumInput value={odometer} onChange={setOdometer} suffix="km" placeholder={odoNow > 0 ? num(odoNow) : '0'} />
        </Field>

        <div>
          <span className="label">카테고리</span>
          <div className="space-y-3">
            {chipGroups.map(({ group, items }) => (
              <div key={group.id}>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: group.color }} />
                  {group.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={`min-h-[44px] rounded-full border px-3.5 text-sm font-medium transition ${
                        categoryId === c.id
                          ? 'border-transparent text-white'
                          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                      style={categoryId === c.id ? { background: group.color } : undefined}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setNewCatOpen(true)}
              className="min-h-[44px] rounded-full border border-dashed border-slate-400 px-3.5 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              + 새 카테고리
            </button>
          </div>
        </div>

        <Field label="금액">
          <NumInput value={amount} onChange={setAmount} suffix="원" />
        </Field>

        <Field label="장소">
          <input className="field" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="예: 동네 정비소" />
        </Field>

        <Field label="메모">
          <input className="field" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 전우, 4개" />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={!canSave}>
          {editing ? '저장' : '추가'}
        </button>
      </form>

      <NewCategoryDialog
        open={newCatOpen}
        groups={groups}
        categories={categories}
        onClose={() => setNewCatOpen(false)}
        onCreated={(cid) => {
          setCategoryId(cid)
          setNewCatOpen(false)
        }}
      />

      <Confirm
        open={askDelete}
        title="이 지출 기록을 삭제할까요?"
        body="삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setAskDelete(false)}
      />
    </>
  )
}

/** 지출 입력 중에 바로 카테고리를 추가하는 작은 창 */
export function NewCategoryDialog({
  open,
  groups,
  categories,
  onClose,
  onCreated,
}: {
  open: boolean
  groups: Group[]
  categories: Category[]
  onClose: () => void
  onCreated: (categoryId: string) => void
}) {
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      // 기본 그룹은 '소모품'. 없으면 첫 그룹.
      setGroupId(groups.find((g) => g.name === '소모품')?.id ?? groups[0]?.id ?? '')
    }
  }, [open, groups])

  if (!open) return null

  const trimmed = name.trim()
  const duplicated = categories.some((c) => c.name === trimmed)

  async function create() {
    if (!trimmed || !groupId || duplicated) return
    const cid = uuid()
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sortOrder), -1)
    await db.categories.add({
      id: cid,
      name: trimmed,
      groupId,
      intervalKm: null,
      intervalMonths: null,
      sortOrder: maxOrder + 1,
      isArchived: false,
      updatedAt: now(),
    })
    onCreated(cid)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">새 카테고리</h2>
        <div className="mt-4 space-y-3">
          <Field label="이름" hint={duplicated ? <span className="text-red-600">같은 이름이 이미 있습니다</span> : undefined}>
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="그룹">
            <select className="field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-slate-500">교환주기는 설정 → 카테고리 관리에서 정할 수 있습니다.</p>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary flex-1" disabled={!trimmed || duplicated} onClick={() => void create()}>
            추가
          </button>
        </div>
      </div>
    </div>
  )
}

