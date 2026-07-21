import type { Doc } from '@convex/_generated/dataModel'

export type RecordKind = 'item' | 'rule' | 'task' | 'routine' | 'shopping' | 'recipe'

export function recordPath(kind: RecordKind, id: string): string {
  switch (kind) {
    case 'item':
      return `/notes/${id}`
    case 'rule':
      return `/rules/${id}`
    case 'task':
      return `/tasks/${id}`
    case 'routine':
      return `/routines/${id}`
    case 'shopping':
      return `/shopping/${id}`
    case 'recipe':
      return `/recipes/${id}`
  }
}

export function pagePath(page: Pick<Doc<'pages'>, '_id' | 'type'>): string {
  return recordPath(page.type, page._id)
}
