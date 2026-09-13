import { useEffect, useLayoutEffect, useState } from 'react'
import App from './App'
import { LandingPage } from './LandingPage'
import { isLandingHash } from './siteRoute'

export default function Site() {
  const [home, setHome] = useState(() => isLandingHash(window.location.hash))
  useEffect(() => {
    const sync = () => setHome(isLandingHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])
  useLayoutEffect(() => {
    document.title = home ? 'rescueBill｜拯救 Bill，也拯救帳單' : 'rescueBill｜青年 AI 就業轉型政策系統'
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector<HTMLElement>(home ? '.landing h1' : '.folder-brand h1')?.focus({ preventScroll: true })
  }, [home])
  return home ? <LandingPage /> : <App />
}
