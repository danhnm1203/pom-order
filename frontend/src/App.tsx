import { Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { CustomerListPage } from '@/pages/CustomerListPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FxRatePage } from '@/pages/FxRatePage'
import { LoginPage } from '@/pages/LoginPage'
import { LookupPage } from '@/pages/LookupPage'
import { NewOrderPage } from '@/pages/NewOrderPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { OrderListPage } from '@/pages/OrderListPage'
import { PublicOrderPage } from '@/pages/PublicOrderPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      {/* Public — no auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/o/:token" element={<PublicOrderPage />} />
      <Route path="/tra-cuu" element={<LookupPage />} />
      <Route path="/lookup" element={<LookupPage />} />{/* English alias */}

      {/* Admin — auth required, sidebar layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrderListPage />} />
        <Route path="orders/new" element={<NewOrderPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="customers" element={<CustomerListPage />} />
        <Route path="fx" element={<FxRatePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-lg font-medium">404</p>
        <p className="text-sm text-fg-muted mt-1">Trang không tồn tại.</p>
        <a href="/" className="mt-3 inline-block text-sm text-accent hover:underline">
          Về dashboard
        </a>
      </div>
    </div>
  )
}
