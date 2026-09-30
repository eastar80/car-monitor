// 4.6 설정 첫 화면. 세부 기능은 하위 화면으로 나눈다.
import { useNavigate } from 'react-router-dom'
import { PageTitle, Row, Section } from '../components/ui'
import { useAppData } from '../hooks'
import { num } from '../lib/format'

const APP_VERSION = '2.0.0 (2단계)'

export default function Settings() {
  const navigate = useNavigate()
  const { vehicle, vehicles, categories, fuelLogs, expenses } = useAppData()
  const activeCategories = categories.filter((c) => !c.isArchived).length

  return (
    <div>
      <PageTitle>설정</PageTitle>

      <Section>
        <Row
          title="차량 관리"
          sub={vehicle ? `${vehicle.name}${vehicles.length > 1 ? ` 외 ${vehicles.length - 1}대` : ''}` : '차량 없음'}
          right={<Chevron />}
          onClick={() => navigate('/settings/vehicles')}
        />
        <Row
          title="카테고리 관리"
          sub={`${activeCategories}개 사용 중`}
          right={<Chevron />}
          onClick={() => navigate('/settings/categories')}
        />
        <Row
          title="교환주기 현황"
          sub="마지막 교환일·주행거리와 잔여량"
          right={<Chevron />}
          onClick={() => navigate('/settings/intervals')}
        />
        <Row
          title="데이터"
          sub="백업, 복원, 엑셀 가져오기, CSV 내보내기"
          right={<Chevron />}
          onClick={() => navigate('/settings/data')}
        />
      </Section>

      <Section title="정보">
        <Row title="앱 버전" right={<span className="text-sm text-slate-500">{APP_VERSION}</span>} />
        <Row title="주유 기록" right={<span className="text-sm text-slate-500">{num(fuelLogs.length)}건</span>} />
        <Row title="지출 기록" right={<span className="text-sm text-slate-500">{num(expenses.length)}건</span>} />
      </Section>

    </div>
  )
}

export function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
