import { clsx, type ClassValue } from 'clsx'

/** Classname helper — tiny wrapper around clsx. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/** Optional chaining join for conditional class strings. */
export function when(cond: boolean, className: string, fallback = '') {
  return cond ? className : fallback
}
