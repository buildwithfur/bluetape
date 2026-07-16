/** React data hooks — wired to the family-scoped Convex backend.

 The family layer (PLAN.md family-ADR): every content query/mutation is
 scoped to a `familyId`. The active family comes from the user's profile
 (`userProfiles.currentFamilyId`); a user can own/join several families
 and switch between them. Role lives on `familyMembers`, never self-assigned.
*/
import { useQuery, useMutation } from 'convex/react'
import type { OptimisticLocalStore } from 'convex/browser'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { todayInSG } from '@/lib/date'
import { useCurrentSGDate } from '@/hooks/useCurrentSGDate'
import type { PageType, Frequency } from '@/types'

export type { Doc, Id }

// ─── Session / profile / family ────────────────────────────────────────
export function useCurrentProfile(): Doc<'userProfiles'> | null | undefined {
  return useQuery(api.userProfiles.getMe, {})
}

/** The user's families (owned + joined), with their per-family role. */
export function useMyFamilies() {
  return useQuery(api.families.listMine, {})
}

/** The active family doc, derived from profile.currentFamilyId. */
export function useCurrentFamily() {
  const profile = useCurrentProfile()
  return useQuery(
    api.families.get,
    profile?.currentFamilyId ? { familyId: profile.currentFamilyId } : 'skip',
  )
}
export function useCurrentFamilyId(): Id<'families'> | undefined {
  return useCurrentProfile()?.currentFamilyId ?? undefined
}
export function useCurrentRole(): 'admin' | 'helper' | 'owner' | undefined {
  const role = useCurrentFamily()?.role
  if (role === 'owner' || role === 'admin' || role === 'helper') return role
  return undefined
}

// ─── Family management ────────────────────────────────────────────────
export function useCreateFamily() {
  const create = useMutation(api.families.create)
  return (name: string) => create({ name })
}
export function useAcceptInvite() {
  const accept = useMutation(api.families.acceptInvite)
  return (token: string, displayName?: string) => accept({ token, displayName })
}
export function useSetCurrentFamily() {
  const set = useMutation(api.families.setCurrent)
  return (familyId: Id<'families'>) => set({ familyId })
}
export function useListMembers(familyId: Id<'families'> | undefined) {
  return useQuery(api.families.listMembers, familyId ? { familyId } : 'skip')
}
export function useSetMemberRole() {
  const set = useMutation(api.families.setMemberRole)
  return (
    familyId: Id<'families'>,
    userId: Id<'users'>,
    role: 'admin' | 'helper',
  ) => set({ familyId, userId, role })
}
export function useRemoveMember() {
  const remove = useMutation(api.families.removeMember)
  return (familyId: Id<'families'>, userId: Id<'users'>) => remove({ familyId, userId })
}
export function useLeaveFamily() {
  const leave = useMutation(api.families.leave)
  return (familyId: Id<'families'>) => leave({ familyId })
}
export function useRegenerateInviteToken() {
  const regen = useMutation(api.families.regenerateInviteToken)
  return (familyId: Id<'families'>) => regen({ familyId })
}
export function useRenameFamily() {
  const rename = useMutation(api.families.rename)
  return (familyId: Id<'families'>, name: string) => rename({ familyId, name })
}
export function useDeleteFamily() {
  const remove = useMutation(api.families.remove)
  return (familyId: Id<'families'>) => remove({ familyId })
}
export function useInviteFamily(token: string | undefined) {
  return useQuery(api.families.getByInviteToken, token ? { token } : 'skip')
}

// ─── API keys (per-family, owner-managed) ───────────────────────────────
export function useApiKeys(familyId: Id<'families'> | undefined) {
  return useQuery(api.apiKeys.list, familyId ? { familyId } : 'skip')
}
export function useCreateApiKey() {
  const create = useMutation(api.apiKeys.create)
  return (familyId: Id<'families'>, label?: string) => create({ familyId, label })
}
export function useRevokeApiKey() {
  const revoke = useMutation(api.apiKeys.revoke)
  return (keyId: Id<'apiKeys'>) => revoke({ keyId })
}

// ─── Today (family-scoped) ─────────────────────────────────────────────
export function useToday(date: string = todayInSG(), includeUndatedTasks = false) {
  const familyId = useCurrentFamilyId()
  const currentDate = useCurrentSGDate()
  return useQuery(
    api.today.list,
    familyId ? { familyId, date, currentDate, includeUndatedTasks } : 'skip',
  )
}

// ─── Routines ──────────────────────────────────────────────────────────
export function useRoutines() {
  const familyId = useCurrentFamilyId()
  const role = useCurrentRole()
  const admin = role === 'admin' || role === 'owner'
  return useQuery(
    admin ? api.routines.listAll : api.routines.list,
    familyId ? { familyId } : 'skip',
  )
}
export function useRoutine(routineId: string | undefined) {
  const routine = useQuery(api.routines.get, routineId ? { routineId } : 'skip')
  const routines = useRoutines()

  // The schedule is kept live by the app shell. Reuse it immediately when
  // opening an editor, while the narrower point query confirms fresh data.
  if (routine === undefined && routineId && routines !== undefined) {
    return routines.find((candidate) => candidate._id === routineId)
  }
  return routine
}
export function useUpcomingTasks(afterDate: string) {
  const familyId = useCurrentFamilyId()
  return useQuery(
    api.today.upcoming,
    familyId ? { familyId, afterDate } : 'skip',
  )
}

// ─── Pages ──────────────────────────────────────────────────────────────
export function usePages(type: PageType) {
  const familyId = useCurrentFamilyId()
  return useQuery(api.pages.listByType, familyId ? { familyId, type } : 'skip')
}
export function usePageBySlug(slug: string | undefined) {
  const familyId = useCurrentFamilyId()
  const page = useQuery(
    api.pages.getBySlug,
    familyId && slug ? { familyId, slug } : 'skip',
  )
  const pages = useAllPages()

  // Catalog and search data is already live in the app shell. It provides a
  // useful immediate view on navigation while the page-specific subscription
  // catches up, without weakening the server-side access check above.
  if (page === undefined && slug && pages !== undefined) {
    return pages.find((candidate) => candidate.slug === slug)
  }
  return page
}
export function usePageById(pageId: Id<'pages'> | undefined) {
  return useQuery(api.pages.getById, pageId ? { pageId } : 'skip')
}
export function usePageByRecordId(pageId: string | undefined) {
  return useQuery(api.pages.getById, pageId ? { pageId } : 'skip')
}
export function useWikiTargetMap() {
  const familyId = useCurrentFamilyId()
  return useQuery(
    api.pages.wikiTargetMap,
    familyId ? { familyId } : 'skip',
  )
}
export function useAllTitles() {
  const familyId = useCurrentFamilyId()
  return useQuery(api.pages.allTitles, familyId ? { familyId } : 'skip')
}
export function useAllPages(enabled = true) {
  const familyId = useCurrentFamilyId()
  return useQuery(api.pages.listAll, familyId && enabled ? { familyId } : 'skip')
}
// ─── Shopping ────────────────────────────────────────────────────────────
export function useShopping() {
  const familyId = useCurrentFamilyId()
  const currentDate = useCurrentSGDate()
  return useQuery(
    api.groceryItems.listPending,
    familyId ? { familyId, currentDate } : 'skip',
  )
}
export function useGroceryItem(itemId: string | undefined) {
  return useQuery(
    api.groceryItems.get,
    itemId ? { itemId } : 'skip',
  )
}

/**
 * Keep the small set of primary family views subscribed while the app shell is
 * mounted. Convex releases route-local subscriptions on unmount, so this
 * prevents a tab switch from briefly returning `undefined` and flashing a
 * loading state. All calls are deduplicated with the matching route hooks.
 */
export function useNavigationWarmup() {
  const today = todayInSG()

  useToday(today, true)
  useRoutines()
  useShopping()
}

// ─── File storage ───────────────────────────────────────────────────────
export function useStorageUrl(storageId: Id<'_storage'> | undefined) {
  return useQuery(api.files.getUrl, storageId ? { storageId } : 'skip')
}
export function useGenerateUploadUrl() {
  return useMutation(api.files.generateUploadUrl)
}

// ─── Mutations ──────────────────────────────────────────────────────────
export function useToggleRoutineCompletion() {
  const toggle = useMutation(api.routineCompletions.toggle).withOptimisticUpdate(
    (localStore, { routineId, date }) => {
      for (const { args, value } of localStore.getAllQueries(api.today.list)) {
        if (!value || args.date !== date) continue
        if (!value.routines.some((routine) => routine._id === routineId)) continue
        localStore.setQuery(api.today.list, args, {
          ...value,
          routines: value.routines.map((routine) =>
            routine._id === routineId
              ? { ...routine, isDone: !routine.isDone }
              : routine,
          ),
        })
      }
      for (const { args, value } of localStore.getAllQueries(api.routineCompletions.isDone)) {
        if (args.routineId !== routineId || args.date !== date || value === undefined) continue
        localStore.setQuery(api.routineCompletions.isDone, args, !value)
      }
    },
  )
  return (routineId: Id<'routines'>, date: string) => toggle({ routineId, date })
}
export function useRoutineDone(routineId: Id<'routines'> | undefined, date: string) {
  return useQuery(
    api.routineCompletions.isDone,
    routineId ? { routineId, date } : 'skip',
  )
}
export function useAddTask() {
  const familyId = useCurrentFamilyId()
  const add = useMutation(api.tasks.add)
  return (title: string, dueDate?: string) => {
    if (!familyId) throw new Error('No active family')
    return add({ familyId, title, dueDate })
  }
}
export function useTask(taskId: string | undefined) {
  return useQuery(api.tasks.get, taskId ? { taskId } : 'skip')
}
export function useToggleTaskDone() {
  const toggle = useMutation(api.tasks.toggleDone).withOptimisticUpdate(
    (localStore, { taskId }) => {
      for (const { args, value } of localStore.getAllQueries(api.today.list)) {
        if (!value) continue
        const currentTask = value.tasks.find((task) => task._id === taskId)
        if (!currentTask) continue
        const status: 'pending' | 'done' =
          currentTask.status === 'done' ? 'pending' : 'done'
        localStore.setQuery(api.today.list, args, {
          ...value,
          tasks: value.tasks.map((task) =>
            task._id === taskId
              ? {
                  ...task,
                  status,
                  completedAt: status === 'done' ? Date.now() : undefined,
                }
              : task,
          ),
        })
      }

      for (const { args, value } of localStore.getAllQueries(api.tasks.get)) {
        if (!value || value._id !== taskId) continue
        const status: 'pending' | 'done' =
          value.status === 'done' ? 'pending' : 'done'
        localStore.setQuery(api.tasks.get, args, {
          ...value,
          status,
          completedAt: status === 'done' ? Date.now() : undefined,
        })
      }
    },
  )
  return (taskId: Id<'tasks'>) => toggle({ taskId })
}
export function useDeleteTask() {
  const remove = useMutation(api.tasks.remove)
  return (taskId: Id<'tasks'>) => remove({ taskId })
}
export function useUpdateTaskDetails() {
  const update = useMutation(api.tasks.updateDetails).withOptimisticUpdate(
    (localStore, { taskId, title, note }) => {
      for (const { args, value } of localStore.getAllQueries(api.tasks.get)) {
        if (!value || value._id !== taskId) continue
        localStore.setQuery(api.tasks.get, args, {
          ...value,
          ...(title !== undefined ? { title } : {}),
          ...(note !== undefined ? { note } : {}),
        })
      }
      if (title !== undefined) {
        for (const { args, value } of localStore.getAllQueries(api.today.list)) {
          if (!value || !value.tasks.some((task) => task._id === taskId)) continue
          localStore.setQuery(api.today.list, args, {
            ...value,
            tasks: value.tasks.map((task) =>
              task._id === taskId ? { ...task, title } : task,
            ),
          })
        }
      }
    },
  )
  return (
    taskId: Id<'tasks'>,
    patch: { title?: string; note?: string },
  ) => update({ taskId, ...patch })
}
export function useAddGrocery() {
  const familyId = useCurrentFamilyId()
  const add = useMutation(api.groceryItems.add)
  return (name: string) => {
    if (!familyId) throw new Error('No active family')
    return add({ familyId, name, count: 1 })
  }
}
export function useAdjustGroceryCount() {
  const adjust = useMutation(api.groceryItems.adjustCount)
  return (itemId: Id<'groceryItems'>, delta: -1 | 1) => adjust({ itemId, delta })
}

function optimisticallySetGroceryStatus(
  localStore: OptimisticLocalStore,
  itemId: Id<'groceryItems'>,
  status: 'pending' | 'bought',
) {
  const boughtAt = status === 'bought' ? Date.now() : undefined
  for (const { args, value } of localStore.getAllQueries(api.groceryItems.listPending)) {
    if (!value || !value.some((item) => item._id === itemId)) continue
    localStore.setQuery(
      api.groceryItems.listPending,
      args,
      value.map((item) =>
        item._id === itemId
          ? {
              ...item,
              status,
              boughtAt,
              boughtBy: status === 'pending' ? undefined : item.boughtBy,
            }
          : item,
      ),
    )
  }

  for (const { args, value } of localStore.getAllQueries(api.groceryItems.get)) {
    if (!value || value._id !== itemId) continue
    localStore.setQuery(api.groceryItems.get, args, {
      ...value,
      status,
      boughtAt,
      boughtBy: status === 'pending' ? undefined : value.boughtBy,
    })
  }
}

export function useMarkGroceryBought() {
  const mark = useMutation(api.groceryItems.markBought).withOptimisticUpdate(
    (localStore, { itemId }) => {
      optimisticallySetGroceryStatus(localStore, itemId, 'bought')
    },
  )
  return (itemId: Id<'groceryItems'>) => mark({ itemId })
}
export function useUnmarkGroceryBought() {
  const unmark = useMutation(api.groceryItems.unmarkBought).withOptimisticUpdate(
    (localStore, { itemId }) => {
      optimisticallySetGroceryStatus(localStore, itemId, 'pending')
    },
  )
  return (itemId: Id<'groceryItems'>) => unmark({ itemId })
}
export function useDeleteGroceryItem() {
  const remove = useMutation(api.groceryItems.remove)
  return (itemId: Id<'groceryItems'>) => remove({ itemId })
}
export function useSavePage() {
  const familyId = useCurrentFamilyId()
  const save = useMutation(api.pages.save)
  return (input: {
    pageId?: Id<'pages'>
    title: string
    type: 'item' | 'rule'
    content: string
    localName?: string
    localContent?: string
    location?: string
    photoId?: Id<'_storage'>
    pinnedToToday?: boolean
  }) => {
    if (!familyId) throw new Error('No active family')
    return save({ familyId, ...input })
  }
}
export function useDeleteRule() {
  const remove = useMutation(api.pages.remove)
  return (pageId: Id<'pages'>) => remove({ pageId })
}
export function useSaveRoutine() {
  const familyId = useCurrentFamilyId()
  const create = useMutation(api.routines.create)
  const update = useMutation(api.routines.update)
  return (input: {
    routineId?: Id<'routines'>
    title: string
    description?: string
    frequency: Frequency
    dayOfWeek?: number
    dayOfMonth?: number
    pageId?: Id<'pages'>
    isActive?: boolean
  }) => {
    if (!familyId) throw new Error('No active family')
    if (input.routineId) {
      const { routineId, ...rest } = input
      return update({ routineId, ...rest })
    }
    return create({ familyId, ...input })
  }
}
export function useSetRoutineActive() {
  const update = useMutation(api.routines.update)
  return (routineId: Id<'routines'>, isActive: boolean) =>
    update({ routineId, isActive })
}
export function useUpdateRoutineDetails() {
  const update = useMutation(api.routines.update)
  return (
    routineId: Id<'routines'>,
    patch: { title?: string; description?: string },
  ) => update({ routineId, ...patch })
}
export function useCreateProfile() {
  return useMutation(api.userProfiles.create)
}
export function useEnsureProfile() {
  return useMutation(api.userProfiles.ensure)
}
export function useUpdateProfile() {
  return useMutation(api.userProfiles.update)
}

// ─── Search (client-side over family pages + tasks) ────────────────────
export function useSearch(query: string, enabled = true) {
  const pages = useAllPages(enabled)
  const familyId = useCurrentFamilyId()
  const tasks = useQuery(
    api.tasks.list,
    familyId && enabled ? { familyId, status: 'pending' } : 'skip',
  )
  const q = query.trim().toLowerCase()
  if (!q || !pages || !tasks) return { items: [], rules: [], tasks: [] }
  const matches = (s?: string) => !!s && s.toLowerCase().includes(q)
  return {
    items: pages.filter((p) => p.type === 'item' && (matches(p.title) || matches(p.content) || matches(p.location) || matches(p.localName))),
    rules: pages.filter((p) => p.type === 'rule' && (matches(p.title) || matches(p.content))),
    tasks: tasks.filter((t) => matches(t.title)),
  }
}
