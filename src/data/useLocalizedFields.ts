import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { useCurrentProfile } from '@/data/hooks'

export type LocalizedTaskField = {
  entityType: 'task'
  entityId: Id<'tasks'>
  field: 'title' | 'note'
  source: string
}

function fieldKey(entityId: Id<'tasks'>, field: 'title' | 'note') {
  return `${entityId}:${field}`
}

export function useLocalizedTaskFields(fields: LocalizedTaskField[]) {
  const profile = useCurrentProfile()
  const enabled = profile?.autoTranslateEnabled === true
  const stableKey = fields
    .map((item) => `${fieldKey(item.entityId, item.field)}:${item.source}`)
    .join('\u0000')
  const refs = useMemo(
    () => fields.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      field: item.field,
    })),
    // The serialized key deliberately includes source text so display values
    // refresh immediately after an edit, before the backend cache catches up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey],
  )
  const response = useQuery(
    api.translations.getForFields,
    enabled && refs.length > 0 ? { fields: refs } : 'skip',
  )
  const ensure = useMutation(api.translations.ensureForFields)

  const needsTranslation = response?.results.some(
    (result) => result.state === 'missing' || result.state === 'failed',
  )
  useEffect(() => {
    if (!enabled || refs.length === 0 || !needsTranslation) return
    void ensure({ fields: refs }).catch(() => undefined)
  }, [enabled, ensure, needsTranslation, refs])

  const results = new Map(
    response?.results.map((result) => [fieldKey(result.entityId, result.field), result]),
  )

  return {
    enabled,
    textFor(entityId: Id<'tasks'>, field: 'title' | 'note', source: string) {
      const result = results.get(fieldKey(entityId, field))
      return result?.state === 'ready' && result.translatedText
        ? result.translatedText
        : source
    },
    hasTranslation(entityId: Id<'tasks'>, field: 'title' | 'note') {
      return results.get(fieldKey(entityId, field))?.state === 'ready'
    },
  }
}
