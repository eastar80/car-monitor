// 통계 화면에서 쓰는 그래프들. 8.3절 지침을 따른다.
// - 애니메이션은 짧게(300ms) 쓰고, 축은 흐리게, 값 라벨은 꼭 필요한 곳에만
// - 그룹 색은 8.2절 고정 색을 라이트/다크 모두에서 그대로 쓴다
//   (색맹 구분·대비 검사를 두 배경 모두에서 통과했다)
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BucketRow, PricePoint, Slice, YearMileage } from '../lib/calc'
import { dateDot, monthLabel, num, won, wonShort } from '../lib/format'

/** 시스템 다크 모드 여부 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

/** 막대에 쌓을 계열 하나 */
export interface Series {
  key: string
  name: string
  color: string
}

interface ChartRow extends Record<string, unknown> {
  label: string
  total: number
  /** 이 막대에서 맨 위/맨 아래에 있는 계열 (모서리 둥글리기와 간격 계산용) */
  __top: string
  __bottom: string
}

/**
 * 월별(또는 연도별) 그룹 누적 막대.
 * 주유를 맨 아래 두고 그 위로 소모품·고정비·수리·기타를 쌓는다.
 */
export function StackedBars({
  rows,
  series,
  unit,
}: {
  rows: BucketRow[]
  series: Series[]
  unit: 'month' | 'year'
}) {
  const dark = useDarkMode()
  const axis = dark ? '#64748B' : '#94A3B8'
  const surface = dark ? '#0F172A' : '#FFFFFF'

  const data: ChartRow[] = rows.map((r) => {
    const values: Record<string, number> = {}
    for (const s of series) values[s.key] = valueOf(r, s.key)
    const nonZero = series.filter((s) => values[s.key] > 0)
    return {
      ...values,
      label: unit === 'month' ? monthLabel(r.key) : r.key,
      total: r.total,
      // 합계 라벨을 막대 맨 위에 붙이기 위한 높이 0짜리 앵커
      __labelAnchor: 0,
      __bottom: nonZero[0]?.key ?? '',
      __top: nonZero.at(-1)?.key ?? '',
    }
  })

  // 12개 이상이면 x축 라벨을 3개마다 하나씩만 그린다 (8.3절)
  const tickInterval = data.length >= 12 ? 2 : data.length >= 9 ? 1 : 0

  // 막대가 많아지면 합계 숫자가 서로 겹치므로 x축 눈금과 같은 간격으로만 적는다.
  // 가장 큰 막대는 반드시 적고, 그 옆에 붙는 숫자는 겹치지 않게 뺀다.
  const labelAt = new Set<number>()
  for (let i = 0; i < data.length; i += tickInterval + 1) labelAt.add(i)
  if (tickInterval > 0) {
    let maxIdx = -1
    data.forEach((r, i) => { if (r.total > (data[maxIdx]?.total ?? 0)) maxIdx = i })
    if (maxIdx >= 0) {
      for (const i of [...labelAt]) if (Math.abs(i - maxIdx) <= 1) labelAt.delete(i)
      labelAt.add(maxIdx)
    }
  }

  if (rows.every((r) => r.total === 0)) return <NoData />

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barCategoryGap="18%">
          <XAxis
            dataKey="label"
            interval={tickInterval}
            tick={{ fontSize: 11, fill: axis }}
            tickLine={false}
            axisLine={{ stroke: axis, strokeOpacity: 0.3 }}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: dark ? '#FFFFFF10' : '#0F172A08' }}
            content={<StackTooltip series={series} />}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              name={s.name}
              fill={s.color}
              isAnimationActive
              animationDuration={300}
              shape={(props: unknown) => <StackSegment {...(props as SegmentProps)} surface={surface} />}
            />
          ))}
          {/* 막대 위 합계는 스택 맨 위에 붙인 높이 0짜리 막대에 라벨로 얹는다 */}
          <Bar
            dataKey="__labelAnchor"
            stackId="a"
            fill="transparent"
            isAnimationActive={false}
            label={(props: unknown) => {
              const { x, y, width, index } = props as { x: number; y: number; width: number; index: number }
              const total = data[index]?.total ?? 0
              if (!total || !labelAt.has(index)) return <g />
              return (
                <text
                  x={x + width / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={10}
                  fill={dark ? '#CBD5E1' : '#475569'}
                >
                  {wonShort(total)}
                </text>
              )
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function valueOf(r: BucketRow, key: string): number {
  return key === '__fuel__' ? r.fuel : (r.byGroup[key] ?? 0)
}

interface SegmentProps {
  x: number
  y: number
  width: number
  height: number
  fill: string
  dataKey: string
  payload: ChartRow
  surface: string
}

/**
 * 누적 막대의 한 조각.
 * 맨 위 조각만 위 모서리를 둥글리고, 조각 사이에는 2px 틈을 둔다.
 */
function StackSegment({ x, y, width, height, fill, dataKey, payload }: SegmentProps) {
  if (!(height > 0)) return <g />
  const isTop = payload.__top === dataKey
  const isBottom = payload.__bottom === dataKey
  // 맨 아래 조각은 바닥에 붙이고, 나머지는 아래쪽을 2px 깎아 틈을 만든다.
  const h = isBottom ? height : Math.max(height - 2, 0.5)
  const r = isTop ? Math.min(4, width / 2, h) : 0
  const d = r
    ? `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + h} Z`
    : `M${x},${y} h${width} v${h} h${-width} Z`
  return <path d={d} fill={fill} />
}

/** 막대를 탭했을 때 그룹별 금액을 보여주는 툴팁 */
function StackTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
  label?: string
  series: Series[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1.5 font-bold">{label}</div>
      {series
        .filter((s) => Number(row[s.key]) > 0)
        .map((s) => (
          <div key={s.key} className="flex items-center gap-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-slate-600 dark:text-slate-400">{s.name}</span>
            <span className="font-medium">{won(Number(row[s.key]))}</span>
          </div>
        ))}
      <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 font-bold dark:border-slate-700">
        <span>합계</span>
        <span>{won(row.total)}</span>
      </div>
    </div>
  )
}

/** 비중 도넛. 가운데에 총액을 쓰고, 조각을 탭하면 드릴다운한다. */
export function Donut({
  slices,
  centerLabel,
  onSelect,
}: {
  slices: Slice[]
  centerLabel: string
  onSelect?: (id: string) => void
}) {
  const dark = useDarkMode()
  const surface = dark ? '#0F172A' : '#FFFFFF'
  const total = slices.reduce((s, x) => s + x.amount, 0)
  if (slices.length === 0) return <NoData />

  return (
    <div className="md:flex md:items-center md:gap-4">
      <div className="relative mx-auto h-56 w-56 shrink-0 md:h-48 md:w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="name"
              innerRadius="62%"
              outerRadius="96%"
              // 조각 사이 2px 틈
              stroke={surface}
              strokeWidth={2}
              isAnimationActive
              animationDuration={300}
              onClick={(d: unknown) => onSelect?.((d as Slice).id)}
            >
              {slices.map((s) => (
                <Cell key={s.id} fill={s.color} cursor={onSelect ? 'pointer' : 'default'} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* 가운데 총액 */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{centerLabel}</div>
            <div className="text-lg font-bold" title={won(total)}>{wonShort(total)}</div>
          </div>
        </div>
      </div>

      {/* 범례 겸 목록. 금액 내림차순이며 색만으로 구분하지 않도록 이름·금액을 함께 쓴다. */}
      <ul className="mt-3 min-w-0 flex-1 space-y-1 md:mt-0">
        {slices.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(s.id)}
              className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-1 text-sm enabled:active:bg-slate-100 dark:enabled:active:bg-slate-800"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate text-left">{s.name}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                {(s.ratio * 100).toFixed(0)}%
              </span>
              <span className="w-16 shrink-0 text-right font-medium tabular-nums" title={won(s.amount)}>
                {wonShort(s.amount)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SliceTooltip({ active, payload }: { active?: boolean; payload?: { payload: Slice }[] }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="font-bold">{s.name}</div>
      <div>{won(s.amount)} · {(s.ratio * 100).toFixed(1)}%</div>
    </div>
  )
}

/** 데이터가 없을 때는 빈 그래프 대신 문구를 보여준다 (8.3절) */
function NoData({ children = '기록이 없습니다' }: { children?: React.ReactNode }) {
  return (
    <div className="grid h-40 place-items-center text-sm text-slate-500 dark:text-slate-400">
      {children}
    </div>
  )
}


// ---------------------------------------------------------------------------
// 연비 막대 (연도별)
// ---------------------------------------------------------------------------

/**
 * 연도별 연비 막대. (8.3절)
 * 주유 기록이 3건 미만이라 계산하지 못한 연도는 빈 막대로 두고 라벨만 붙인다.
 */
export function MileageBars({ rows }: { rows: YearMileage[] }) {
  const dark = useDarkMode()
  const axis = dark ? '#64748B' : '#94A3B8'
  const bar = '#16A34A'

  if (rows.length === 0 || rows.every((r) => r.kmPerLiter === null)) {
    return <NoData>연비를 계산할 기록이 부족합니다</NoData>
  }

  const data = rows.map((r) => ({
    label: r.year.slice(2),
    value: r.kmPerLiter ?? 0,
    missing: r.kmPerLiter === null,
  }))

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: axis }}
            tickLine={false}
            axisLine={{ stroke: axis, strokeOpacity: 0.3 }}
          />
          <YAxis hide />
          <Tooltip cursor={{ fill: dark ? '#FFFFFF10' : '#0F172A08' }} content={<MileageTooltip />} />
          <Bar dataKey="value" fill={bar} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={300}
               label={(props: unknown) => {
                 const { x, y, width, index } = props as { x: number; y: number; width: number; index: number }
                 const d = data[index]
                 return (
                   <text
                     x={x + width / 2}
                     y={d.missing ? y - 5 : y - 5}
                     textAnchor="middle"
                     fontSize={10}
                     fill={d.missing ? axis : dark ? '#CBD5E1' : '#475569'}
                   >
                     {d.missing ? '부족' : num(d.value, 1)}
                   </text>
                 )
               }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 유가 추이 (선)
// ---------------------------------------------------------------------------

/**
 * 리터당 가격 선 그래프. (8.3절)
 * 점은 찍지 않고 선만 그리며, 최고·최저점에만 값 라벨을 붙인다.
 */
export function PriceLine({ points }: { points: PricePoint[] }) {
  const dark = useDarkMode()
  const axis = dark ? '#64748B' : '#94A3B8'

  if (points.length < 2) return <NoData />

  let minI = 0
  let maxI = 0
  points.forEach((p, i) => {
    if (p.price < points[minI].price) minI = i
    if (p.price > points[maxI].price) maxI = i
  })

  const data = points.map((p, i) => ({ ...p, label: p.date.slice(2, 7).replace('-', '.'), i }))

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* 오른쪽 여백을 조금 더 둬야 마지막 x축 라벨이 잘리지 않는다 */}
        <LineChart data={data} margin={{ top: 22, right: 24, bottom: 0, left: 16 }}>
          <XAxis
            dataKey="label"
            // 점이 많으므로 라벨은 드문드문 그린다.
            interval={Math.max(Math.floor(data.length / 5) - 1, 0)}
            tick={{ fontSize: 11, fill: axis }}
            tickLine={false}
            axisLine={{ stroke: axis, strokeOpacity: 0.3 }}
          />
          <YAxis hide domain={['dataMin - 80', 'dataMax + 80']} />
          <Tooltip content={<PriceTooltip />} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#2563EB"
            strokeWidth={2}
            dot={false}
            isAnimationActive
            animationDuration={300}
            label={(props: unknown) => {
              const { x, y, index } = props as { x: number; y: number; index: number }
              if (index !== minI && index !== maxI) return <g />
              const isMax = index === maxI
              return (
                <text
                  x={x}
                  y={isMax ? y - 8 : y + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={dark ? '#CBD5E1' : '#475569'}
                >
                  {num(data[index].price)}
                </text>
              )
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MileageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { payload: { value: number; missing: boolean } }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="font-bold">20{label}년</div>
      <div>{d.missing ? '데이터 부족' : `${num(d.value, 2)} km/L`}</div>
    </div>
  )
}

function PriceTooltip({ active, payload }: { active?: boolean; payload?: { payload: PricePoint }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="font-bold">{dateDot(d.date)}</div>
      <div>{won(d.price)} / L</div>
    </div>
  )
}
