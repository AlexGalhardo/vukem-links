"use server"

import { db } from "@/lib/db"
import { masterCategories, categories, subcategories, links } from "@/db/schema"
import { eq, sql, gte } from "drizzle-orm"

// --- Interfaces para tipagem ---
interface MasterCategory {
  id: string
  name: string
  slug: string
  createdAt: Date
  categories?: Category[]
  totalRedirects?: number
}

interface Category {
  id: string
  name: string
  slug: string
  masterCategoryId: string
  createdAt: Date
  subcategories?: Subcategory[]
  totalRedirects?: number
}

interface Subcategory {
  id: string
  name: string
  slug: string
  categoryId: string
  bitlyUrl?: string | null // Adicionado bitlyUrl
  createdAt: Date
  _count?: {
    links: number
  }
  totalRedirects?: number
}

interface Link {
  id: string
  url: string
  clicks: number
  subcategoryId: string
  createdAt: Date
  subcategory?: {
    name: string
    slug: string
    category: {
      name: string
      slug: string
      masterCategory: {
        name: string
        slug: string
      }
    }
  }
}

// --- Funções de Leitura (GET) ---

export async function getMasterCategoriesWithDetails(): Promise<MasterCategory[]> {
  const allMasterCategories = await db.query.masterCategories.findMany()
  const allCategories = await db.query.categories.findMany()
  const allSubcategories = await db.query.subcategories.findMany()
  const allLinks = await db.query.links.findMany()

  return allMasterCategories.map((mc) => {
    const relatedCategories = allCategories.filter((cat) => cat.masterCategoryId === mc.id)
    const mcTotalRedirects = relatedCategories.reduce((sum, cat) => {
      const relatedSubcategories = allSubcategories.filter((sub) => sub.categoryId === cat.id)
      const catTotalRedirects = relatedSubcategories.reduce((subSum, sub) => {
        const relatedLinks = allLinks.filter((link) => link.subcategoryId === sub.id)
        const subTotalRedirects = relatedLinks.reduce((linkSum, link) => linkSum + link.clicks, 0)
        sub._count = { links: relatedLinks.length }
        sub.totalRedirects = subTotalRedirects
        return subSum + subTotalRedirects
      }, 0)
      cat.subcategories = relatedSubcategories
      cat.totalRedirects = catTotalRedirects
      return sum + catTotalRedirects
    }, 0)
    mc.categories = relatedCategories
    mc.totalRedirects = mcTotalRedirects
    return mc
  })
}

export async function getCategoriesWithDetails(): Promise<Category[]> {
  const allCategories = await db.query.categories.findMany()
  const allSubcategories = await db.query.subcategories.findMany()
  const allLinks = await db.query.links.findMany()

  return allCategories.map((cat) => {
    const relatedSubcategories = allSubcategories.filter((sub) => sub.categoryId === cat.id)
    const catTotalRedirects = relatedSubcategories.reduce((subSum, sub) => {
      const relatedLinks = allLinks.filter((link) => link.subcategoryId === sub.id)
      const subTotalRedirects = relatedLinks.reduce((linkSum, link) => linkSum + link.clicks, 0)
      sub._count = { links: relatedLinks.length }
      sub.totalRedirects = subTotalRedirects
      return subSum + subTotalRedirects
    }, 0)
    cat.subcategories = relatedSubcategories
    cat.totalRedirects = catTotalRedirects
    return cat
  })
}

export async function getSubcategoriesWithDetails(): Promise<Subcategory[]> {
  const allSubcategories = await db.query.subcategories.findMany()
  const allLinks = await db.query.links.findMany()

  return allSubcategories.map((sub) => {
    const relatedLinks = allLinks.filter((link) => link.subcategoryId === sub.id)
    const subTotalRedirects = relatedLinks.reduce((linkSum, link) => linkSum + link.clicks, 0)
    sub._count = { links: relatedLinks.length }
    sub.totalRedirects = subTotalRedirects
    return sub
  })
}

export async function getLinksWithDetails(): Promise<Link[]> {
  const allLinks = await db.query.links.findMany()
  const allSubcategories = await db.query.subcategories.findMany()
  const allCategories = await db.query.categories.findMany()
  const allMasterCategories = await db.query.masterCategories.findMany()

  return allLinks.map((link) => {
    const subcategory = allSubcategories.find((sub) => sub.id === link.subcategoryId)
    const category = allCategories.find((cat) => cat.id === subcategory?.categoryId)
    const masterCategory = allMasterCategories.find((master) => master.id === category?.masterCategoryId)

    return {
      ...link,
      subcategory: subcategory
        ? {
            name: subcategory.name,
            slug: subcategory.slug,
            category: {
              name: category?.name || "Unknown",
              slug: category?.slug || "unknown",
              masterCategory: {
                name: masterCategory?.name || "Unknown",
                slug: masterCategory?.slug || "unknown",
              },
            },
          }
        : undefined,
    }
  })
}

export async function getTotalRedirects(): Promise<number> {
  const result = await db.select({ total: sql<number>`sum(${links.clicks})` }).from(links)
  return result[0]?.total || 0
}

export async function getRedirectsLast7Days(): Promise<number> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const result = await db
    .select({ total: sql<number>`sum(${links.clicks})` })
    .from(links)
    .where(gte(links.createdAt, sevenDaysAgo))
  return result[0]?.total || 0
}

export async function getRedirectsLast30Days(): Promise<number> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const result = await db
    .select({ total: sql<number>`sum(${links.clicks})` })
    .from(links)
    .where(gte(links.createdAt, thirtyDaysAgo))
  return result[0]?.total || 0
}

export async function getRandomLinkBySubcategoryId(subcategoryId: string): Promise<Link | null> {
  const targetLinks = await db.query.links.findMany({
    where: eq(links.subcategoryId, subcategoryId),
  })

  if (targetLinks.length === 0) {
    console.log(`No links found for subcategory ID ${subcategoryId}.`)
    return null
  }

  const randomIndex = Math.floor(Math.random() * targetLinks.length)
  return targetLinks[randomIndex]
}

// --- Funções de Mutação (POST) ---

export async function createMasterCategory(data: { name: string; slug: string }) {
  const result = await db.insert(masterCategories).values(data).returning()
  return result[0]
}

export async function createCategory(data: { name: string; slug: string; masterCategoryId: string }) {
  const result = await db.insert(categories).values(data).returning()
  return result[0]
}

export async function createSubcategory(data: { name: string; slug: string; categoryId: string }) {
  const result = await db.insert(subcategories).values(data).returning()
  return result[0]
}

export async function createLink(data: { url: string; subcategoryId: string }) {
  const result = await db.insert(links).values(data).returning()
  return result[0]
}

export async function incrementLinkClicks(linkId: string) {
  await db
    .update(links)
    .set({ clicks: sql`${links.clicks} + 1` })
    .where(eq(links.id, linkId))
}

export async function updateLink(id: string, newUrl: string) {
  const result = await db.update(links).set({ url: newUrl }).where(eq(links.id, id)).returning()
  return result[0]
}

export async function deleteLink(id: string) {
  await db.delete(links).where(eq(links.id, id))
}

export async function updateSubcategoryBitlyUrl(id: string, bitlyUrl: string | null) {
  const result = await db.update(subcategories).set({ bitlyUrl }).where(eq(subcategories.id, id)).returning()
  return result[0]
}

export async function deleteSubcategoryBitlyUrl(id: string) {
  await db.update(subcategories).set({ bitlyUrl: null }).where(eq(subcategories.id, id))
}
