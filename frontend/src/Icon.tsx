import type { ReactNode, SVGProps } from 'react'

export type IconName = 'logo' | 'dashboard' | 'chart' | 'book' | 'report' | 'database' | 'refresh' | 'calendar' | 'clock' | 'briefcase' | 'users' | 'sparkles' | 'info' | 'formula' | 'filter' | 'arrow' | 'external' | 'close'

// Local, code-native icons. Decorative SVGs inherit the accessible name of their button/link.
export function Icon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    logo: <><path d="M5 5l7 7 7-7M12 12v8" strokeWidth="2.5"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="20" r="1"/></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    chart: <><path d="M4 3v17h17M8 15V9m5 6V5m5 10v-4"/></>,
    book: <><path d="M12 5C8 2 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-2-9 1Zm0 0v15"/></>,
    report: <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/></>,
    refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 12c5 4 13 4 18 0M12 12v4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4c3 1 3 3 3 6"/></>,
    sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></>,
    formula: <><path d="M18 4H7l6 8-6 8h11M4 4h0"/></>,
    filter: <><path d="M3 6h18M6 12h12m-9 6h6"/></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>,
    external: <><path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/></>,
    close: <><path d="m6 6 12 12M6 18 18 6"/></>,
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`ui-icon ${className}`} aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>
}
