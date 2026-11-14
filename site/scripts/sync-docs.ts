/**
 * Builds site/content from the repository documentation, which stays the single
 * source of truth: README.md, docs/*.md and the root community files. Run `npm run sync:docs` after editing any of them and
 * commit the result. Writes content/docs/**\/*.mdx and content/navigation.ts.
 */
import fs from "node:fs";
import path from "node:path";

const siteDir = path.join(import.meta.dirname, "..");
const repoDir = path.join(siteDir, "..");
const outDocs = path.join(siteDir, "content", "docs");

type Page = { src: string; slug: string; title?: string; description?: string };
type Category = { title: string; dir: string; prefix?: string; pages: Page[] };

const categories: Category[] = [
	{
		title: "Getting started",
		dir: "getting-started",
		prefix: "",
		pages: [
			{
				src: "README.md",
				slug: "introduction",
				title: "Introduction",
				description: "An open source dashboard for affiliate links: health checks, automatic fallback and click stats.",
			},
			{ src: "docs/setup.md", slug: "setup" },
			{ src: "docs/migration.md", slug: "migration" },
		],
	},
	{
		title: "Reference",
		dir: "reference",
		pages: [
			{ src: "docs/api.md", slug: "api" },
			{ src: "docs/integration.md", slug: "integration" },
			{ src: "docs/health-check.md", slug: "health-check" },
			{ src: "docs/auth.md", slug: "auth" },
			{ src: "docs/architecture.md", slug: "architecture" },
		],
	},
	{
		title: "Project",
		dir: "project",
		pages: [
			{ src: "docs/workflows.md", slug: "workflows" },
			{ src: "docs/conventions.md", slug: "conventions" },
			{ src: "docs/tooling.md", slug: "tooling" },
			{ src: "docs/brainstorming.md", slug: "brainstorming" },
			{ src: "CONTRIBUTING.md", slug: "contributing" },
			{ src: "SECURITY.md", slug: "security" },
			{ src: "CODE_OF_CONDUCT.md", slug: "code-of-conduct" },
		],
	},
];

const existing = categories.flatMap((c) =>
	c.pages.filter((p) => fs.existsSync(path.join(repoDir, p.src))).map((p) => ({ ...p, cat: c })),
);
const hrefBySource = new Map(
	existing.map((p) => [p.src, `/docs/${p.cat.prefix ?? p.cat.dir}/${p.slug}`.replace("//", "/")]),
);
hrefBySource.set("CHANGELOG.md", "/changelog");

/** Splits a document into its H1, first paragraph and body without the H1. */
function split(raw: string): { title: string; description: string; body: string } {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");
	let title = "";
	const rest: string[] = [];
	for (const line of lines) {
		if (!title && /^# /.test(line)) {
			title = line.slice(2).trim();
			continue;
		}
		rest.push(line);
	}
	// The README opens with a centered HTML header (title and badges) for GitHub; the site page has its own title.
	const body = rest
		.join("\n")
		.replace(/^\s+/, "")
		.replace(/^<div align="center">[\s\S]*?\n<\/div>\s*/, "");
	const para = body.split(/\n\s*\n/).find((p) => p.trim() && !/^(#|[-*>|`]|\d+\.)/.test(p.trim()));
	const plain = (para ?? "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[`*_<>]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const description = plain.length > 200 ? `${plain.slice(0, 197).trimEnd()}...` : plain;
	return { title, description, body };
}

/** Makes Markdown safe for MDX and rewrites repository links to site links. */
function toMdx(body: string, from: string): string {
	const out: string[] = [];
	let fence = false;
	for (const line of body.split("\n")) {
		if (/^\s*```/.test(line)) {
			fence = !fence;
			out.push(line);
			continue;
		}
		if (fence) {
			out.push(line);
			continue;
		}
		const parts = line.split(/(`[^`]*`)/);
		out.push(
			parts
				.map((part, i) => {
					if (i % 2 === 1) return part;
					return part
						.replace(/<(https?:\/\/[^>\s]+)>/g, "[$1]($1)")
						.replace(/\]\(docs\/screenshots\//g, "](https://raw.githubusercontent.com/AlexGalhardo/vukem-links/main/docs/screenshots/")
						.replace(/\]\(([^)#]+\.md)(#[^)]*)?\)/g, (m, target: string, hash?: string) => {
							const abs = path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
							const href = hrefBySource.get(abs);
							return href ? `](${href}${hash ?? ""})` : `](https://github.com/AlexGalhardo/vukem-links/blob/main/${abs}${hash ?? ""})`;
						})
						.replace(/<!--[\s\S]*?-->/g, "")
						.replace(/\{/g, "&#123;")
						.replace(/\}/g, "&#125;")
						.replace(/<(?!\/?(a|br|code|kbd|sub|sup|strong|em)\b)/g, "&lt;");
				})
				.join(""),
		);
	}
	return out.join("\n");
}

fs.rmSync(outDocs, { recursive: true, force: true });
for (const p of existing) {
	const raw = fs.readFileSync(path.join(repoDir, p.src), "utf8");
	const { title, description, body } = split(raw);
	const fm = [
		"---",
		`title: ${JSON.stringify(p.title ?? title ?? p.slug)}`,
		`description: ${JSON.stringify(p.description ?? (description || (p.title ?? title)))}`,
		"---",
		"",
	].join("\n");
	const dest = path.join(outDocs, p.cat.dir, `${p.slug}.mdx`);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, `${fm}${toMdx(body, p.src).trimEnd()}\n`);
}

const nav = categories
	.map((c) => ({ ...c, pages: c.pages.filter((p) => existing.some((e) => e.src === p.src)) }))
	.filter((c) => c.pages.length > 0)
	.map((c) => {
		const prefix = c.prefix === undefined ? "" : `    prefix: ${JSON.stringify(c.prefix)},\n`;
		return `  {\n    title: ${JSON.stringify(c.title)},\n    dir: ${JSON.stringify(c.dir)},\n${prefix}    pages: [${c.pages.map((p) => JSON.stringify(p.slug)).join(", ")}],\n  },`;
	})
	.join("\n");
fs.writeFileSync(
	path.join(siteDir, "content", "navigation.ts"),
	`/**
 * Generated by scripts/sync-docs.ts from the repository documentation. Do not edit by hand:
 * change the source Markdown and run \`bun run sync:docs\`.
 */
export type NavCategory = {
  title: string;
  dir: string;
  prefix?: string;
  pages: string[];
};

export const navigation: NavCategory[] = [
${nav}
];
`,
);
console.log(`synced ${existing.length} pages`);
