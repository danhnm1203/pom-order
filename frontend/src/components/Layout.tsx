import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  /** Hide from mobile bottom tab bar (sidebar only) — used for less-frequent
   *  admin pages where a 6th tab would crowd the bar on small phones. */
  desktopOnly?: boolean
}

export function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const nav: NavItem[] = [
    { to: '/', label: t('nav.dashboard'), icon: '◐', end: true },
    { to: '/orders', label: t('nav.orders'), icon: '▤' },
    { to: '/orders/new', label: t('nav.new_order'), icon: '+' },
    { to: '/customers', label: t('nav.customers'), icon: '◯' },
    { to: '/products', label: t('nav.products'), icon: '◫', desktopOnly: true },
    { to: '/fx', label: t('nav.fx_rate'), icon: '₩' },
    { to: '/settings', label: t('nav.settings'), icon: '⚙', desktopOnly: true },
  ]
  const mobileNav = nav.filter((n) => !n.desktopOnly)

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Sidebar (desktop) */}
      <aside className="w-56 border-r border-border bg-surface flex-shrink-0 hidden md:flex md:flex-col">
        <div className="px-4 py-5 border-b border-border">
          <h1 className="text-lg font-semibold tracking-tight">{t('nav.app_name')}</h1>
          <p className="text-xs text-fg-subtle mt-1">{t('nav.app_tagline')}</p>
        </div>
        <nav className="flex-1 py-3" aria-label={t('nav.app_name')}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'block px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-surface-2 text-fg border-r-2 border-accent'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-4 space-y-3">
          <p className="text-xs text-fg-subtle truncate">{user?.email}</p>
          <LanguageSwitcher compact className="text-xs" />
          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
            className="text-sm text-fg-muted hover:text-fg transition-colors"
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden border-b border-border bg-surface px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-10">
        <h1 className="text-base font-semibold">{t('nav.app_name')}</h1>
        <div className="flex items-center gap-3">
          <LanguageSwitcher compact className="text-xs" />
          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
            className="text-sm text-fg-muted"
            aria-label={t('nav.logout')}
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      {/* Main content — bottom padding on mobile leaves room for tab bar */}
      <main className="flex-1 overflow-x-auto pt-14 pb-16 md:pt-0 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-10 bg-surface border-t border-border grid grid-cols-5"
        aria-label={t('nav.app_name')}
      >
        {mobileNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px]',
                isActive ? 'text-accent' : 'text-fg-muted hover:text-fg',
              )
            }
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {item.icon}
            </span>
            <span className="leading-tight text-center px-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
