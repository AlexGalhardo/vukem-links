import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../db/schema";
import { config } from "dotenv";
import { createUser } from "@/db/users.repository";

config({ path: ".env.local" });

const client = createClient({
	url: process.env.TURSO_DATABASE_URL!,
	authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client, { schema });

async function seed() {
	console.log("Iniciando seed do banco de dados...");

	await db.delete(schema.links);
	await db.delete(schema.subcategories);
	await db.delete(schema.categories);
	await db.delete(schema.masterCategories);
	console.log("Dados existentes limpos.");

	const masterCategoryDigital = await db
		.insert(schema.masterCategories)
		.values({ name: "Digital", slug: "digital" })
		.returning();
	const masterCategoryPhysical = await db
		.insert(schema.masterCategories)
		.values({ name: "Físico", slug: "fisico" })
		.returning();
	console.log("Master Categories criadas.");

	const categoryEbooks = await db
		.insert(schema.categories)
		.values({
			name: "Ebooks",
			slug: "ebooks",
			masterCategoryId: masterCategoryDigital[0].id,
		})
		.returning();
	const categorySoftware = await db
		.insert(schema.categories)
		.values({
			name: "Software",
			slug: "software",
			masterCategoryId: masterCategoryDigital[0].id,
		})
		.returning();
	const categoryProdutosCasa = await db
		.insert(schema.categories)
		.values({
			name: "Produtos para Casa",
			slug: "produtos-casa",
			masterCategoryId: masterCategoryPhysical[0].id,
		})
		.returning();
	const categoryEletronicos = await db
		.insert(schema.categories)
		.values({
			name: "Eletrônicos",
			slug: "eletronicos",
			masterCategoryId: masterCategoryPhysical[0].id,
		})
		.returning();
	console.log("Categories criadas.");

	const subcategoryNutricao = await db
		.insert(schema.subcategories)
		.values({
			name: "Nutrição",
			slug: "nutricao",
			categoryId: categoryEbooks[0].id,
			bitlyUrl: "https://bit.ly/ebook-nutricao-v0",
		})
		.returning();
	const subcategoryFinancas = await db
		.insert(schema.subcategories)
		.values({
			name: "Finanças Pessoais",
			slug: "financas-pessoais",
			categoryId: categoryEbooks[0].id,
			bitlyUrl: "https://bit.ly/ebook-financas-v0",
		})
		.returning();
	const subcategoryProdutividade = await db
		.insert(schema.subcategories)
		.values({
			name: "Produtividade",
			slug: "produtividade",
			categoryId: categorySoftware[0].id,
		})
		.returning();
	const subcategoryLimpeza = await db
		.insert(schema.subcategories)
		.values({
			name: "Limpeza",
			slug: "limpeza",
			categoryId: categoryProdutosCasa[0].id,
		})
		.returning();
	const subcategorySmartphones = await db
		.insert(schema.subcategories)
		.values({
			name: "Smartphones",
			slug: "smartphones",
			categoryId: categoryEletronicos[0].id,
		})
		.returning();
	console.log("Subcategories criadas.");

	const famousLinks = [
		"https://google.com",
		"https://facebook.com",
		"https://x.com",
		"https://wikipedia.org",
		"https://reddit.com",
		"https://youtube.com",
		"https://instagram.com",
		"https://twitter.com",
		"https://github.com",
		"https://linkedin.com",
		"https://amazon.com",
		"https://netflix.com",
		"https://apple.com",
		"https://microsoft.com",
		"https://stackoverflow.com",
	];

	function getRandomLinks(min: number, max: number): string[] {
		const count = Math.floor(Math.random() * (max - min + 1)) + min;
		const shuffled = [...famousLinks].sort(() => 0.5 - Math.random());
		return shuffled.slice(0, count);
	}

	const nutricaoLinks = getRandomLinks(3, 5);
	for (const [index, url] of nutricaoLinks.entries()) {
		await db.insert(schema.links).values({
			url,
			subcategoryId: subcategoryNutricao[0].id,
			clicks: Math.floor(Math.random() * 50) + 1,
		});
	}

	const financasLinks = getRandomLinks(3, 4);
	for (const [index, url] of financasLinks.entries()) {
		await db.insert(schema.links).values({
			url,
			subcategoryId: subcategoryFinancas[0].id,
			clicks: Math.floor(Math.random() * 30) + 1,
		});
	}

	const produtividadeLinks = getRandomLinks(4, 6);
	for (const [index, url] of produtividadeLinks.entries()) {
		await db.insert(schema.links).values({
			url,
			subcategoryId: subcategoryProdutividade[0].id,
			clicks: Math.floor(Math.random() * 40) + 1,
		});
	}

	const limpezaLinks = getRandomLinks(3, 4);
	for (const [index, url] of limpezaLinks.entries()) {
		await db.insert(schema.links).values({
			url,
			subcategoryId: subcategoryLimpeza[0].id,
			clicks: Math.floor(Math.random() * 25) + 1,
		});
	}

	const smartphonesLinks = getRandomLinks(7, 10);
	for (const [index, url] of smartphonesLinks.entries()) {
		await db.insert(schema.links).values({
			url,
			subcategoryId: subcategorySmartphones[0].id,
			clicks: Math.floor(Math.random() * 60) + 1,
		});
	}

	console.log("Links criados.");

	await createUser('admin@gmail.com', 'adminBR@123', 'Admin');

	console.log("Seed do banco de dados concluído!");
}

seed().catch((err) => {
	console.error("Erro durante o seed:", err);
	process.exit(1);
});
