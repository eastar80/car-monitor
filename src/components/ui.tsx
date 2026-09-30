// 여러 화면에서 함께 쓰는 작은 UI 조각들.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

/** 폼·하위 화면 상단 바. 뒤로가기와 오른쪽 버튼 자리를 가진다. */
export function AppBar({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => (onBack ? onBack() : navigate(-1))}
        className="grid h-11 w-11 place-items-center rounded-full text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {right}
    </header>
  )
}

/** 탭 화면 상단 제목 */
export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
      <h1 className="text-2xl font-bold">{children}</h1>
      {right}
    </div>
  )
}

/** 라벨 + 입력 한 줄 */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  )
}

/**
 * 숫자 입력. 폰에서 숫자 키패드가 뜨도록 inputMode="decimal"을 쓴다.
 * 정수 필드(금액·주행거리)는 입력 중에도 천 단위 콤마를 붙여 읽기 쉽게 한다.
 */
export function NumInput({
  value,
  onChange,
  decimal = false,
  suffix,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  decimal?: boolean
  suffix?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const display = decimal ? value : addCommas(value)
  return (
    <div className="relative">
      <input
        className="field pr-12 text-right text-lg font-semibold"
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          // 콤마와 허용되지 않는 글자를 떼어내고 숫자만 남긴다.
          const raw = e.target.value.replace(/,/g, '')
          const cleaned = decimal ? raw.replace(/[^\d.]/g, '') : raw.replace(/[^\d]/g, '')
          onChange(cleaned)
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}

function addCommas(v: string): string {
  if (v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : v
}

/** 접었다 펼치는 영역 ("더 보기") */
export function Collapsible({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-400"
      >
        {label}
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={open ? 'rotate-180 transition' : 'transition'}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? <div className="space-y-3 pt-1">{children}</div> : null}
    </div>
  )
}

/** 기록이 없을 때 빈 그래프 대신 보여주는 문구 (8.3절) */
export function Empty({ children = '기록이 없습니다' }: { children?: ReactNode }) {
  return (
    <div className="grid place-items-center py-10 text-sm text-slate-500 dark:text-slate-400">{children}</div>
  )
}

/** 삭제 등 되돌릴 수 없는 동작 전에 띄우는 확인 창 */
export function Confirm({
  open,
  title,
  body,
  confirmLabel = '확인',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{title}</h2>
        {body ? <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{body}</div> : null}
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onCancel}>취소</button>
          <button type="button" className={danger ? 'btn-danger flex-1' : 'btn-primary flex-1'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 화면 아래에서 잠깐 떴다 사라지는 알림 */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = (m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2200)
  }
  const node = msg ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-6">
      <div className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
        {msg}
      </div>
    </div>
  ) : null
  return { show, node }
}

/** 설정 화면에서 쓰는 목록 줄 */
export function Row({
  title,
  sub,
  right,
  onClick,
}: {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {sub ? <div className="truncate text-sm text-slate-500 dark:text-slate-400">{sub}</div> : null}
      </div>
      {right}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-slate-100 dark:active:bg-slate-800">
        {inner}
      </button>
    )
  }
  return <div className="flex min-h-[56px] w-full items-center gap-3 px-4">{inner}</div>
}

/** 설정 화면의 구역 묶음 */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      {title ? <h2 className="px-4 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2> : null}
      <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </section>
  )
}
