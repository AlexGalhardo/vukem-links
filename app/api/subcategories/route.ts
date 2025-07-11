import { NextResponse } from "next/server";
import { getSubcategories, createSubcategory } from "@/lib/database";

export async function GET() {
	try {
		const subcategories = await getSubcategories();
		return NextResponse.json(subcategories);
	} catch (error) {
		console.error("Error fetching subcategories:", error);
		return NextResponse.json({ error: "Failed to fetch subcategories" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const { name, slug, categoryId } = await request.json();

		if (!name || !slug || !categoryId) {
			return NextResponse.json({ error: "Name, slug and categoryId are required" }, { status: 400 });
		}

		const subcategory = await createSubcategory({ name, slug, categoryId });
		return NextResponse.json(subcategory);
	} catch (error) {
		console.error("Error creating subcategory:", error);
		return NextResponse.json({ error: "Failed to create subcategory" }, { status: 500 });
	}
}
