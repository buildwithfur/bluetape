import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { useCurrentProfile } from '@/data/hooks'

export type LocalizedField =
  | { entityType: 'task'; entityId: Id<'tasks'>; field: 'title' | 'note'; source: string }
  | { entityType: 'recipe'; entityId: Id<'recipes'>; field: 'title'; source: string }
  | { entityType: 'recipeIngredient'; entityId: Id<'recipeIngredients'>; field: 'text'; source: string }
  | { entityType: 'recipeStep'; entityId: Id<'recipeSteps'>; field: 'text'; source: string }

export type LocalizedTaskField = Extract<LocalizedField, { entityType: 'task' }>
type TranslationRef =
  | { entityType: 'task'; entityId: Id<'tasks'>; field: 'title' | 'note' }
  | { entityType: 'recipe'; entityId: Id<'recipes'>; field: 'title' }
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
  const needsTranslation = response?.results.some(
    (result) => result.state === 'missing' || result.state === 'failed',
  )

  useEffect(() => {
    if (!enabled || refs.length === 0 || !needsTranslation) return
    void ensure({ fields: refs }).catch(() => undefined)
  }, [enabled, ensure, needsTranslation, refs])

  const results = new Map(
    response?.results.map((result) => [fieldKey(result), result]),
  )

  return {
    enabled,
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
