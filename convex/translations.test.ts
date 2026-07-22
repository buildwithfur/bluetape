/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { sha256Hex } from './lib/sha256'

const modules = import.meta.glob('./**/*.ts')

async function setupProfile(options?: { enabled?: boolean; locale?: string; sourceLocale?: string }) {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Helper' })
    const familyId = await ctx.db.insert('families', {
      name: 'Home',
      ownerUserId: userId,
      inviteToken: 'test-token',
      createdAt: 1,
    })
    await ctx.db.insert('familyMembers', {
      familyId,
      userId,
      role: 'user',
      displayName: 'Helper',
      joinedAt: 1,
    })
    await ctx.db.insert('userProfiles', {
      userId,
      displayName: 'Helper',
      locale: options?.locale ?? 'my',
      timezone: 'Asia/Singapore',
      currentFamilyId: familyId,
      autoTranslateEnabled: options?.enabled ?? false,
    })
    const taskId = await ctx.db.insert('tasks', {
      familyId,
      title: 'you dont anyhow throw things around',
      titleLocale: options?.sourceLocale,
      status: 'pending',
      createdBy: userId,
      createdAt: 1,
    })
    return { userId, familyId, taskId }
  })
  return { t, ...ids }
}

function asUser<T extends ReturnType<typeof convexTest>>(
  t: T,
  userId: Id<'users'>,
) {
  return t.withIdentity({ subject: userId })
}

describe('translation feature gate', () => {
  it('does not expose or generate cached translations while disabled', async () => {
    const { t, userId, familyId, taskId } = await setupProfile()
    const sourceHash = await sha256Hex('you dont anyhow throw things around')
    await t.run(async (ctx) => {
      await ctx.db.insert('contentTranslations', {
        familyId,
        entityType: 'task',
        entityId: taskId,
        field: 'title',
        targetLocale: 'my',
        sourceHash,
        generation: 1,
        status: 'ready',
        detectedSourceLocale: 'en-SG',
        normalizedSource: 'Do not throw things around carelessly.',
        translatedText: 'ဘာသာပြန်ချက်',
        provider: 'test',
        model: 'test',
        updatedAt: 1,
      })
    })

    const user = asUser(t, userId)
    await expect(user.query(api.translations.getForFields, {
      fields: [{ entityType: 'task', entityId: taskId, field: 'title' }],
    })).resolves.toEqual({ enabled: false, results: [] })
    await user.mutation(api.translations.ensureForFields, {
      fields: [{ entityType: 'task', entityId: taskId, field: 'title' }],
    })

    const rows = await t.run((ctx) => ctx.db.query('contentTranslations').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('ready')
  })

  it('rejects a profile locale outside the server allowlist', async () => {
    const { t, userId, taskId } = await setupProfile({ enabled: true, locale: 'tl' })
    const user = asUser(t, userId)

    await expect(user.query(api.translations.getForFields, {
      fields: [{ entityType: 'task', entityId: taskId, field: 'title' }],
    })).rejects.toThrow('Unsupported profile locale')
  })

  it('claims one missing field for an enabled profile', async () => {
    const { t, userId, taskId } = await setupProfile({ enabled: true })
    const user = asUser(t, userId)

    await user.mutation(api.translations.ensureForFields, {
      fields: [{ entityType: 'task', entityId: taskId, field: 'title' }],
    })

    const rows = await t.run((ctx) => ctx.db.query('contentTranslations').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pending')
    expect(rows[0]?.generation).toBe(1)
  })

  it('does not create a job when the source and viewer locales match', async () => {
    const { t, userId, taskId } = await setupProfile({
      enabled: true,
      locale: 'en',
      sourceLocale: 'en-SG',
    })
    const user = asUser(t, userId)
    const fields = [{ entityType: 'task' as const, entityId: taskId, field: 'title' as const }]

    await expect(user.query(api.translations.getForFields, { fields })).resolves.toEqual({
      enabled: true,
      results: [{ ...fields[0], state: 'source_is_target' }],
    })
    await user.mutation(api.translations.ensureForFields, { fields })
    await expect(user.query(api.translations.getActivity, {})).resolves.toEqual({
      enabled: true,
      pending: false,
    })
    expect(await t.run((ctx) => ctx.db.query('contentTranslations').collect())).toHaveLength(0)
  })

  it('creates a job when the source and viewer locales differ', async () => {
    const { t, userId, taskId } = await setupProfile({
      enabled: true,
      locale: 'en',
      sourceLocale: 'my-MM',
    })
    const user = asUser(t, userId)
    const fields = [{ entityType: 'task' as const, entityId: taskId, field: 'title' as const }]

    await user.mutation(api.translations.ensureForFields, { fields })

    const rows = await t.run((ctx) => ctx.db.query('contentTranslations').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ targetLocale: 'en', status: 'pending' })
    await expect(user.query(api.translations.getActivity, {})).resolves.toEqual({
      enabled: true,
      pending: true,
    })
  })

  it('does not report an expired pending lease as active translation work', async () => {
    const { t, userId, familyId, taskId } = await setupProfile({ enabled: true })
    const sourceHash = await sha256Hex('you dont anyhow throw things around')
    await t.run((ctx) => ctx.db.insert('contentTranslations', {
      familyId,
      entityType: 'task',
      entityId: taskId,
      field: 'title',
      targetLocale: 'my',
      sourceHash,
      generation: 1,
      status: 'pending',
      leaseExpiresAt: Date.now() - 1,
      updatedAt: 1,
    }))

    await expect(asUser(t, userId).query(api.translations.getActivity, {})).resolves.toEqual({
      enabled: true,
      pending: false,
    })
  })

  it('retries a first-attempt provider truncation through smaller batches', async () => {
    const { t, userId, familyId, taskId } = await setupProfile({ enabled: true })
    const sourceHash = await sha256Hex('you dont anyhow throw things around')
    await t.run(async (ctx) => {
      await ctx.db.insert('contentTranslations', {
        familyId,
        entityType: 'task',
        entityId: taskId,
        field: 'title',
        targetLocale: 'my',
        sourceHash,
        generation: 1,
        status: 'failed',
        errorCode: 'provider_incomplete_response',
        retryAfter: Date.now() + 5 * 60 * 1000,
        updatedAt: 1,
      })
    })

    const user = asUser(t, userId)
    await expect(user.query(api.translations.getForFields, {
      fields: [{ entityType: 'task', entityId: taskId, field: 'title' }],
    })).resolves.toMatchObject({
      results: [{ state: 'missing' }],
    })
    await user.mutation(api.translations.ensureForFields, {
      fields: [{ entityType: 'task', entityId: taskId, field: 'title' }],
    })

    const rows = await t.run((ctx) => ctx.db.query('contentTranslations').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'pending', generation: 2 })
  })

  it('claims visible routines, pages, shopping rows, and recipe text through the same cache', async () => {
    const { t, userId, familyId } = await setupProfile({ enabled: true })
    const ids = await t.run(async (ctx) => {
      const routineId = await ctx.db.insert('routines', {
        familyId,
        title: 'Wipe the kitchen counter',
        description: 'Use the blue cloth only.',
        frequency: 'daily',
        sortOrder: 0,
        isActive: true,
        createdBy: userId,
      })
      const pageId = await ctx.db.insert('pages', {
        familyId,
        title: 'Kitchen rules',
        slug: 'kitchen-rules',
        type: 'rule',
        content: '# Kitchen\n\nDo not use the toilet cloth here.',
        createdBy: userId,
        updatedBy: userId,
        updatedAt: 1,
      })
      const groceryItemId = await ctx.db.insert('groceryItems', {
        familyId,
        name: 'Dishwashing liquid',
        status: 'pending',
        addedBy: userId,
        createdAt: 1,
      })
      const recipeId = await ctx.db.insert('recipes', {
        familyId,
        title: 'Egg fried rice',
        notes: 'Serve while hot.',
        status: 'published',
        sourceUrl: 'https://example.com/recipe',
        normalizedSourceUrl: 'https://example.com/recipe',
        sourceType: 'website',
        sourceDomain: 'example.com',
        searchText: 'egg fried rice',
        ingredientCount: 0,
        stepCount: 0,
        createdBy: userId,
        updatedBy: userId,
        createdAt: 1,
        updatedAt: 1,
      })
      return { routineId, pageId, groceryItemId, recipeId }
    })

    const user = asUser(t, userId)
    await user.mutation(api.translations.ensureForFields, {
      fields: [
        { entityType: 'routine', entityId: ids.routineId, field: 'description' },
        { entityType: 'page', entityId: ids.pageId, field: 'content' },
        { entityType: 'groceryItem', entityId: ids.groceryItemId, field: 'name' },
        { entityType: 'recipe', entityId: ids.recipeId, field: 'notes' },
      ],
    })

    await expect(user.query(api.translations.getActivity, {})).resolves.toEqual({
      enabled: true,
      pending: true,
    })
    const rows = await t.run((ctx) => ctx.db.query('contentTranslations').collect())
    expect(rows).toHaveLength(4)
  })

  it('rejects task references from another family', async () => {
    const { t, userId } = await setupProfile({ enabled: true })
    const foreignTaskId = await t.run(async (ctx) => {
      const foreignUserId = await ctx.db.insert('users', { name: 'Other' })
      const foreignFamilyId = await ctx.db.insert('families', {
        name: 'Other home',
        ownerUserId: foreignUserId,
        inviteToken: 'other-token',
        createdAt: 1,
      })
      return ctx.db.insert('tasks', {
        familyId: foreignFamilyId,
        title: 'Private task',
        status: 'pending',
        createdBy: foreignUserId,
        createdAt: 1,
      })
    })

    await expect(asUser(t, userId).query(api.translations.getForFields, {
      fields: [{ entityType: 'task', entityId: foreignTaskId, field: 'title' }],
    })).rejects.toThrow('Task not found in current family')
  })
})

describe('translation completion freshness', () => {
  it('does not let an old completion overwrite an edited source', async () => {
    const { t, familyId, taskId } = await setupProfile({ enabled: true })
    const sourceHash = await sha256Hex('you dont anyhow throw things around')
    const translationId = await t.run(async (ctx) => {
      return ctx.db.insert('contentTranslations', {
        familyId,
        entityType: 'task',
        entityId: taskId,
        field: 'title',
        targetLocale: 'my',
        sourceHash,
        generation: 1,
        status: 'pending',
        leaseExpiresAt: Date.now() + 60_000,
        updatedAt: 1,
      })
    })
    await t.run((ctx) => ctx.db.patch(taskId, { title: 'Edited instruction' }))

    await t.mutation(internal.translations.completeClaims, {
      completions: [{
        claim: { translationId, sourceHash, generation: 1 },
        status: 'ready',
        detectedSourceLocale: 'en-SG',
        normalizedSource: 'Normalized.',
        translatedText: 'Translated.',
        provider: 'test',
        model: 'test',
      }],
    })

    const row = await t.run((ctx) => ctx.db.get(translationId))
    expect(row?.status).toBe('pending')
  })
})
