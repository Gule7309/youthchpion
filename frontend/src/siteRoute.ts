// Keep existing dashboard hashes shareable; home anchors belong to the landing page.
export const isLandingHash = (hash: string) => !hash || hash === '#home' || hash.startsWith('#home-')
