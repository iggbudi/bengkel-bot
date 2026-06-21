import { useEffect, type RefObject } from 'react'

export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement>,
  value: string,
  maxHeight = 140,
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [ref, value, maxHeight])
}
