import { useConvexAuth } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { api } from '../convex/_generated/api'
import { AppShell } from '@/components/AppShell'
import { SearchProvider, CreatePageProvider } from '@/components/SearchContext'
import { SearchPalette } from '@/routes/search'
import Login from '@/routes/login'
import { ProfileBootstrap } from '@/routes/profile-bootstrap'
import { FamilySetup } from '@/routes/family-setup'
import { InviteAccept } from '@/routes/invite'
import Tasks from '@/routes/tasks'
import RoutinesIndex from '@/routes/routines/index'
import RoutineEdit from '@/routes/routines/edit'
import RoutineView from '@/routes/routines/view'
import TaskView from '@/routes/task-view'
import Shopping from '@/routes/shopping'
import ShoppingItemView from '@/routes/shopping-view'
import More from '@/routes/more'
import Family from '@/routes/family'
import Rules from '@/routes/rules'
import Items from '@/routes/items'
import PageView from '@/routes/pages/view'
import PageEdit from '@/routes/pages/edit'
import { useTranslation } from 'react-i18next'
import Settings from '@/routes/settings'
import RecipesIndex from '@/routes/recipes/index'
import RecipeImport from '@/routes/recipes/import'
import RecipeView from '@/routes/recipes/view'
import RecipeEdit from '@/routes/recipes/edit'
import i18n, { isSupportedLocale } from '@/i18n'

function Splash() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 select-none">
        <img
          src="/bluetape-mark.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-32 object-contain"
        />
        <span className="mono-md text-text-tertiary">{t('app.name')}</span>
      </div>
    </div>
  )
}

/** Wraps app routes in the shell, but only once a family is active. */
function AppShellGuard() {
  const families = useQuery(api.families.listMine, {})
  if (families === undefined) return <Splash />
  if (families.length === 0) return <FamilySetup />
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth()
  // Fetch profile only once authenticated, so getMe (which throws raw) never
  // fires without a token.
  const profile = useQuery(
    api.userProfiles.getMe,
    isAuthenticated ? {} : 'skip',
  )

  useEffect(() => {
    if (profile && isSupportedLocale(profile.locale) && i18n.resolvedLanguage !== profile.locale) {
      void i18n.changeLanguage(profile.locale)
    }
  }, [profile])

  if (authLoading) return <Splash />
  if (!isAuthenticated) return <Login />
  if (profile === undefined) return <Splash />
  if (profile === null) return <ProfileBootstrap />

  return (
    <SearchProvider>
      <CreatePageProvider>
        <Routes>
          {/* Family bootstrap + invite happen before the app shell. */}
          <Route path="/invite/:token" element={<InviteAccept />} />
          <Route path="/family/new" element={<FamilySetup />} />
          <Route element={<AppShellGuard />}>
            <Route path="/" element={<Tasks />} />
            <Route path="/routines" element={<RoutinesIndex />} />
            <Route path="/routines/:id" element={<RoutineView />} />
            <Route path="/routines/:id/edit" element={<RoutineEdit />} />
            <Route path="/tasks/:id" element={<TaskView />} />
            <Route path="/recipes" element={<RecipesIndex />} />
            <Route path="/recipes/import/:id" element={<RecipeImport />} />
            <Route path="/recipes/:id" element={<RecipeView />} />
            <Route path="/recipes/:id/edit" element={<RecipeEdit />} />
            <Route path="/shopping" element={<Shopping />} />
            <Route path="/shopping/:id" element={<ShoppingItemView />} />
            <Route path="/notes" element={<Items />} />
            <Route path="/more" element={<More />} />
            <Route path="/more/rules" element={<Rules />} />
            <Route path="/more/notes" element={<Navigate to="/notes" replace />} />
            <Route path="/more/items" element={<Navigate to="/notes" replace />} />
            <Route path="/family" element={<Family />} />
            <Route path="/language" element={<Settings />} />
            <Route path="/settings" element={<Navigate to="/language" replace />} />
            <Route path="/p/:slug" element={<PageView />} />
            <Route path="/notes/:id" element={<PageView recordType="item" />} />
            <Route path="/items/:id" element={<PageView recordType="item" />} />
            <Route path="/rules/:id" element={<PageView recordType="rule" />} />
            <Route path="/p/new" element={<PageEdit />} />
            <Route path="/p/:slug/edit" element={<PageEdit />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SearchPalette />
      </CreatePageProvider>
    </SearchProvider>
  )
}
