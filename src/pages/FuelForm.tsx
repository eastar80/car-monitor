// 4.2 주유 입력 / 수정 화면.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppBar, Collapsible, Confirm, Field, NumInput } from '../components/ui'
import { db, now, uuid } from '../db'
import { useAppData } from '../hooks'
import { currentOdometer, sortFuel } from '../lib/calc'
import { today } from '../lib/date'
import { km, num } from '../lib/format'

export default function FuelForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { vehicle, fuelLogs, expenses, loading } = useAppData()
  const editing = Boolean(id)

  const [date, setDate] = useState(today())
  const [odometer, setOdometer] = useState('')
  const [pricePerLiter, setPricePerLiter] = useState('')
  const [totalPrice, setTotalPrice] = useState('')
  const [liters, setLiters] = useState('')
  // 리터를 사용자가 직접 고쳤으면 자동 계산으로 덮어쓰지 않는다.
  const [litersEdited, setLitersEdited] = useState(false)
  const [station, setStation] = useState('')
  const [memo, setMemo] = useState('')
  const [ready, setReady] = useState(false)
  const [askDelete, setAskDelete] = useState(false)

  const odoNow = useMemo(() => currentOdometer(fuelLogs, expenses), [fuelLogs, expenses])
  /** 마지막 주유의 리터당 가격을 새 입력의 기본값으로 쓴다. */
  const lastPrice = useMemo(() => sortFuel(fuelLogs).at(-1)?.pricePerLiter, [fuelLogs])

  // 처음 한 번만 초기값을 채운다.
  useEffect(() => {
    if (loading || ready) return
    if (editing) {
      db.fuelLogs.get(id!).then((f) => {
        if (!f) return navigate('/records', { replace: true })
        setDate(f.date)
        setOdometer(String(f.odometer))
        setPricePerLiter(String(f.pricePerLiter))
        setTotalPrice(String(f.totalPrice))
        setLiters(String(f.liters))
        setLitersEdited(true)
        setStation(f.station ?? '')
        setMemo(f.memo ?? '')
        setReady(true)
      })
    } else {
      // 단가는 값을 미리 채우지 않는다. 지우고 쓰는 수고를 없애려고
      // 회색 힌트로만 보여주고, 비워 두면 저장할 때 지난 단가를 쓴다.
      setReady(true)
    }
  }, [loading, ready, editing, id, lastPrice, navigate])

  /**
   * 실제로 저장할 리터당 가격.
   * 새 기록에서 칸을 비워 두면 지난 주유 단가를 그대로 쓴다.
   * (수정 중일 때는 비운 것을 '지우겠다'는 뜻으로 보고 대신 채우지 않는다.)
   */
  const lastPriceRounded = lastPrice ? Math.round(lastPrice) : 0
  const effectivePrice = Number(pricePerLiter) || (editing ? 0 : lastPriceRounded)

  // 리터 자동 계산: 금액 ÷ 리터당 가격, 소수 2자리.
  useEffect(() => {
    if (litersEdited) return
    const p = effectivePrice
    const t = Number(totalPrice)
    setLiters(p > 0 && t > 0 ? (Math.round((t / p) * 100) / 100).toFixed(2) : '')
  }, [effectivePrice, totalPrice, litersEdited])

  const odoValue = Number(odometer)
  // 현재 주행거리보다 작게 넣으면 경고만 하고 저장은 허용한다.
  const odoWarning = odometer !== '' && odoNow > 0 && odoValue < odoNow
  const canSave = date !== '' && odometer !== '' && effectivePrice > 0 && Number(totalPrice) > 0

  async function save() {
    if (!vehicle || !canSave) return
    const record = {
      vehicleId: vehicle.id,
      date,
      odometer: odoValue,
      pricePerLiter: effectivePrice,
      totalPrice: Number(totalPrice),
      liters: Number(liters) || 0,
      station: station.trim() || null,
      memo: memo.trim() || null,
      updatedAt: now(),
    }
    if (editing) await db.fuelLogs.update(id!, record)
    else await db.fuelLogs.add({ id: uuid(), ...record })
    navigate(-1)
  }

  async function remove() {
    await db.fuelLogs.delete(id!)
    navigate('/records', { replace: true })
  }

  return (
    <>
      <AppBar
        title={editing ? '주유 수정' : '주유 추가'}
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

        <Field
          label="리터당 가격"
          hint={
            !editing && lastPriceRounded
              ? pricePerLiter === ''
                ? `비워 두면 지난 단가 ${num(lastPriceRounded)}원으로 저장됩니다`
                : undefined
              : undefined
          }
        >
          <NumInput
            value={pricePerLiter}
            onChange={setPricePerLiter}
            suffix="원"
            placeholder={!editing && lastPriceRounded ? num(lastPriceRounded) : undefined}
          />
        </Field>

        <Field label="주유 금액">
          <NumInput value={totalPrice} onChange={setTotalPrice} suffix="원" />
        </Field>

        <Field label="리터" hint={litersEdited ? '직접 입력한 값입니다' : '금액 ÷ 리터당 가격으로 자동 계산됩니다'}>
          <NumInput
            value={liters}
            decimal
            suffix="L"
            onChange={(v) => {
              setLitersEdited(true)
              setLiters(v)
            }}
          />
        </Field>

        <Collapsible label="더 보기 (주유소·메모)">
          <Field label="주유소">
            <input className="field" value={station} onChange={(e) => setStation(e.target.value)} placeholder="예: 상록주유소" />
          </Field>
          <Field label="메모">
            <input className="field" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </Collapsible>

        <button type="submit" className="btn-primary w-full" disabled={!canSave}>
          {editing ? '저장' : '추가'}
        </button>
      </form>

      <Confirm
        open={askDelete}
        title="이 주유 기록을 삭제할까요?"
        body="삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setAskDelete(false)}
      />
    </>
  )
}
