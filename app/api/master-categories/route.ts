import { NextResponse } from "next/server";
import { getMasterCategories, createMasterCategory } from "@/lib/database";

export async function GET() {
	try {
		const masterCategories = await getMasterCategories();
		return NextResponse.json(masterCategories);
	} catch (error) {
		console.error("Error fetching master categories:", error);
		return NextResponse.json({ error: "Failed to fetch master categories" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const { name, slug } = await request.json();

		if (!name || !slug) {
			return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
		}

		const masterCategory = await createMasterCategory({ name, slug });
		return NextResponse.json(masterCategory);
	} catch (error) {
		console.error("Error creating master category:", error);
		return NextResponse.json({ error: "Failed to create master category" }, { status: 500 });
	}
}
