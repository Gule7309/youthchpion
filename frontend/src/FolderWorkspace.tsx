import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from 'react'
import { Icon, type IconName } from './Icon'

export const folderPages = [
  { id: 'indicators', label: '指標', icon: 'formula', description: '理解模型，看見每一項訊號' },
  { id: 'risk', label: '風險', icon: 'chart', description: '比較職業，找到值得關注的變化' },
  { id: 'diagnosis', label: '診斷', icon: 'sparkles', description: '拆解原因，也保留其他可能的解釋' },
  { id: 'evidence', label: '論證', icon: 'book', description: '回到資料與研究，檢視判斷的依據' },
  { id: 'report', label: '報告', icon: 'report', description: '從證據出發，評估政策方向' },
] as const satisfies readonly { id: string; label: string; icon: IconName; description: string }[]
const aliases: Record<string, string> = { overview: 'indicators', 'dashboard-content': 'indicators', comparison: 'risk', research: 'evidence', policy: 'report' }
export function pageFromHash(hash: string) {
  const name = hash.replace(/^#/, '')
  return Math.max(0, folderPages.findIndex(page => page.id === (aliases[name] ?? name)))
}
export function adjacentPages(index: number) {
  return folderPages.map((page, i) => ({ ...page, index: i, distance: Math.abs(i-index) })).filter(page => page.distance > 0 && page.distance <= 2)
}
export function swipeStep(dx: number, dy: number) { return Math.abs(dx) >= 48 && Math.abs(dx) >= Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0 }
export type WorkspaceHandle = { saveReading: () => void; focusCurrent: () => void }
export const motionPreferenceKey = 'youthlm.folder-motion'
function savedReducedMotion() {
  try { return window.localStorage.getItem(motionPreferenceKey) === 'reduced' }
  catch { return false }
}
type Reading = { top: number; expanded: string[] }
type Props = { contextKey: string; blocked: boolean; onExternalNavigate: () => void; renderPage: (index: number) => ReactNode }

export const FolderWorkspace = forwardRef<WorkspaceHandle, Props>(function FolderWorkspace({ contextKey, blocked, onExternalNavigate, renderPage }, ref) {
  const [active, setActive] = useState(() => pageFromHash(window.location.hash))
  const [focusIndex, setFocusIndex] = useState(active)
  const [outgoing, setOutgoing] = useState<number | null>(null)
  const [reduced, setReduced] = useState(savedReducedMotion)
  const [documentMode, setDocumentMode] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const current = useRef(active)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const panels = useRef<(HTMLDivElement | null)[]>([])
  const readers = useRef<(HTMLDivElement | null)[]>([])
  const stage = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const caption = useRef<HTMLDivElement>(null)
  const shells = useRef<(HTMLDivElement | null)[]>([])
  const peeks = useRef<(HTMLButtonElement | null)[]>([])
  const geometryReady = useRef(false)
  const memory = useRef(new Map<string, Reading>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const revision = useRef(0)
  const mode = useRef(false)
  const layoutViewport = useRef({ width: window.innerWidth, height: window.innerHeight })
  const live = useRef({ blocked, onExternalNavigate, contextKey, reduced })
  live.current = { blocked, onExternalNavigate, contextKey, reduced }
  const touch = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const pendingFocus = useRef(false)
  const keyFor = (i: number) => `${live.current.contextKey}:${folderPages[i].id}`
  function remember(i = current.current) {
    const reader = readers.current[i]
    if (!reader) return
    const prior = memory.current.get(keyFor(i))
    memory.current.set(keyFor(i), {
      top: mode.current ? (i === current.current ? Math.max(0, -reader.getBoundingClientRect().top) : prior?.top ?? 0) : reader.scrollTop,
      expanded: [...reader.querySelectorAll<HTMLDetailsElement>('details[data-memory][open]')].map(el => el.dataset.memory!),
    })
  }
  function restore(i = current.current) {
    const reader = readers.current[i]
    if (!reader) return
    const state = memory.current.get(keyFor(i))
    for (const detail of reader.querySelectorAll<HTMLDetailsElement>('details[data-memory]')) detail.open = state?.expanded.includes(detail.dataset.memory!) ?? false
    if (mode.current) {
      const target = state?.top ? reader.getBoundingClientRect().top + window.scrollY + state.top : 0
      window.scrollTo({ top: Math.min(target, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)), behavior: 'instant' })
    }
    else reader.scrollTop = Math.min(state?.top ?? 0, Math.max(0, reader.scrollHeight-reader.clientHeight))
  }
  function focusCurrent() { tabs.current[current.current]?.focus({ preventScroll: true }) }
  useImperativeHandle(ref, () => ({ saveReading: () => remember(), focusCurrent }))
  function settle() { revision.current++; clearTimeout(timer.current); setOutgoing(null) }
  function positionShells(instant = false) {
    const host = stage.current
    const main = windowRef.current
    if (!host || !main) return
    const origin = host.getBoundingClientRect()
    const frame = main.getBoundingClientRect()
    if (!frame.width || !frame.height) return
    const immediate = instant || !geometryReady.current || live.current.reduced
    shells.current.forEach((shell, index) => {
      if (!shell) return
      const selected = current.current === index
      const side = peeks.current[index]?.getBoundingClientRect()
      const visibleSide = side && side.width > 0
      const target = selected ? frame : visibleSide ? side : {
        left: index < current.current ? origin.left - 56 : origin.right + 8,
        top: frame.top + frame.height * .3, width: 44, height: frame.height * .4,
      }
      if (immediate) shell.style.transition = 'none'
      shell.style.width = `${frame.width}px`
      shell.style.height = `${frame.height}px`
      shell.style.transform = `translate3d(${target.left-origin.left}px,${target.top-origin.top}px,0) scale(${target.width/frame.width},${target.height/frame.height})`
      const sx = target.width/frame.width
      const sy = target.height/frame.height
      const body = shell.firstElementChild as HTMLElement
      const lip = shell.lastElementChild as HTMLElement
      body.style.top = selected ? '32px' : '0'
      body.style.borderRadius = selected
        ? `0 ${28/sx}px ${28/sx}px ${28/sx}px / 0 ${28/sy}px ${28/sy}px ${28/sy}px`
        : `${24/sx}px / ${24/sy}px`
      lip.style.opacity = selected ? '1' : '0'
      lip.style.width = selected ? (window.innerWidth < 768 ? '170px' : '206px') : `${30/sx}px`
      lip.style.borderRadius = `${28/sx}px ${32/sx}px 0 0 / ${28/sy}px ${32/sy}px 0 0`
      shell.style.opacity = selected || visibleSide ? '1' : '0'
      shell.style.zIndex = selected ? '2' : '1'
      if (immediate) { void shell.offsetWidth; shell.style.removeProperty('transition') }
    })
    geometryReady.current = true
    host.dataset.shellsReady = 'true'
  }
  function select(index: number, source: 'tab' | 'side' | 'swipe' | 'history' = 'tab') {
    if (index < 0 || index >= folderPages.length || (live.current.blocked && source !== 'history')) return
    if (source === 'history') { pendingFocus.current = true; live.current.onExternalNavigate() }
    if (index === current.current) return
    remember()
    const old = current.current
    const mustFocus = source === 'tab' || source === 'side' || source === 'history' || !!panels.current[old]?.contains(document.activeElement)
    current.current = index
    setActive(index); setFocusIndex(index)
    clearTimeout(timer.current)
    const version = ++revision.current
    setOutgoing(live.current.reduced ? null : old)
    if (!live.current.reduced) timer.current = setTimeout(() => { if (version === revision.current) setOutgoing(null) }, 460)
    if (source !== 'history') window.history.pushState(null, '', `#${folderPages[index].id}`)
    if (mustFocus) { pendingFocus.current = true; tabs.current[index]?.focus({ preventScroll: true }) }
    if (source === 'swipe') setAnnouncement(`${folderPages[index].label}，第 ${index + 1} 頁，共 5 頁`)
  }
  useEffect(() => {
    const sync = () => {
      const index = pageFromHash(window.location.hash)
      const hash = `#${folderPages[index].id}`
      if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
      select(index, 'history')
    }
    const initial = `#${folderPages[current.current].id}`
    if (window.location.hash !== initial) window.history.replaceState(null, '', initial)
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); clearTimeout(timer.current); revision.current++ }
  }, [])
  function toggleMotion() {
    const next = !reduced
    live.current.reduced = next
    setReduced(next)
    if (next) settle()
    try { window.localStorage.setItem(motionPreferenceKey, next ? 'reduced' : 'full') }
    catch { /* Storage may be blocked; the in-memory choice still works. */ }
  }
  useLayoutEffect(() => { restore() }, [active, contextKey, documentMode])
  useLayoutEffect(() => { positionShells() }, [active, documentMode, contextKey, reduced])
  useLayoutEffect(() => {
    if (!blocked && pendingFocus.current) { pendingFocus.current = false; focusCurrent() }
  }, [active, blocked])
  useLayoutEffect(() => {
    const resize = () => {
      if (!stage.current) return
      const top = stage.current.getBoundingClientRect().top + window.scrollY
      const app = stage.current.closest('.folder-app')
      const panel = panels.current[current.current]
      const header = panel?.querySelector('.folder-title')
      const bottomPadding = app ? parseFloat(getComputedStyle(app).paddingBottom) || 0 : 0
      const panelPadding = panel ? parseFloat(getComputedStyle(panel).paddingBottom) || 0 : 0
      const readerSpace = window.innerHeight - top - bottomPadding - panelPadding
        - (caption.current?.getBoundingClientRect().height ?? 0)
        - (header?.getBoundingClientRect().height ?? 0)
      const nextMode = readerSpace < 280
      layoutViewport.current = { width: window.innerWidth, height: window.innerHeight }
      if (nextMode !== mode.current) {
        mode.current = nextMode
        setDocumentMode(nextMode)
      }
      settle()
      positionShells(true)
    }
    resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined
    if (stage.current?.parentElement) observer?.observe(stage.current.parentElement)
    if (windowRef.current) observer?.observe(windowRef.current)
    if (caption.current) observer?.observe(caption.current)
    return () => { window.removeEventListener('resize', resize); observer?.disconnect() }
  }, [])
  useEffect(() => {
    const save = () => {
      const viewport = layoutViewport.current
      if (mode.current && !live.current.blocked && viewport.width === window.innerWidth && viewport.height === window.innerHeight) remember()
    }
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])
  useEffect(() => {
    const registrations = readers.current.map((node, i) => {
      const save = () => { if (i === current.current) remember(i) }
      node?.addEventListener('toggle', save, true)
      return () => node?.removeEventListener('toggle', save, true)
    })
    return () => registrations.forEach(remove => remove())
  }, [])
  function touchStart(e: TouchEvent) {
    suppressClick.current = false
    if (blocked || e.touches.length !== 1 || (e.target as Element).closest('button,a,input,select,textarea')) { touch.current = null; return }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function touchEnd(e: TouchEvent) {
    const start = touch.current; touch.current = null
    if (!start || blocked || e.changedTouches.length !== 1 || e.touches.length !== 0) return
    const delta = swipeStep(e.changedTouches[0].clientX-start.x, e.changedTouches[0].clientY-start.y)
    if (delta) { suppressClick.current = true; select(current.current + delta, 'swipe') }
  }
  return <div className={`folder-workspace${documentMode ? ' is-document' : ''}${outgoing !== null ? ' is-transitioning' : ''}`} data-reduced-motion={reduced}>
    <button className="folder-skip" onClick={() => panels.current[active]?.focus({ preventScroll: true })}>跳至目前頁內容</button>
    <div className="folder-tabs" role="tablist" aria-label="分析分頁" style={{ '--selected': active } as CSSProperties}>
      <div className="folder-tab-highlight" aria-hidden="true" inert style={{ clipPath: `inset(0 ${(4-active)*20}% 0 ${active*20}% round 32px)` }}>
        {folderPages.map(page => <span key={page.id}><Icon name={page.icon}/>{page.label}</span>)}
      </div>
      {folderPages.map((page, index) => <button key={page.id} ref={node => { tabs.current[index] = node }} id={`tab-${page.id}`} role="tab" aria-selected={active === index} aria-controls={`panel-${page.id}`} tabIndex={focusIndex === index ? 0 : -1} disabled={blocked}
        onFocus={() => setFocusIndex(index)} onClick={() => select(index)} onKeyDown={e => {
          let target = index
          if (e.key === 'ArrowLeft') target = Math.max(0, index-1)
          else if (e.key === 'ArrowRight') target = Math.min(4, index+1)
          else if (e.key === 'Home') target = 0
          else if (e.key === 'End') target = 4
          else return
          e.preventDefault(); setFocusIndex(target); tabs.current[target]?.focus()
        }}><Icon name={page.icon}/><span>{page.label}</span></button>)}
    </div>
    <div className="folder-stage" ref={stage}>
      <div className="folder-shells" aria-hidden="true" inert>
        {folderPages.map((page, index) => <div key={page.id} data-folder={page.id} className="folder-shell" ref={node => { shells.current[index] = node }}><div className="folder-shell-body"/><div className="folder-shell-tab"/></div>)}
      </div>
      <div className="folder-window" ref={windowRef}>
        {folderPages.map((page, index) => {
          const selected = active === index
          const leaving = outgoing === index
          const distance = index === active ? 0 : index < active ? -1 : 1
          return <div key={page.id} ref={node => { panels.current[index] = node }} id={`panel-${page.id}`} role="tabpanel" aria-labelledby={`tab-${page.id}`} tabIndex={selected ? 0 : -1} aria-hidden={!selected} inert={!selected || blocked}
            className={`folder-panel${selected ? ' is-active' : ''}${leaving ? ' is-leaving' : ''}`} style={{ '--offset': distance } as CSSProperties}>
            <div className="folder-shape" aria-hidden="true"/>
            <header className="folder-title" onTouchStart={touchStart} onTouchMove={e => { if(e.touches.length !== 1) touch.current = null }} onTouchEnd={touchEnd} onTouchCancel={() => { touch.current = null }} onClickCapture={e => { if(suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false } }}>
              <span className="folder-label"><Icon name={page.icon}/>{page.label}<span className="folder-page-count">0{index+1} / 05</span></span>
              <span className="folder-description">{page.description}</span><span className="folder-swipe-hint">左右滑動切換分頁</span>
            </header>
            <div className="folder-reader" ref={node => { readers.current[index] = node }} onScroll={() => { if(selected && !blocked) remember(index) }}>
              <div key={contextKey} className="folder-page-content">{renderPage(index)}</div>
            </div>
          </div>
        })}
      </div>
      {adjacentPages(active).map(page => <button key={page.id} ref={node => { peeks.current[page.index] = node }} className={`folder-peek ${page.index < active ? 'is-left' : 'is-right'} distance-${page.distance}`} disabled={blocked}
        aria-label={`開啟${page.label}，第 ${page.index+1} 頁，共 5 頁`} onClick={() => select(page.index, 'side')}>
        <Icon name={page.icon}/><span>{page.label}</span><span className="peek-number">0{page.index+1}</span>
      </button>)}
    </div>
    <div className="folder-caption" ref={caption}><span>{reduced ? '已減少動畫，切換直接完成。' : '點選上方分頁或側邊檔案夾切換'}</span>
      <button className="folder-motion-toggle" role="switch" aria-label="動畫效果" aria-checked={!reduced} disabled={blocked} onClick={toggleMotion}>
        <span className="folder-motion-track" aria-hidden="true"><i/></span>動畫效果：{reduced ? '關閉' : '開啟'}
      </button>
      <span>{active+1} / 5 · {active === 0 ? '第一頁' : active === 4 ? '最後一頁' : '目前分頁'}</span></div>
    <span className="folder-sr-only" role="status">{announcement}</span>
  </div>
})
