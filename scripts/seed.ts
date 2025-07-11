import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "@/db/schema"
import { masterCategories, categories, subcategories, links } from "@/db/schema"

function generateUniqueId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `cl${timestamp}${random}`
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client, { schema })

async function seed() {
  console.log("Iniciando o processo de seed do banco de dados...")

  await db.delete(links)
  await db.delete(subcategories)
  await db.delete(categories)
  await db.delete(masterCategories)
  console.log("Dados existentes limpos.")

  const masterCategoryData = [
    { name: "Físico", slug: "fisico" },
    { name: "Digital", slug: "digital" },
  ]
  const insertedMasterCategories = await db.insert(masterCategories).values(masterCategoryData).returning()
  console.log("Categorias Master inseridas:", insertedMasterCategories.length)

  const fisicoId = insertedMasterCategories.find((mc) => mc.slug === "fisico")!.id
  const digitalId = insertedMasterCategories.find((mc) => mc.slug === "digital")!.id

  const categoryData = [
    { name: "Produtos para Casa", slug: "produtos-casa", masterCategoryId: fisicoId },
    { name: "Eletrônicos", slug: "eletronicos", masterCategoryId: fisicoId },
    { name: "Suplementos", slug: "suplementos", masterCategoryId: fisicoId },
    { name: "Livros", slug: "livros-fisicos", masterCategoryId: fisicoId },
    { name: "Jogos de Videogame", slug: "jogos-videogame", masterCategoryId: fisicoId },
    { name: "Perfumes", slug: "perfumes", masterCategoryId: fisicoId },
    { name: "Ebooks", slug: "ebooks", masterCategoryId: digitalId },
  ]
  const insertedCategories = await db.insert(categories).values(categoryData).returning()
  console.log("Categorias inseridas:", insertedCategories.length)

  const getCategoryId = (slug: string) => insertedCategories.find((cat) => cat.slug === slug)!.id

  const subcategoryData = [
  { name: "Low Ticket", slug: "produtos-casa-low-ticket", categoryId: getCategoryId("produtos-casa") },
  { name: "Mid Ticket", slug: "produtos-casa-mid-ticket", categoryId: getCategoryId("produtos-casa") },
  { name: "High Ticket", slug: "produtos-casa-high-ticket", categoryId: getCategoryId("produtos-casa") },

  { name: "Low Ticket", slug: "eletronicos-low-ticket", categoryId: getCategoryId("eletronicos") },
  { name: "Mid Ticket", slug: "eletronicos-mid-ticket", categoryId: getCategoryId("eletronicos") },
  { name: "High Ticket", slug: "eletronicos-high-ticket", categoryId: getCategoryId("eletronicos") },

  { name: "Geral", slug: "suplementos-geral", categoryId: getCategoryId("suplementos") },

  { name: "Dieta e Alimentação", slug: "livros-dieta-alimentacao", categoryId: getCategoryId("livros-fisicos") },
  { name: "Academia e Musculação", slug: "livros-academia-musculacao", categoryId: getCategoryId("livros-fisicos") },
  { name: "Relacionamentos", slug: "livros-relacionamentos", categoryId: getCategoryId("livros-fisicos") },
  { name: "IA", slug: "livros-ia", categoryId: getCategoryId("livros-fisicos") },
  { name: "Empreendedorismo Digital", slug: "livros-empreendedorismo-digital", categoryId: getCategoryId("livros-fisicos") },
  { name: "Finanças", slug: "livros-financas", categoryId: getCategoryId("livros-fisicos") },
  { name: "Espiritualidade", slug: "livros-espiritualidade", categoryId: getCategoryId("livros-fisicos") },
  { name: "Finanças Pessoais", slug: "livros-financas-pessoais", categoryId: getCategoryId("livros-fisicos") },

  { name: "Físicos", slug: "jogos-fisicos", categoryId: getCategoryId("jogos-videogame") },

  { name: "Geral", slug: "perfumes-geral", categoryId: getCategoryId("perfumes") },

  { name: "Dieta e Alimentação", slug: "ebooks-dieta-alimentacao", categoryId: getCategoryId("ebooks") },
  { name: "Academia e Musculação", slug: "ebooks-academia-musculacao", categoryId: getCategoryId("ebooks") },
  { name: "Relacionamentos", slug: "ebooks-relacionamentos", categoryId: getCategoryId("ebooks") },
  { name: "IA", slug: "ebooks-ia", categoryId: getCategoryId("ebooks") },
  { name: "Empreendedorismo Digital", slug: "ebooks-empreendedorismo-digital", categoryId: getCategoryId("ebooks") },
  { name: "Finanças", slug: "ebooks-financas", categoryId: getCategoryId("ebooks") },
  { name: "Espiritualidade", slug: "ebooks-espiritualidade", categoryId: getCategoryId("ebooks") },
  { name: "Finanças Pessoais", slug: "ebooks-financas-pessoais", categoryId: getCategoryId("ebooks") },
]


  const insertedSubcategories = await db.insert(subcategories).values(subcategoryData).returning()
  console.log("Subcategorias inseridas:", insertedSubcategories.length)

  const famousLinks = [
    "https://google.com",
    "https://wikipedia.org",
    "https://facebook.com",
    "https://reddit.com",
    "https://x.com",
    "https://youtube.com",
    "https://instagram.com",
    "https://linkedin.com",
    "https://github.com",
    "https://stackoverflow.com",
    "https://amazon.com",
    "https://netflix.com",
  ]

  const linkData: { url: string; subcategoryId: string; clicks: number; createdAt: Date }[] = []
  insertedSubcategories.forEach((sub, subIndex) => {
    for (let i = 0; i < 3; i++) {
      const linkIndex = (subIndex * 3 + i) % famousLinks.length
      linkData.push({
        url: famousLinks[linkIndex],
        subcategoryId: sub.id,
        clicks: Math.floor(Math.random() * 50), // Random clicks for demo
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
      })
    }
  })
  await db.insert(links).values(linkData)
  console.log("Links inseridos:", linkData.length)

  console.log("Processo de seed concluído com sucesso!")
}

seed().catch((err) => {
  console.error("Erro durante o processo de seed:", err)
  process.exit(1)
})
