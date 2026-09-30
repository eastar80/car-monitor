// 앱 전체 구조: 하단 탭 4개(홈·기록·통계·설정)와 라우팅.
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Records from './pages/Records'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import VehicleSettings from './pages/VehicleSettings'
import CategorySettings from './pages/CategorySettings'
import DataSettings from './pages/DataSettings'
import FuelForm from './pages/FuelForm'
import ExpenseForm from './pages/ExpenseForm'

/** 하단 탭이 보이는 주소들 */
const TAB_PATHS = ['/', '/records', '/stats', '/settings']

export default function App() {
  const { pathname } = useLocation()
  const showTabs = TAB_PATHS.includes(pathname)

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <main className={showTabs ? 'flex-1 pb-24' : 'flex-1 pb-8'}>
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
      <Tab to="/settings" label="설정" icon="M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h1m14 0h1M12 4v1m0 14v1" />
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
