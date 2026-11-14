// Runs the real catalogue sync of the eletroradar site against a dashboard (scripts/integration-smoke.sh).
// Run it from the eletroradar checkout: it reads content/ relative to the working directory and imports the
// site's own affiliate-links.ts, so the contract exercised is the one the site ships.
//   cd <site checkout> && SITE_URL=<public origin of the site> \
//     DASHBOARD_URL=http://127.0.0.1:3056 LINKS_DASHBOARD_TOKEN=... bun /path/to/integration-sync.ts
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface Product {
  externalId: string;
}

interface Summary {
  productsCreated: number;
  productsUpdated: number;
  productsRemoved: number;
  linksAdded: number;
  linksRemoved: number;
}

interface SiteModules {
  links: {
    syncCatalogue(options: {
      dashboardUrl: string;
      siteUrl: string;
      token: string;
      products: Product[];
    }): Promise<Summary>;
  };
  affiliate: { buildCatalogue(posts: unknown[], lists: Map<string, unknown[]>): Product[] };
  parse: {
    isPublished(post: unknown): boolean;
    parsePost(slug: string, source: string): unknown;
  };
  schema: { productListSchema: { parse(value: unknown): unknown[] } };
  config: { site: { url: string } };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(2);
  }
  return value;
}

const load = (file: string): Promise<unknown> => import(pathToFileURL(resolve("src/lib", file)).href);

const [links, affiliate, parse, schema, config] = (await Promise.all([
  load("affiliate-links.ts"),
  load("content/affiliate.ts"),
  load("content/parse.ts"),
  load("content/schema.ts"),
  load("site.config.ts"),
])) as [
  SiteModules["links"],
  SiteModules["affiliate"],
  SiteModules["parse"],
  SiteModules["schema"],
  SiteModules["config"],
];

const posts = readdirSync("content/posts")
  .filter((file) => file.endsWith(".mdx"))
  .map((file) => parse.parsePost(file.slice(0, -4), readFileSync(`content/posts/${file}`, "utf8")))
  .filter((entry) => parse.isPublished((entry as { post: unknown }).post));
const lists = new Map<string, unknown[]>(
  readdirSync("content/products")
    .filter((file) => file.endsWith(".json"))
    .map((file) => [
      file.slice(0, -5),
      schema.productListSchema.parse(JSON.parse(readFileSync(`content/products/${file}`, "utf8"))),
    ]),
);
const products = affiliate.buildCatalogue(posts, lists);

const summary = await links.syncCatalogue({
  dashboardUrl: required("DASHBOARD_URL"),
  siteUrl: config.site.url,
  token: required("LINKS_DASHBOARD_TOKEN"),
  products,
});

console.log(JSON.stringify({ products: products.length, firstExternalId: products[0]?.externalId, ...summary }));
