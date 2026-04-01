import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import CriticalAlertsTicker from './CriticalAlertsTicker.jsx'
import ChatbotWidget from './ChatbotWidget.jsx'

export default function Layout({ currentUser, onLogout }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar currentUser={currentUser} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header currentUser={currentUser} onLogout={onLogout} />
        <CriticalAlertsTicker />
        <main className="flex-1 main-bg content-scroll">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatbotWidget currentUser={currentUser} />
    </div>
  )
}
