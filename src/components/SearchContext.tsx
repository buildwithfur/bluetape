import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

interface SearchCtx {
  open: boolean
  query: string
  setOpen: (open: boolean) => void
  setQuery: (q: string) => void
  toggle: () => void
}

const Ctx = createContext<SearchCtx | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const toggle = useCallback(() => setOpen((o) => !o), [])
  return (
    <Ctx.Provider value={{ open, query, setOpen, setQuery, toggle }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSearchPalette() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSearchPalette must be used inside <SearchProvider>')
  return ctx
}

export function useOptionalSearchPalette() {
  return useContext(Ctx)
}

/** Manages the "create page" deep-link intent used by broken wiki links +
 * the search "create new item" result. */
interface CreatePageCtx {
  pendingTitle: string | null
  createItem: (title: string) => void
  consume: () => string | null
}
const CreateCtx = createContext<CreatePageCtx | null>(null)

export function CreatePageProvider({ children }: { children: ReactNode }) {
  const [pendingTitle, setPending] = useState<string | null>(null)
  const createItem = useCallback((title: string) => setPending(title), [])
  const consume = useCallback(() => {
    const t = pendingTitle
    setPending(null)
    return t
  }, [pendingTitle])
  return (
    <CreateCtx.Provider value={{ pendingTitle, createItem, consume }}>
      {children}
    </CreateCtx.Provider>
  )
}

export function useCreatePage() {
  const ctx = useContext(CreateCtx)
  if (!ctx) throw new Error('useCreatePage must be used inside <CreatePageProvider>')
  return ctx
}
