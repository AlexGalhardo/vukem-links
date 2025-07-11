import { NextResponse } from "next/server";
import { getCategories, createCategory } from "@/lib/database";

export async function GET() {
	try {
		const categories = await getCategories();
		return NextResponse.json(categories);
	} catch (error) {
		console.error("Error fetching categories:", error);
		return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const { name, slug, masterCategoryId } = await request.json();

		if (!name || !slug || !masterCategoryId) {
			return NextResponse.json({ error: "Name, slug and masterCategoryId are required" }, { status: 400 });
		}

		const category = await createCategory({ name, slug, masterCategoryId });
		return NextResponse.json(category);
	} catch (error) {
		console.error("Error creating category:", error);
		return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
	}
}
