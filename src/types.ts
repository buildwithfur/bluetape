/** Shared TS types not provided by Convex codegen. */
import type { Doc } from '@convex/_generated/dataModel'

export type Role = 'admin' | 'user'
export type PageType = 'item' | 'rule'
export type Frequency = 'daily' | 'weekly' | 'monthly'
export type WikiTargetType = PageType | 'recipe'

/** Render env passed to markdown-it for wiki-link resolution. */
export interface RenderEnv {
  targetMap?: Record<
    string,
    { id: string; type: WikiTargetType; slug?: string; title: string }
  > // lowercased title → stable page target
}

// Re-export commonly-used Convex document types for components.
export type Page = Doc<'pages'>
export type Routine = Doc<'routines'>
export type Task = Doc<'tasks'>
export type GroceryItem = Doc<'groceryItems'>
export type Recipe = Doc<'recipes'>
