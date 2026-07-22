import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { useCurrentProfile } from '@/data/hooks'

export type LocalizedField =
  | { entityType: 'task'; entityId: Id<'tasks'>; field: 'title' | 'note'; source: string }
  | { entityType: 'routine'; entityId: Id<'routines'>; field: 'title' | 'description'; source: string }
  | { entityType: 'page'; entityId: Id<'pages'>; field: 'title' | 'content' | 'location'; source: string }
  | { entityType: 'groceryItem'; entityId: Id<'groceryItems'>; field: 'name'; source: string }
  | { entityType: 'recipe'; entityId: Id<'recipes'>; field: 'title' | 'notes'; source: string }
  | { entityType: 'recipeIngredient'; entityId: Id<'recipeIngredients'>; field: 'text'; source: string }
  | { entityType: 'recipeStep'; entityId: Id<'recipeSteps'>; field: 'text'; source: string }

export type LocalizedTaskField = Extract<LocalizedField, { entityType: 'task' }>
type TranslationRef =
  | { entityType: 'task'; entityId: Id<'tasks'>; field: 'title' | 'note' }
  | { entityType: 'routine'; entityId: Id<'routines'>; field: 'title' | 'description' }
  | { entityType: 'page'; entityId: Id<'pages'>; field: 'title' | 'content' | 'location' }
  | { entityType: 'groceryItem'; entityId: Id<'groceryItems'>; field: 'name' }
  | { entityType: 'recipe'; entityId: Id<'recipes'>; field: 'title' | 'notes' }
  | { entityType: 'recipeIngredient'; entityId: Id<'recipeIngredients'>; field: 'text' }
  | { entityType: 'recipeStep'; entityId: Id<'recipeSteps'>; field: 'text' }

function fieldKey(field: Pick<LocalizedField, 'entityType' | 'entityId' | 'field'>) {
  return `${field.entityType}:${field.entityId}:${field.field}`
}

export function useLocalizedFields(fields: LocalizedField[]) {
  const profile = useCurrentProfile()
  const enabled = profile?.autoTranslateEnabled === true
  const stableKey = fields
    .map((item) => `${fieldKey(item)}:${item.source}`)
    .join('\u0000')
  const refs = useMemo(
    () => fields.map(({ entityType, entityId, field }) => ({ entityType, entityId, field })) as TranslationRef[],
    // Source participates in identity so an edit immediately refreshes display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey],
  )
  const response = useQuery(
    api.translations.getForFields,
    enabled && refs.length > 0 ? { fields: refs } : 'skip',
  )
  const ensure = useMutation(api.translations.ensureForFields)
  const hasMissingTranslation = response?.results.some(
    (result) => result.state === 'missing',
  )
  const nextRetryAfter = response?.results.reduce<number | undefined>(
    (earliest, result) => {
      if (result.state !== 'failed' || !result.retryAfter) return earliest
      return earliest === undefined ? result.retryAfter : Math.min(earliest, result.retryAfter)
    },
    undefined,
  )

  useEffect(() => {
    if (!enabled || refs.length === 0) return
    if (hasMissingTranslation) {
      void ensure({ fields: refs }).catch(() => undefined)
      return
    }
    if (!nextRetryAfter) return
    const timeout = window.setTimeout(() => {
      void ensure({ fields: refs }).catch(() => undefined)
    }, Math.max(0, nextRetryAfter - Date.now()) + 50)
    return () => window.clearTimeout(timeout)
  }, [enabled, ensure, hasMissingTranslation, nextRetryAfter, refs])

  const results = new Map(
    response?.results.map((result) => [fieldKey(result), result]),
  )

  return {
    enabled,
    /** The cache is still loading, but source text is shown immediately. */
    isLoading: enabled && refs.length > 0 && response === undefined,
    textFor(field: LocalizedField) {
      const result = results.get(fieldKey(field))
      return result?.state === 'ready' && result.translatedText
        ? result.translatedText
        : field.source
    },
    hasTranslation(field: Omit<LocalizedField, 'source'>) {
      return results.get(fieldKey(field))?.state === 'ready'
    },
  }
}

/** Observes existing work only; visible content is what creates jobs. */
export function useTranslationActivity() {
  const profile = useCurrentProfile()
  const enabled = profile?.autoTranslateEnabled === true
  return useQuery(api.translations.getActivity, enabled ? {} : 'skip')
}

/** Compatibility wrapper for the task screens shipped before recipes. */
export function useLocalizedTaskFields(fields: LocalizedTaskField[]) {
  const localized = useLocalizedFields(fields)
  return {
    enabled: localized.enabled,
    textFor(entityId: Id<'tasks'>, field: 'title' | 'note', source: string) {
      return localized.textFor({ entityType: 'task', entityId, field, source })
    },
    hasTranslation(entityId: Id<'tasks'>, field: 'title' | 'note') {
      return localized.hasTranslation({ entityType: 'task', entityId, field })
    },
  }
}
