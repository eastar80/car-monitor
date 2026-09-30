// 앱 전체 구조: 하단 탭 4개(홈·기록·통계·설정)와 라우팅.
import { Suspense, lazy } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Records from './pages/Records'
import Settings from './pages/Settings'
import VehicleSettings from './pages/VehicleSettings'
import CategorySettings from './pages/CategorySettings'
import FuelForm from './pages/FuelForm'
import ExpenseForm from './pages/ExpenseForm'

// 그래프(Recharts)와 엑셀 읽기(SheetJS)는 용량이 커서 해당 화면에 들어갈 때만 내려받는다.
// 서비스워커가 모든 조각을 미리 캐시하므로 오프라인 동작에는 영향이 없다.
const Stats = lazy(() => import('./pages/Stats'))
const DataSettings = lazy(() => import('./pages/DataSettings'))

/** 하단 탭이 보이는 주소들 */
const TAB_PATHS = ['/', '/records', '/stats', '/settings']

export default function App() {
  const { pathname } = useLocation()
  const showTabs = TAB_PATHS.includes(pathname)

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <main className={showTabs ? 'flex-1 pb-24' : 'flex-1 pb-8'}>
        <Suspense fallback={<div className="p-6 text-slate-500">불러오는 중…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/records" element={<Records />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/vehicles" element={<VehicleSettings />} />
          <Route path="/settings/categories" element={<CategorySettings />} />
          <Route path="/settings/data" element={<DataSettings />} />
          <Route path="/fuel/new" element={<FuelForm />} />
          <Route path="/fuel/:id" element={<FuelForm />} />
          <Route path="/expense/new" element={<ExpenseForm />} />
          <Route path="/expense/:id" element={<ExpenseForm />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
      </main>
      {showTabs ? <TabBar /> : null}
    </div>
  )
}

function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-3xl border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Tab to="/" label="홈" icon="M3 11l9-8 9 8M5 10v10h14V10" />
      <Tab to="/records" label="기록" icon="M4 6h16M4 12h16M4 18h10" />
      <Tab to="/stats" label="통계" icon="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      <Tab
        to="/settings"
        label="설정"
        icon="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      />
    </nav>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
          isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
        }`
      }
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon} />
      </svg>
      {label}
    </NavLink>
  )
}
