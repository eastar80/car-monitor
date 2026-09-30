// 설정 → 데이터. 백업(JSON), 복원(JSON), 기존 엑셀 가져오기, 전체 삭제.
import { useRef, useState } from 'react'
import { AppBar, Confirm, Row, Section, useToast } from '../components/ui'
import { Chevron } from './Settings'
import { db, getActiveVehicle, wipeAll } from '../db'
import { useAppData } from '../hooks'
import {
  BackupError,
  applyExcelImport,
  exportBackup,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  type RestoreMode,
} from '../lib/backup'
import { parseWorkbook, type ImportPreview } from '../lib/excel'
import type { BackupFile } from '../types'
import { dateDot, num } from '../lib/format'

export default function DataSettings() {
  const { vehicle, categories } = useAppData()
  const { show, node: toast } = useToast()
  const jsonInput = useRef<HTMLInputElement>(null)
  const xlsxInput = useRef<HTMLInputElement>(null)

  const [backup, setBackup] = useState<BackupFile | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [askWipe, setAskWipe] = useState(false)
  const [busy, setBusy] = useState(false)

  async function doBackup() {
    setBusy(true)
    try {
      const how = await exportBackup()
      show(how === 'shared' ? '백업 파일을 공유했습니다' : '백업 파일을 저장했습니다')
    } catch (e) {
      // 사용자가 공유를 취소한 경우는 알리지 않는다.
      if (!(e instanceof DOMException && e.name === 'AbortError')) show('백업에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  async function pickJson(file: File) {
    try {
      setBackup(parseBackup(await file.text()))
    } catch (e) {
      show(e instanceof BackupError ? e.message : '파일을 읽을 수 없습니다')
    }
  }

  async function pickXlsx(file: File) {
    try {
      const names = categories.map((c) => c.name)
      setPreview(parseWorkbook(await file.arrayBuffer(), names))
    } catch {
      show('엑셀 파일을 읽을 수 없습니다')
    }
  }

  return (
    <>
      <AppBar title="데이터" />

      <Section title="백업">
        <Row
          title="백업 파일 만들기"
          sub="JSON 한 파일에 모든 기록이 담깁니다"
          right={<Chevron />}
          onClick={() => void doBackup()}
        />
        <Row
          title="백업 파일에서 복원"
          sub="다른 기기의 백업 JSON 불러오기"
          right={<Chevron />}
          onClick={() => jsonInput.current?.click()}
        />
      </Section>

      <Section title="기존 데이터">
        <Row
          title="엑셀(.xlsx) 가져오기"
          sub="기존 앱에서 내보낸 주유·지출 시트"
          right={<Chevron />}
          onClick={() => xlsxInput.current?.click()}
        />
      </Section>

      <Section title="위험">
        <Row
          title={<span className="text-red-600">전체 삭제</span>}
          sub="모든 기록을 지우고 처음 상태로 되돌립니다"
          onClick={() => setAskWipe(true)}
        />
      </Section>

      <p className="px-4 py-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        이 앱은 데이터를 이 브라우저 안에만 저장합니다. 브라우저 데이터를 지우면 기록도 사라지니
        가끔 백업 파일을 만들어 두세요.
      </p>

      {/* 파일 선택기는 화면에 보이지 않게 두고 위 항목에서 눌러 연다. */}
      <input
        ref={jsonInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void pickJson(f)
        }}
      />
      <input
        ref={xlsxInput}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void pickXlsx(f)
        }}
      />

      {backup ? (
        <RestoreSheet
          backup={backup}
          busy={busy}
          onClose={() => setBackup(null)}
          onRun={async (mode) => {
            setBusy(true)
            await restoreBackup(backup, mode)
            setBusy(false)
            setBackup(null)
            show('복원했습니다')
          }}
        />
      ) : null}

      {preview ? (
        <ImportSheet
          preview={preview}
          busy={busy}
          vehicleName={vehicle?.name ?? ''}
          onClose={() => setPreview(null)}
          onRun={async (mode) => {
            const v = await getActiveVehicle()
            if (!v) return show('먼저 차량을 만들어 주세요')
            setBusy(true)
            const r = await applyExcelImport(preview, v.id, mode)
            setBusy(false)
            setPreview(null)
            show(`주유 ${num(r.fuelAdded)}건, 지출 ${num(r.expenseAdded)}건을 가져왔습니다`)
          }}
        />
      ) : null}

      <Confirm
        open={askWipe}
        title="모든 기록을 지울까요?"
        body="주유·지출 기록과 차량, 카테고리가 모두 지워지고 처음 상태로 돌아갑니다. 되돌릴 수 없습니다."
        confirmLabel="전체 삭제"
        danger
        onConfirm={async () => {
          await wipeAll(db)
          setAskWipe(false)
          show('모두 지웠습니다')
        }}
        onCancel={() => setAskWipe(false)}
      />

      {toast}
    </>
  )
}

/** 7.2 복원 전 미리보기 */
function RestoreSheet({
  backup,
  busy,
  onClose,
  onRun,
}: {
  backup: BackupFile
  busy: boolean
  onClose: () => void
  onRun: (mode: RestoreMode) => void
}) {
  const s = summarizeBackup(backup)
  return (
    <Sheet title="백업 복원" onClose={onClose}>
      <dl className="space-y-1 text-sm">
        <Line k="주유" v={`${num(s.fuelCount)}건`} />
        <Line k="지출" v={`${num(s.expenseCount)}건`} />
        <Line k="차량" v={`${num(s.vehicleCount)}대`} />
        <Line k="기간" v={s.from ? `${dateDot(s.from)} ~ ${dateDot(s.to!)}` : '없음'} />
        <Line k="백업 시각" v={new Date(s.exportedAt).toLocaleString('ko-KR')} />
      </dl>
      <div className="mt-5 space-y-2">
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => onRun('merge')}>
          병합하기
        </button>
        <p className="text-xs text-slate-500">같은 기록은 최신 것만 남기고, 없는 기록은 추가합니다.</p>
        <button type="button" className="btn-danger w-full" disabled={busy} onClick={() => onRun('replace')}>
          기존 데이터 지우고 복원
        </button>
      </div>
    </Sheet>
  )
}

/** 6.4 가져오기 전 미리보기 */
function ImportSheet({
  preview,
  busy,
  vehicleName,
  onClose,
  onRun,
}: {
  preview: ImportPreview
  busy: boolean
  vehicleName: string
  onClose: () => void
  onRun: (mode: 'replace' | 'append') => void
}) {
  const empty = preview.fuel.length === 0 && preview.expenses.length === 0
  return (
    <Sheet title="엑셀 가져오기" onClose={onClose}>
      <dl className="space-y-1 text-sm">
        <Line k="주유" v={`${num(preview.fuel.length)}건`} />
        <Line k="지출" v={`${num(preview.expenses.length)}건`} />
        <Line k="기간" v={preview.from ? `${dateDot(preview.from)} ~ ${dateDot(preview.to!)}` : '없음'} />
        <Line k="넣을 차량" v={vehicleName} />
      </dl>

      {preview.newCategoryNames.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-bold">새로 만들 카테고리 ({preview.newCategoryNames.length}개)</h3>
          <p className="mb-1.5 text-xs text-slate-500">
            '기타' 그룹에 만들어집니다. 가져온 뒤 카테고리 관리에서 그룹을 바꿀 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.newCategoryNames.map((n) => (
              <span key={n} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">{n}</span>
            ))}
          </div>
        </div>
      ) : null}

      {preview.errors.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-amber-600">건너뛴 행 ({preview.errors.length}개)</h3>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-500">
            {preview.errors.map((e, i) => (
              <li key={i}>{e.sheet} {e.row}행 · {e.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        <button type="button" className="btn-primary w-full" disabled={busy || empty} onClick={() => onRun('append')}>
          기존 기록에 추가하기
        </button>
        <p className="text-xs text-slate-500">같은 파일을 두 번 가져오면 기록이 중복됩니다.</p>
        <button type="button" className="btn-danger w-full" disabled={busy || empty} onClick={() => onRun('replace')}>
          이 차량 기록을 지우고 가져오기
        </button>
      </div>
    </Sheet>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>닫기</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}
