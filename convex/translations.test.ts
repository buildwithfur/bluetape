/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { sha256Hex } from './lib/sha256'

const modules = import.meta.glob('./**/*.ts')

async function setupProfile(options?: { enabled?: boolean; locale?: string }) {
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
      role: 'helper',
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
