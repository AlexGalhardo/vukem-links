import { sql } from "drizzle-orm"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

// Helper function to generate a CUID-like ID for mock purposes
// In a real application, use a dedicated CUID library (e.g., @paralleldrive/cuid2)
function generateUniqueId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `cl${timestamp}${random}`
}

export const masterCategories = sqliteTable("master_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateUniqueId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
})

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
})

export const subcategories = sqliteTable("subcategories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateUniqueId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
})

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
})
