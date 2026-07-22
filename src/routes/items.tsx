import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { NoteBlank, Plus } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { usePages, useStorageUrl } from '@/data/hooks'
import { pagePath } from '@/lib/record-route'
import type { Doc } from '@convex/_generated/dataModel'

/** Responsive catalog of note pages — both users can create (§6.6). */
export default function Items() {
  const { t } = useTranslation()
  const items = usePages('item')

  return (
    <>
      <TopBar
        title={t('nav.notes')}
      />
      {!items ? (
        <EmptyState>{t('common.loading')}</EmptyState>
      ) : (
        <ul className="page-px grid grid-cols-2 gap-3 py-5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          <li className="min-w-0">
            <Link
              to="/p/new?type=item"
              className="group relative flex aspect-[4/3] h-full flex-col justify-between overflow-hidden rounded-sm border border-border-line bg-surface p-4 text-ink transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover active:translate-y-0 active:bg-surface-active motion-reduce:transform-none"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xs bg-accent-bg text-accent transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none">
                <Plus size={18} weight="bold" aria-hidden="true" />
              </span>
              <span className="text-[16px] font-semibold leading-tight tracking-[-0.01em]">
                {t('page.newItem')}
              </span>
            </Link>
          </li>
          {items.map((p) => (
            <NoteCard key={p._id} note={p} />
          ))}
        </ul>
      )}
    </>
  )
}

function NoteCard({ note }: { note: Doc<'pages'> }) {
  const photoUrl = useStorageUrl(note.photoId)
  const initial = note.title.trim().charAt(0).toLocaleUpperCase() || '·'

  return (
    <li className="min-w-0">
      <Link
        to={pagePath(note)}
        className="group relative block aspect-[4/3] h-full overflow-hidden rounded-sm bg-background-alt shadow-[0_1px_0_rgba(10,41,80,0.08)] ring-1 ring-border-subtle transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(10,41,80,0.08)] active:translate-y-0 motion-reduce:transform-none"
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={note.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          />
        ) : (
          <div className="relative flex h-full items-center justify-center overflow-hidden bg-[linear-gradient(145deg,var(--color-surface)_0%,var(--color-background-alt)_100%)]">
            <span aria-hidden="true" className="select-none text-[64px] font-semibold tracking-[-0.05em] text-ink/[0.08]">
              {initial}
            </span>
            <NoteBlank size={18} aria-hidden="true" className="absolute right-3 top-3 text-text-disabled" />
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 min-w-0 rounded-xs border border-white/60 bg-surface-floating/90 px-3 py-2 text-ink shadow-[0_2px_10px_rgba(10,41,80,0.08)] backdrop-blur-md">
          <div className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">
            {note.title}
          </div>
          {note.localName && (
            <div className="mt-0.5 truncate font-local-script text-[15px] text-ink/70" style={{ fontFamily: 'var(--font-local-script)' }}>
              {note.localName}
            </div>
          )}
        </div>
      </Link>
    </li>
  )
}
