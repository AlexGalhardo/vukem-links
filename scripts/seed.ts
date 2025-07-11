import { db } from "@/lib/db"
import { masterCategories, categories, subcategories, links } from "@/db/schema"

// Helper function to generate a CUID-like ID for mock purposes
function generateUniqueId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `cl${timestamp}${random}`
}

async function seed() {
  console.log("Iniciando o seed do banco de dados...")

  // Limpar dados existentes (opcional, mas útil para testes)
  await db.delete(links)
  await db.delete(subcategories)
  await db.delete(categories)
  await db.delete(masterCategories)
  console.log("Dados existentes limpos.")

  // Master Categories
  const masterCategoryDigitalId = generateUniqueId()
  const masterCategoryFisicoId = generateUniqueId()

  await db.insert(masterCategories).values([
    { id: masterCategoryDigitalId, name: "Digital", slug: "digital" },
    { id: masterCategoryFisicoId, name: "Físico", slug: "fisico" },
  ])
  console.log("Categorias Master criadas.")

  // Categories
  const categoryEbooksId = generateUniqueId()
  const categoryCursosId = generateUniqueId()
  const categoryProdutosCasaId = generateUniqueId()
  const categoryEletronicosId = generateUniqueId()
  const categorySuplementosId = generateUniqueId()
  const categoryLivrosFisicosId = generateUniqueId()
  const categoryJogosVideogameId = generateUniqueId()
  const categoryPerfumesId = generateUniqueId()

  await db.insert(categories).values([
    { id: categoryEbooksId, name: "Ebooks", slug: "ebooks", masterCategoryId: masterCategoryDigitalId },
    { id: categoryCursosId, name: "Cursos Online", slug: "cursos-online", masterCategoryId: masterCategoryDigitalId },
    {
      id: categoryProdutosCasaId,
      name: "Produtos para Casa",
      slug: "produtos-casa",
      masterCategoryId: masterCategoryFisicoId,
    },
    { id: categoryEletronicosId, name: "Eletrônicos", slug: "eletronicos", masterCategoryId: masterCategoryFisicoId },
    { id: categorySuplementosId, name: "Suplementos", slug: "suplementos", masterCategoryId: masterCategoryFisicoId },
    {
      id: categoryLivrosFisicosId,
      name: "Livros Físicos",
      slug: "livros-fisicos",
      masterCategoryId: masterCategoryFisicoId,
    },
    {
      id: categoryJogosVideogameId,
      name: "Jogos e Videogame",
      slug: "jogos-videogame",
      masterCategoryId: masterCategoryFisicoId,
    },
    { id: categoryPerfumesId, name: "Perfumes", slug: "perfumes", masterCategoryId: masterCategoryFisicoId },
  ])
  console.log("Categorias criadas.")

  // Subcategories
  const subcategoryNutricaoId = generateUniqueId()
  const subcategoryFinancasId = generateUniqueId()
  const subcategoryMarketingId = generateUniqueId()
  const subcategoryCulinariaId = generateUniqueId()
  const subcategoryDecoracaoId = generateUniqueId()
  const subcategoryLimpezaId = generateUniqueId()
  const subcategorySmartphonesId = generateUniqueId()
  const subcategoryNotebooksId = generateUniqueId()
  const subcategoryWheyId = generateUniqueId()
  const subcategoryCreatinaId = generateUniqueId()
  const subcategoryFiccaoId = generateUniqueId()
  const subcategoryNaoFiccaoId = generateUniqueId()
  const subcategoryPS5Id = generateUniqueId()
  const subcategoryXboxId = generateUniqueId()
  const subcategoryMasculinoId = generateUniqueId()
  const subcategoryFemininoId = generateUniqueId()

  await db.insert(subcategories).values([
    { id: subcategoryNutricaoId, name: "Nutrição", slug: "nutricao", categoryId: categoryEbooksId },
    { id: subcategoryFinancasId, name: "Finanças Pessoais", slug: "financas-pessoais", categoryId: categoryEbooksId },
    { id: subcategoryMarketingId, name: "Marketing Digital", slug: "marketing-digital", categoryId: categoryCursosId },
    { id: subcategoryCulinariaId, name: "Culinária", slug: "culinaria", categoryId: categoryCursosId },
    { id: subcategoryDecoracaoId, name: "Decoração", slug: "decoracao", categoryId: categoryProdutosCasaId },
    { id: subcategoryLimpezaId, name: "Limpeza", slug: "limpeza", categoryId: categoryProdutosCasaId },
    { id: subcategorySmartphonesId, name: "Smartphones", slug: "smartphones", categoryId: categoryEletronicosId },
    { id: subcategoryNotebooksId, name: "Notebooks", slug: "notebooks", categoryId: categoryEletronicosId },
    { id: subcategoryWheyId, name: "Whey Protein", slug: "whey-protein", categoryId: categorySuplementosId },
    { id: subcategoryCreatinaId, name: "Creatina", slug: "creatina", categoryId: categorySuplementosId },
    { id: subcategoryFiccaoId, name: "Ficção", slug: "ficcao", categoryId: categoryLivrosFisicosId },
    { id: subcategoryNaoFiccaoId, name: "Não Ficção", slug: "nao-ficcao", categoryId: categoryLivrosFisicosId },
    { id: subcategoryPS5Id, name: "PlayStation 5", slug: "ps5", categoryId: categoryJogosVideogameId },
    { id: subcategoryXboxId, name: "Xbox Series X", slug: "xbox-series-x", categoryId: categoryJogosVideogameId },
    { id: subcategoryMasculinoId, name: "Masculino", slug: "masculino", categoryId: categoryPerfumesId },
    { id: subcategoryFemininoId, name: "Feminino", slug: "feminino", categoryId: categoryPerfumesId },
  ])
  console.log("Subcategorias criadas.")

  // Links
  await db.insert(links).values([
    { url: "https://amzn.to/ebook-nutricao-1", subcategoryId: subcategoryNutricaoId, clicks: 15 },
    { url: "https://amzn.to/ebook-nutricao-2", subcategoryId: subcategoryNutricaoId, clicks: 22 },
    { url: "https://amzn.to/ebook-nutricao-3", subcategoryId: subcategoryNutricaoId, clicks: 8 },
    { url: "https://amzn.to/ebook-financas-1", subcategoryId: subcategoryFinancasId, clicks: 30 },
    { url: "https://amzn.to/ebook-financas-2", subcategoryId: subcategoryFinancasId, clicks: 12 },
    { url: "https://amzn.to/curso-marketing-1", subcategoryId: subcategoryMarketingId, clicks: 45 },
    { url: "https://amzn.to/curso-marketing-2", subcategoryId: subcategoryMarketingId, clicks: 18 },
    { url: "https://amzn.to/curso-culinaria-1", subcategoryId: subcategoryCulinariaId, clicks: 25 },
    { url: "https://amzn.to/decoracao-item-1", subcategoryId: subcategoryDecoracaoId, clicks: 10 },
    { url: "https://amzn.to/limpeza-produto-1", subcategoryId: subcategoryLimpezaId, clicks: 5 },
    { url: "https://amzn.to/smartphone-modelo-a", subcategoryId: subcategorySmartphonesId, clicks: 50 },
    { url: "https://amzn.to/smartphone-modelo-b", subcategoryId: subcategorySmartphonesId, clicks: 35 },
    { url: "https://amzn.to/notebook-gamer", subcategoryId: subcategoryNotebooksId, clicks: 28 },
    { url: "https://amzn.to/whey-protein-marca-x", subcategoryId: subcategoryWheyId, clicks: 60 },
    { url: "https://amzn.to/creatina-marca-y", subcategoryId: subcategoryCreatinaId, clicks: 40 },
    { url: "https://amzn.to/livro-ficcao-a", subcategoryId: subcategoryFiccaoId, clicks: 17 },
    { url: "https://amzn.to/livro-nao-ficcao-b", subcategoryId: subcategoryNaoFiccaoId, clicks: 20 },
    { url: "https://amzn.to/ps5-console", subcategoryId: subcategoryPS5Id, clicks: 70 },
    { url: "https://amzn.to/xbox-series-x-console", subcategoryId: subcategoryXboxId, clicks: 55 },
    { url: "https://amzn.to/perfume-masculino-1", subcategoryId: subcategoryMasculinoId, clicks: 14 },
    { url: "https://amzn.to/perfume-feminino-1", subcategoryId: subcategoryFemininoId, clicks: 9 },
    { url: "https://amzn.to/ebook-nutricao-4", subcategoryId: subcategoryNutricaoId, clicks: 10 },
    { url: "https://amzn.to/ebook-nutricao-5", subcategoryId: subcategoryNutricaoId, clicks: 18 },
    { url: "https://amzn.to/ebook-financas-3", subcategoryId: subcategoryFinancasId, clicks: 25 },
    { url: "https://amzn.to/curso-marketing-3", subcategoryId: subcategoryMarketingId, clicks: 30 },
    { url: "https://amzn.to/decoracao-item-2", subcategoryId: subcategoryDecoracaoId, clicks: 7 },
    { url: "https://amzn.to/smartphone-modelo-c", subcategoryId: subcategorySmartphonesId, clicks: 42 },
    { url: "https://amzn.to/whey-protein-marca-y", subcategoryId: subcategoryWheyId, clicks: 50 },
    { url: "https://amzn.to/livro-ficcao-c", subcategoryId: subcategoryFiccaoId, clicks: 11 },
    { url: "https://amzn.to/ps5-jogo-a", subcategoryId: subcategoryPS5Id, clicks: 33 },
  ])
  console.log("Links criados.")

  console.log("Seed do banco de dados concluído!")
}

seed().catch((err) => {
  console.error("Erro durante o seed do banco de dados:", err)
  process.exit(1)
})
