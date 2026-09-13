import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export function BackendNotice({ message, busy, onDismiss }: { message: string; busy: boolean; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!message || busy || hovered || focused || hidden) return
    const timer = window.setTimeout(onDismiss, 8000)
    return () => window.clearTimeout(timer)
  }, [message, busy, hovered, focused, hidden, onDismiss])
  if (!message) return null
  return <aside className="backend-toast" aria-label="資料更新提示"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }}>
    <Icon name="info" /><div role="status" aria-live="polite" aria-atomic="true"><strong>{busy ? '正在更新資料' : '資料更新結果'}</strong><p>{message}</p></div>
    <button type="button" aria-label="關閉資料更新提示" onClick={onDismiss}><Icon name="close" /></button>
  </aside>
}
