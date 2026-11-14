# vukem-links documentation site

The public docs at <https://alexgalhardo.github.io/vukem-links/>: Astro 7 (static output), React islands, Tailwind CSS v4, Base UI and MDX, copied from the `vukem-trading` site shell. Served from the GitHub Pages project path, so every site-absolute link goes through `withBase` (`lib/base.ts`); there is no custom domain.

## Run

```sh
cd site
npm ci
npm run sync:docs        # regenerate content/ from ../README.md and ../docs (commit the result)
npm run dev              # http://localhost:3000/vukem-links/
npm run build            # static build into out/
npm run lint
npm run check:mdx        # compile MDX, check components, /docs links and code line length
npm run last-updated     # refresh content/last-updated.json (needs full git history)
npm run check:last-updated
npm run test:scripts
```

Never edit `content/docs` or `content/navigation.ts` by hand: they are generated from `README.md`, `docs/`, the root community files and `CHANGELOG.md`. Add a page by adding the Markdown file under `docs/` and listing it in `scripts/sync-docs.ts`.

## Last updated

Each page shows the date of its last commit. `content/last-updated.json` is generated from git history; the `site` workflow checks it.

## Deploy

`.github/workflows/site.yml` builds on every PR and publishes to GitHub Pages on a push to `main`. Pages source must be set to GitHub Actions. There is no Docker image for this site.
