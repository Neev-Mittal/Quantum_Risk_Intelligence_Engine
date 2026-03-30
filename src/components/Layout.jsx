import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import CriticalAlertsTicker from './CriticalAlertsTicker.jsx'

export default function Layout({ children, onLogout }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onLogout={onLogout} />
        <CriticalAlertsTicker />
        <main className="flex-1 main-bg content-scroll">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
