import { useState } from 'react'
import { Check } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { useCurrentProfile, useUpdateProfile } from '@/data/hooks'
import i18n, { supportedLocales, type SupportedLocale } from '@/i18n'
import { cn } from '@/lib/cn'

export default function Settings() {
  const { t } = useTranslation()
  const profile = useCurrentProfile()
  const updateProfile = useUpdateProfile()
  const [saving, setSaving] = useState<SupportedLocale | null>(null)
  const [message, setMessage] = useState<'saved' | 'failed' | null>(null)

  if (!profile) {
    return (
      <>
        <TopBar title={t('settings.language')} back backOnDesktop={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  async function selectLanguage(locale: SupportedLocale) {
    if (locale === profile?.locale || saving) return
    const previousLocale = i18n.resolvedLanguage ?? i18n.language
    setSaving(locale)
    setMessage(null)
    await i18n.changeLanguage(locale)
    try {
      await updateProfile({ locale })
      setMessage('saved')
    } catch {
      await i18n.changeLanguage(previousLocale)
      setMessage('failed')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <TopBar title={t('settings.language')} back backOnDesktop={false} />
      <section className="border-t border-border-subtle">
        <div className="page-px pb-3 pt-5">
          <p className="text-sm text-text-secondary">{t('settings.languageDescription')}</p>
        </div>
        <ul className="border-t border-border-subtle">
          {supportedLocales.map((locale) => {
            const selected = profile.locale === locale
            return (
              <li key={locale} className="border-b border-border-subtle">
                <button
                  type="button"
                  onClick={() => void selectLanguage(locale)}
                  disabled={saving !== null}
                  aria-pressed={selected}
                  className={cn(
                    'page-px flex min-h-14 w-full items-center justify-between gap-3 text-left transition-colors',
                    selected ? 'bg-accent-bg' : 'hover:bg-surface-hover active:bg-surface-active',
                  )}
                >
                  <span className="text-[16px] font-medium text-text-primary">
                    {t(`language.${locale}`)}
                  </span>
                  {selected && <Check size={18} weight="bold" className="text-accent" aria-hidden="true" />}
                </button>
              </li>
            )
          })}
        </ul>
        {message && (
          <p
            role="status"
            className={cn(
              'page-px pt-3 text-sm',
              message === 'failed' ? 'text-error-accent' : 'text-success-text',
            )}
          >
            {t(message === 'failed' ? 'settings.languageSaveFailed' : 'settings.languageSaved')}
          </p>
        )}
      </section>
    </>
  )
}
