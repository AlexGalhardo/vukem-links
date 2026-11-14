import { base } from "@/lib/base";

const origin = "https://alexgalhardo.github.io";

export const site = {
  name: "vukem-links",
  tagline: "An open source dashboard for affiliate links: health checks, automatic fallback and click stats.",
  /** Where the site is served: GitHub Pages project path, no custom domain. */
  origin,
  url: process.env.SITE_URL ?? `${origin}${base}`,
  repo: "https://github.com/AlexGalhardo/vukem-links",
  editBase: "https://github.com/AlexGalhardo/vukem-links/edit/main/site/content",
} as const;
