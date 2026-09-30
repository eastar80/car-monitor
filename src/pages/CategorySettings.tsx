// 설정 → 카테고리 관리. 그룹별 목록, 교환주기(km/개월) 편집, 순서 변경, 보관.
import { useMemo, useState } from 'react'
import { NewCategoryDialog } from './ExpenseForm'
import { AppBar, Field, NumInput, Section } from '../components/ui'
import { db, now } from '../db'
import { useAppData } from '../hooks'
import { num } from '../lib/format'
import type { Category } from '../types'

export default function CategorySettings() {
  const { groups, categories, expenses } = useAppData()
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [adding, setAdding] = useState(false)

  const useCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of expenses) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1)
    return m
  }, [expenses])

  const byGroup = useMemo(
    () =>
      groups.map((g) => ({
        group: g,
        items: categories
          .filter((c) => c.groupId === g.id && (showArchived || !c.isArchived))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    [groups, categories, showArchived],
  )

  /** 같은 그룹 안에서 위/아래로 한 칸 옮긴다. */
  async function move(list: Category[], index: number, dir: -1 | 1) {
    const other = list[index + dir]
    if (!other) return
    const cur = list[index]
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(cur.id, { sortOrder: other.sortOrder, updatedAt: now() })
      await db.categories.update(other.id, { sortOrder: cur.sortOrder, updatedAt: now() })
    })
  }

  return (
    <>
      <AppBar
        title="카테고리 관리"
        right={
          <button type="button" className="px-3 text-sm font-medium text-blue-600" onClick={() => setAdding(true)}>
            추가
          </button>
        }
      />

      <label className="flex min-h-[44px] items-center gap-2 px-4 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        보관한 카테고리도 보기
      </label>

      {byGroup.map(({ group, items }) =>
        items.length === 0 ? null : (
          <Section key={group.id} title={group.name}>
            {items.map((c, i) => (
              <div key={c.id} className="flex min-h-[56px] items-center gap-2 px-4">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
                <button type="button" className="min-w-0 flex-1 py-2 text-left" onClick={() => setEditing(c)}>
                  <div className={`truncate font-medium ${c.isArchived ? 'text-slate-400 line-through' : ''}`}>
                    {c.name}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {intervalText(c)} · 기록 {num(useCount.get(c.id) ?? 0)}건
                  </div>
                </button>
                <div className="flex shrink-0">
                  <IconBtn label="위로" disabled={i === 0} onClick={() => void move(items, i, -1)} d="M18 15l-6-6-6 6" />
                  <IconBtn label="아래로" disabled={i === items.length - 1} onClick={() => void move(items, i, 1)} d="M6 9l6 6 6-6" />
                </div>
              </div>
            ))}
          </Section>
        ),
      )}

      <p className="px-4 py-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        교환주기는 일반적인 기준으로 채워져 있습니다. 차량 매뉴얼에 맞게 고쳐 쓰세요.
        보관한 카테고리는 입력 화면에서 숨겨지지만 기존 기록은 그대로 남습니다.
      </p>

      <CategoryDialog category={editing} groups={groups} onClose={() => setEditing(null)} />
      <NewCategoryDialog
        open={adding}
        groups={groups}
        categories={categories}
        onClose={() => setAdding(false)}
        onCreated={() => setAdding(false)}
      />
    </>
  )
}

function intervalText(c: Category): string {
  const parts: string[] = []
  if (c.intervalKm) parts.push(`${num(c.intervalKm)} km`)
  if (c.intervalMonths) parts.push(`${c.intervalMonths}개월`)
  return parts.length ? `주기 ${parts.join(' / ')}` : '주기 없음'
}

function IconBtn({ label, d, disabled, onClick }: { label: string; d: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-11 w-9 place-items-center text-slate-500 disabled:opacity-25"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </button>
  )
}

/** 카테고리 하나의 이름·그룹·교환주기·보관 여부를 고치는 창 */
function CategoryDialog({
  category,
  groups,
  onClose,
}: {
  category: Category | null
  groups: { id: string; name: string }[]
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [intervalKm, setIntervalKm] = useState('')
  const [intervalMonths, setIntervalMonths] = useState('')
  const [archived, setArchived] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  if (!category) return null

  if (loadedFor !== category.id) {
    setLoadedFor(category.id)
    setName(category.name)
    setGroupId(category.groupId)
    setIntervalKm(category.intervalKm ? String(category.intervalKm) : '')
    setIntervalMonths(category.intervalMonths ? String(category.intervalMonths) : '')
    setArchived(category.isArchived)
  }

  async function save() {
    await db.categories.update(category!.id, {
      name: name.trim() || category!.name,
      groupId,
      // 비워두면 '주기 없음'을 뜻하는 null로 저장한다.
      intervalKm: Number(intervalKm) || null,
      intervalMonths: Number(intervalMonths) || null,
      isArchived: archived,
      updatedAt: now(),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">카테고리 수정</h2>
        <div className="mt-4 space-y-3">
          <Field label="이름">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="그룹">
            <select className="field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="교환주기 (km)">
              <NumInput value={intervalKm} onChange={setIntervalKm} suffix="km" placeholder="없음" />
            </Field>
            <Field label="교환주기 (개월)">
              <NumInput value={intervalMonths} onChange={setIntervalMonths} suffix="개월" placeholder="없음" />
            </Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            보관 (입력 화면에서 숨기기)
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary flex-1" onClick={() => void save()}>저장</button>
        </div>
      </div>
    </div>
  )
}
