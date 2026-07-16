import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ListChecks,
  CalendarDots,
  ShoppingCart,
  DotsThreeOutline,
  MagnifyingGlass,
  ArrowLeft,
  Scroll,
  Package,
  UsersThree,
  GearSix,
  SignOut,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { appVersion } from '@/lib/app-version'
import { useOptionalSearchPalette } from './SearchContext'
import { todayLabel } from '@/lib/date'
import { useCurrentRole, useNavigationWarmup } from '@/data/hooks'
import { useAuthActions } from '@convex-dev/auth/react'

/** Per PLAN.md §6.9: 4-tab bottom bar on mobile (Today · Routines · Shopping · More),
 * left rail on desktop (≥768px). Search opens as a modal from the top bar — no tab. */
const TABS = [
  { to: '/', icon: ListChecks, key: 'nav.today', exact: true },
  { to: '/routines', icon: CalendarDots, key: 'nav.routines', exact: false },
  { to: '/shopping', icon: ShoppingCart, key: 'nav.shopping', exact: false },
  { to: '/more', icon: DotsThreeOutline, key: 'nav.more', exact: false },
] as const

const DESKTOP_TABS = [
  { to: '/', icon: ListChecks, key: 'nav.today', exact: true },
  { to: '/routines', icon: CalendarDots, key: 'nav.routines', exact: false },
  { to: '/shopping', icon: ShoppingCart, key: 'nav.shopping', exact: false },
  { to: '/more/rules', icon: Scroll, key: 'more.rules', exact: false },
  { to: '/more/items', icon: Package, key: 'more.items', exact: false },
  { to: '/settings', icon: GearSix, key: 'settings.title', exact: false },
] as const

const FAMILY_TAB = {
  to: '/family',
  icon: UsersThree,
  key: 'family.title',
  exact: false,
} as const

function isActive(pathname: string, to: string, exact?: boolean) {
  return exact ? pathname === to : pathname === to || pathname.startsWith(to + '/')
}

export function TabBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return (
    <nav
      aria-label={t('nav.primary')}
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border-subtle"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4 h-14">
        {TABS.map(({ to, icon: Icon, key, exact }) => {
          const active = isActive(pathname, to, exact)
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  'h-full flex flex-col items-center justify-center gap-1',
                  'transition-transform duration-150 motion-reduce:transition-none active:scale-95',
                )}
              >
                <Icon
                  size={22}
                  weight={active ? 'fill' : 'regular'}
                  className={active ? 'text-accent' : 'text-text-tertiary'}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'label-caps',
                    active ? 'text-accent' : 'text-text-tertiary',
                  )}
                >
                  {t(key)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function SideRail() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuthActions()
  const role = useCurrentRole()
  const tabs = role === 'admin' || role === 'owner'
    ? [...DESKTOP_TABS.slice(0, -1), FAMILY_TAB, DESKTOP_TABS.at(-1)!]
    : DESKTOP_TABS
  return (
    <nav
      aria-label={t('nav.primary')}
      className="hidden md:flex md:flex-col md:w-56 md:shrink-0 md:border-r md:border-border-subtle md:h-screen md:sticky md:top-0"
    >
      <div className="page-px py-6">
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/bluetape-mark.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="size-10 shrink-0 object-contain"
          />
          <span className="text-xl font-semibold text-ink tracking-tight">{t('app.name')}</span>
        </Link>
      </div>
      <ul className="px-3 flex flex-col gap-1">
        {tabs.map(({ to, icon: Icon, key, exact }) => {
          const active = isActive(pathname, to, exact)
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  'flex items-center gap-3 h-11 px-3 rounded-xs text-sm',
                  'transition-colors duration-150',
                  active
                    ? 'bg-accent-bg text-accent font-medium'
                    : 'text-text-secondary hover:bg-surface-hover',
                )}
              >
                <Icon
                  size={20}
                  weight={active ? 'fill' : 'regular'}
                  className={active ? 'text-accent' : 'text-text-tertiary'}
                  aria-hidden="true"
                />
                {t(key)}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto px-3 pb-4">
        <p className="px-3 pb-2 mono-sm text-text-tertiary">
          {t('more.version', { version: appVersion })}
        </p>
        <button
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/login')
          }}
          className="flex w-full items-center gap-3 h-11 px-3 rounded-xs text-sm text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <SignOut size={20} className="text-text-tertiary" aria-hidden="true" />
          {t('action.signOut')}
        </button>
      </div>
    </nav>
  )
}

export function TopBar({
  title,
  back = false,
  backOnDesktop = true,
  showSearch = true,
  right,
  dateLabel,
}: {
  title?: ReactNode
  back?: boolean
  /** Desktop rail destinations already have direct navigation. */
  backOnDesktop?: boolean
  showSearch?: boolean
  right?: ReactNode
  dateLabel?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useOptionalSearchPalette()
  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-30 border-b border-border-subtle md:sticky md:inset-x-auto"
        style={{
          background: 'rgba(245,242,235,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="h-14 flex items-center gap-2 page-px">
        {back ? (
          <>
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label={t('action.back')}
              className={cn(
                'h-11 w-11 -ml-2 inline-flex items-center justify-center rounded-xs text-ink-700 hover:bg-surface-active active:scale-95 transition',
                !backOnDesktop && 'md:hidden',
              )}
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
            {!backOnDesktop && <span className="hidden md:block w-2" aria-hidden="true" />}
          </>
        ) : (
          <span className="w-2" aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0">
          {dateLabel ? (
            <span className="mono-md text-text-secondary block truncate">
              {todayLabel()}
            </span>
          ) : (
            title && (
              <h1 className="text-[18px] font-semibold text-ink truncate leading-tight">
                {title}
              </h1>
            )
          )}
        </div>

        {right}

        {showSearch && search && (
          <button
            type="button"
            onClick={search.toggle}
            aria-label={t('action.search')}
            className="h-11 w-11 -mr-2 inline-flex items-center justify-center rounded-xs text-ink-700 hover:bg-surface-active active:scale-95 transition"
          >
            <MagnifyingGlass size={22} aria-hidden="true" />
          </button>
        )}
        </div>
      </header>
      {/* Fixed mobile chrome needs its own layout space so page content starts below it. */}
      <div
        className="md:hidden"
        aria-hidden="true"
        style={{ height: 'calc(3.5rem + env(safe-area-inset-top))' }}
      />
    </>
  )
}

export function AppShell({
  showChrome = true,
  children,
}: {
  showChrome?: boolean
  children: ReactNode
}) {
  const role = useCurrentRole()
  useNavigationWarmup()

  // On mobile (<md), this is a full-width phone-app column + bottom tab bar.
  // Desktop is a proper work area: a left rail and a wider, left-aligned
  // content column. It intentionally does not mimic a phone in a frame.
  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-[14rem_minmax(0,1fr)]" data-role={role}>
      {showChrome && <SideRail />}
      <div className="flex flex-col w-full md:w-[min(calc(100%-6rem),60rem)] md:justify-self-start md:ml-12 md:py-6 md:min-h-screen">
        <main
          className={cn(
            'flex-1 min-w-0 w-full',
            showChrome && 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0',
          )}
        >
          {children}
        </main>
      </div>
      {showChrome && <TabBar />}
    </div>
  )
}
