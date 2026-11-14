/** GitHub Pages project path. Client-safe: no process.env here. */
export const base = "/vukem-links";

/** Prefixes a site-absolute path ("/docs/x") with the Pages base; anything else is returned as is. */
export function withBase(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (href === base || href.startsWith(`${base}/`)) return href;
  return `${base}${href}`;
}

/** Removes the Pages base from a browser pathname. */
export function stripBase(pathname: string): string {
  if (pathname === base) return "/";
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}
