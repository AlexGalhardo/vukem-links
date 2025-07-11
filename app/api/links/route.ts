import { NextResponse } from "next/server";
import { getLinks, createLink, getLinksBySubcategory } from "@/lib/database";

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const subcategoryId = searchParams.get("subcategoryId");

		if (subcategoryId) {
			const links = await getLinksBySubcategory(subcategoryId);
			return NextResponse.json(links);
		}

		const links = await getLinks();
		return NextResponse.json(links);
	} catch (error) {
		console.error("Error fetching links:", error);
		return NextResponse.json({ error: "Failed to fetch links" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const { url, subcategoryId } = await request.json();

		if (!url || !subcategoryId) {
			return NextResponse.json({ error: "URL and subcategoryId are required" }, { status: 400 });
		}

		const link = await createLink({ url, subcategoryId });
		return NextResponse.json(link);
	} catch (error) {
		console.error("Error creating link:", error);
		return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
	}
}
