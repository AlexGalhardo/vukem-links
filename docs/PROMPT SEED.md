## Contexto

To criando um gerenciador de links de afiliados próprio usando nextjs v16, shadcn-ui e tailwindcss v4

To usando o banco de dados tursor da vercel (sqlite serverless) com o drizzle-orm

Esse é o código legado do seed.ts database colocando alguns dados legados mocados

## Tarefa

- Tenho um arquivo JSON chamdo "seed.json" que esta na raiz do projeto nextjs v16 com essa estrutura, com mais de 700 produtos:

```json
[
  {
    "id": "https://app.produtostech.com.br/cameras-de-seguranca/hw-speed-dome-a8",
    "category": "cameras-de-seguranca",
    "mercadolivreUrl": "https://mercadolivre.com/sec/1BXJGku",
    "amazonUrl": null,
    "shopeeUrl": null
  },
  {
    "id": "https://app.produtostech.com.br/cameras-de-seguranca/haixia-eks-p11",
    "category": "cameras-de-seguranca",
    "mercadolivreUrl": "https://mercadolivre.com/sec/1VFpKbE",
    "amazonUrl": null,
    "shopeeUrl": null
  },
  ...
]
```

- Quero que você ajeite esse código de seed, para colocar dados no tursor seguindo os requisitos:
   - Por enquanto, só existirão produtos físicos.
   - Deixe os produtos digitais com 0 links cadastrados (nenhuma categoria também)
   - Crie as category master com o valor de category que você vai ler no JSON, que atualmente são essas aqui:

├── airfryers.json
├── ar-condicionado.json
├── cafeteiras.json
├── caixas-de-som.json
├── cameras-de-seguranca.json
├── cameras.json
├── cpus.json
├── drones.json
├── fechaduras.json
├── fones-de-ouvido.json
├── geladeiras.json
├── gpus.json
├── impressoras.json
├── maquina-lavar-roupas.json
├── microondas.json
├── monitores.json
├── mouses.json
├── notebooks.json
├── panelas-eletricas.json
├── placas-mae.json
├── smartphones.json
├── smartvs.json
├── smartwatches.json
├── tablets.json
└── teclados.json


2. Ajeite esse código do schema do drizzle aqui

import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

function generateUniqueId(): string {
 const timestamp = Date.now().toString(36);
 const random = Math.random().toString(36).substring(2, 8);
 return `cl${timestamp}${random}`;
}

export const masterCategories = sqliteTable("master_categories", {
 id: text("id")
  .primaryKey()
  .$defaultFn(() => generateUniqueId()),
 name: text("name").notNull(),
 slug: text("slug").notNull().unique(),
 createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable("categories", {
 id: text("id")
  .primaryKey()
  .$defaultFn(() => generateUniqueId()),
 name: text("name").notNull(),
 slug: text("slug").notNull().unique(),
 masterCategoryId: text("master_category_id")
  .notNull()
  .references(() => masterCategories.id, { onDelete: "cascade" }),
 createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const subcategories = sqliteTable("subcategories", {
 id: text("id")
  .primaryKey()
  .$defaultFn(() => generateUniqueId()),
 name: text("name").notNull(),
 slug: text("slug").notNull().unique(),
 categoryId: text("category_id")
  .notNull()
  .references(() => categories.id, { onDelete: "cascade" }),
 bitlyUrl: text("bitly_url"), // Novo campo para o link Bitly
 createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const links = sqliteTable("links", {
 id: text("id")
  .primaryKey()
  .$defaultFn(() => generateUniqueId()),
 url: text("url").notNull(),
 subcategoryId: text("subcategory_id")
  .notNull()
  .references(() => subcategories.id, { onDelete: "cascade" }),
 clicks: integer("clicks").default(0).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
 id: text("id")
  .primaryKey()
  .$defaultFn(() => generateUniqueId()),
 email: text("email").notNull().unique(),
 password: text("password").notNull(),
 name: text("name"),
 createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
 updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

- Para ter a nova coluna 'id' também, que vai ter os valores do 'id' que vem do JSON
- Todos as tabelas devem ter o campo updatedAt também

Me de esses 2 códigos completos, para copiar e colar, em typescript, fortemente tipado e sem comentários para eu testar aqui