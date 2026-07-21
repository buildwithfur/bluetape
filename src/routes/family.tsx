import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Copy,
  Check,
  ArrowsClockwise,
  Plus,
  SignOut,
  Trash,
  CaretDown,
} from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { BottomSheet } from '@/components/BottomSheet'
import { formatInSG } from '@/lib/date'
import {
  useCurrentFamily,
  useMyFamilies,
  useListMembers,
  useSetMemberRole,
  useRemoveMember,
  useLeaveFamily,
  useRegenerateInviteToken,
  useRenameFamily,
  useDeleteFamily,
  useSetCurrentFamily,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from '@/data/hooks'
import type { Id } from '@convex/_generated/dataModel'

export default function Family() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const family = useCurrentFamily()
  const isOwner = family?.role === 'owner'
  const mine = useMyFamilies()
  const members = useListMembers(family?._id)
  const setRole = useSetMemberRole()
  const removeMember = useRemoveMember()
  const leaveFamily = useLeaveFamily()
  const regenerate = useRegenerateInviteToken()
  const renameFamily = useRenameFamily()
  const deleteFamily = useDeleteFamily()
  const setCurrent = useSetCurrentFamily()
  const apiKeys = useApiKeys(isOwner ? family?._id : undefined)
  const createApiKey = useCreateApiKey()
  const revokeApiKey = useRevokeApiKey()

  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingFamily, setDeletingFamily] = useState(false)
  const [deleteFamilyError, setDeleteFamilyError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [revealedLabel, setRevealedLabel] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const familyNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingName) setName(family?.name ?? '')
  }, [family?.name, editingName])

  useEffect(() => {
    if (editingName) familyNameRef.current?.select()
  }, [editingName])

  if (!family || !members || !mine || (isOwner && !apiKeys)) {
    return (
      <>
        <TopBar title={t('family.title')} back backOnDesktop={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  const inviteUrl = `${window.location.origin}/invite/${family.inviteToken}`
  const currentFamily = family

  async function saveFamilyName() {
    const nextName = name.trim()
    if (!nextName) {
      setNameError(t('family.nameRequired'))
      familyNameRef.current?.focus()
      return
    }
    if (nextName !== currentFamily.name) {
      try {
        await renameFamily(currentFamily._id, nextName)
      } catch (e) {
        setNameError(e instanceof Error ? e.message : String(e))
        return
      }
    }
    setNameError(null)
    setEditingName(false)
  }

  function copyInvite() {
    void navigator.clipboard?.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <TopBar title={t('family.title')} back backOnDesktop={false} />

      <section className="page-px pt-4 pb-2">
        {editingName ? (
          <input
            ref={familyNameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveFamilyName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveFamilyName()
              }
              if (event.key === 'Escape') {
                setName(family.name)
                setNameError(null)
                setEditingName(false)
              }
            }}
            aria-label={t('family.name')}
            className="w-full rounded-xs border border-accent bg-surface px-2 py-1 text-[24px] font-semibold leading-tight text-ink outline-none ring-2 ring-accent/20"
          />
        ) : (
          isOwner ? (
            <h1>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="w-full rounded-xs px-2 py-1 text-left text-[24px] font-semibold leading-tight text-ink transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
              >
                {family.name}
              </button>
            </h1>
          ) : (
            <h1 className="px-2 py-1 text-[24px] font-semibold leading-tight text-ink">{family.name}</h1>
          )
        )}
        {nameError && (
          <p role="alert" className="mt-2 text-sm text-error-accent">{nameError}</p>
        )}
        <p className="mono-sm text-text-tertiary mt-1">
          {family.role === 'owner'
            ? t('family.yourRole.owner')
            : t('family.yourRole.member', { role: t(`family.role.${family.role}`).toLowerCase() })}
        </p>
      </section>

      {/* Invite link */}
      <section className="page-px py-4 border-t border-border-subtle">
        <h2 className="label-caps text-text-tertiary mb-2">{t('family.inviteLink')}</h2>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={inviteUrl}
            className="flex-1 h-11 px-3 rounded-xs bg-background border border-border-line text-text-secondary mono-sm truncate"
          />
          <Button variant="secondary" size="icon" onClick={copyInvite} aria-label={t('family.copyInvite')}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </Button>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            leftIcon={<ArrowsClockwise size={16} aria-hidden="true" />}
            onClick={async () => {
              await regenerate(family._id)
            }}
          >
            {t('family.regenerateInvite')}
          </Button>
        )}
        <p className="text-xs text-text-tertiary mt-2">
          {t('family.inviteDescription')} {isOwner ? t('family.inviteOwnerDescription') : ''}
        </p>
      </section>

      {/* Members + roles */}
      <section className="border-t border-border-subtle">
        <h2 className="label-caps text-text-tertiary page-px pt-4 pb-2">{t('family.members')}</h2>
        {!members.length ? (
          <EmptyState>{t('family.noMembers')}</EmptyState>
        ) : (
          <ul>
            {members.map((m) => (
              <li
                key={m._id}
                className="border-b border-border-subtle last:border-b-0 page-px py-3 min-h-[56px] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-[16px] text-text-primary truncate">
                    {m.displayName}
                    {m.you && <span className="text-text-tertiary"> ({t('family.you')})</span>}
                  </div>
                  <div className="mono-sm text-text-tertiary">
                    {t(`family.role.${m.isOwner ? 'owner' : m.role}`)}
                  </div>
                </div>
                {isOwner && !m.isOwner && (
                  <div className="flex items-center gap-2">
                    <RoleMenu
                      name={m.displayName}
                      role={m.role}
                      onChange={async (nextRole) => {
                        setError(null)
                        try {
                          await setRole(
                            family._id,
                            m.userId as Id<'users'>,
                            nextRole,
                          )
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e))
                          throw e
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeMember(family._id, m.userId as Id<'users'>)}
                      aria-label={t('family.removeMember')}
                    >
                      <Trash size={16} className="text-error-accent" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* API keys (owner-only) */}
      {isOwner && (
        <section className="border-t border-border-subtle">
          <h2 className="label-caps text-text-tertiary page-px pt-4 pb-2">{t('family.apiKeys')}</h2>
          <p className="text-sm text-text-tertiary page-px pb-2">
            {t('family.apiDescription')}
          </p>
          <form
            className="page-px pb-3 flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!family) return
              const label = newKeyLabel.trim() || undefined
              const { key } = await createApiKey(family._id, label)
              setRevealedKey(key)
              setRevealedLabel(label ?? null)
              setNewKeyLabel('')
            }}
          >
            <input
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              className="flex-1 h-11 px-3 rounded-xs bg-surface border border-border-line text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
              placeholder={t('family.apiLabelPlaceholder')}
            />
            <Button type="submit" variant="primary" size="sm">
              <Plus size={16} aria-hidden="true" /> {t('action.create')}
            </Button>
          </form>
          {!apiKeys?.length ? (
            <EmptyState>{t('family.noApiKeys')}</EmptyState>
          ) : (
            <ul>
              {apiKeys?.map((k) => (
                <li
                  key={k._id}
                  className="border-b border-border-subtle last:border-b-0 page-px py-3 min-h-[56px] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[16px] text-text-primary truncate">
                      {k.label ?? t('family.untitledKey')}
                    </div>
                    <div className="mono-sm text-text-tertiary">
                      {t('family.keyCreated', { date: formatInSG(k.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('family.revokeKey')}
                    onClick={() => void revokeApiKey(k._id as Id<'apiKeys'>)}
                  >
                    <Trash size={16} className="text-error-accent" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Switch family (if multiple) */}
      {mine.length > 1 && (
        <section className="border-t border-border-subtle">
          <h2 className="label-caps text-text-tertiary page-px pt-4 pb-2">{t('family.switch')}</h2>
          <ul>
            {mine.map((f) => (
              <li key={f._id} className="border-b border-border-subtle last:border-b-0">
                <button
                  type="button"
                  onClick={() => void setCurrent(f._id)}
                  className={
                    'w-full text-left page-px py-3 min-h-[56px] flex items-center justify-between gap-3 ' +
                    (f._id === family._id ? 'bg-accent-bg' : 'hover:bg-surface-hover')
                  }
                >
                  <div>
                    <div className="text-[16px] text-text-primary">{f.name}</div>
                    <div className="mono-sm text-text-tertiary">{t(`family.role.${f.role}`)}</div>
                  </div>
                  {f._id === family._id && (
                    <Check size={18} className="text-accent" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="page-px pt-2">
            <Link
              to="/family/new"
              className="inline-flex items-center gap-2 text-sm text-accent"
            >
              <Plus size={16} aria-hidden="true" /> {t('family.createAnother')}
            </Link>
          </div>
        </section>
      )}

      {/* Leave / delete */}
      <section className="border-t border-border-subtle page-px py-4 flex flex-col gap-2">
        {error && <p className="text-sm text-error-accent">{error}</p>}
        {!isOwner && (
          <Button
            variant="danger"
            leftIcon={<SignOut size={16} aria-hidden="true" />}
            onClick={async () => {
              try {
                await leaveFamily(family._id)
                navigate('/')
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            {t('family.leave')}
          </Button>
        )}
        {isOwner && (
          <Button
            variant="danger"
            leftIcon={<Trash size={16} aria-hidden="true" />}
            onClick={() => {
              setDeleteFamilyError(false)
              setConfirmDelete(true)
            }}
          >
            {t('family.delete')}
          </Button>
        )}
      </section>

      <BottomSheet
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false)
          setDeleteFamilyError(false)
        }}
        title={t('action.delete')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(false)
                setDeleteFamilyError(false)
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={deletingFamily}
              onClick={async () => {
                if (deletingFamily) return
                setDeletingFamily(true)
                setDeleteFamilyError(false)
                try {
                  await deleteFamily(family._id)
                  navigate('/', { replace: true })
                } catch {
                  setDeleteFamilyError(true)
                } finally {
                  setDeletingFamily(false)
                }
              }}
            >
              {t('action.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>{t('family.deleteConfirmation', { name: family.name })}</p>
          {deleteFamilyError && (
            <p role="alert" className="text-sm text-error-accent">
              {t('family.deleteFailed')}
            </p>
          )}
        </div>
      </BottomSheet>

      {/* Reveal a newly-created API key exactly once. */}
      <BottomSheet
        open={revealedKey !== null}
        onClose={() => {
          setRevealedKey(null)
          setRevealedLabel(null)
        }}
        title={t('family.newApiKey')}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setRevealedKey(null)
              setRevealedLabel(null)
            }}
          >
            {t('action.close')}
          </Button>
        }
      >
        <p className="text-sm text-text-secondary mb-3">
          {t('family.apiKeyWarning', { name: family.name })}
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={revealedKey ?? ''}
            className="flex-1 h-11 px-3 rounded-xs bg-background border border-border-line text-text-secondary mono-sm truncate"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('family.copyKey')}
            onClick={() => {
              if (revealedKey) void navigator.clipboard?.writeText(revealedKey)
              setCopiedKey(true)
              setTimeout(() => setCopiedKey(false), 1500)
            }}
          >
            {copiedKey ? <Check size={18} /> : <Copy size={18} />}
          </Button>
        </div>
        {revealedLabel && (
          <p className="mono-sm text-text-tertiary mt-2">{t('family.apiLabel', { label: revealedLabel })}</p>
        )}
      </BottomSheet>
    </>
  )
}

function RoleMenu({
  name,
  role,
  onChange,
}: {
  name: string
  role: 'admin' | 'user'
  onChange: (role: 'admin' | 'user') => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const roles = ['user', 'admin'] as const

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={busy}
        aria-label={t('family.changeRole', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 min-w-28 items-center justify-between gap-3 rounded-xs bg-surface px-3 text-sm font-medium text-ink ring-1 ring-inset ring-border-line transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active disabled:opacity-50"
      >
        {t(`family.role.${role}`)}
        <CaretDown
          size={15}
          weight="bold"
          aria-hidden="true"
          className={`text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('family.roleMenu')}
          className="absolute right-0 top-full z-40 mt-1.5 w-36 rounded-sm bg-surface-floating p-1.5 shadow-[0_8px_24px_rgba(10,41,80,0.12)]"
        >
          {roles.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={role === option}
              disabled={busy}
              onClick={async () => {
                if (option === role) {
                  setOpen(false)
                  return
                }
                setBusy(true)
                try {
                  await onChange(option)
                  setOpen(false)
                } catch {
                  // The parent renders the mutation error in the page flow.
                } finally {
                  setBusy(false)
                }
              }}
              className="flex h-11 w-full items-center justify-between rounded-xs px-3 text-left text-sm font-medium text-text-primary transition hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover active:bg-surface-active disabled:opacity-50"
            >
              {t(`family.role.${option}`)}
              {role === option && (
                <Check size={16} weight="bold" className="text-accent" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
