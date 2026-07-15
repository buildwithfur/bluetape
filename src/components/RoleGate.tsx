import type { ReactNode } from 'react'
import { useCurrentRole } from '@/data/hooks'
import type { Role } from '@/types'

/** Hides children unless the current user's role is in `allow`.
 * Per PLAN.md §6.11 this is a UI convenience only; Convex mutations are the
 * real gate. Use <RoleGate allow={['admin']}>…</RoleGate>.
 */
export function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: Role[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const role = useCurrentRole()
  // 'owner' is a superset of 'admin' — they pass admin gates too.
  const effective = role === 'owner' ? 'admin' : role
  if (!effective || !allow.includes(effective)) return <>{fallback}</>
  return <>{children}</>
}
