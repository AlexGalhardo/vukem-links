import { NextResponse } from "next/server"
import { getTotalRedirects } from "@/lib/database"

export async function GET() {
  try {
    const total = await getTotalRedirects()
    return NextResponse.json({ total })
  } catch (error) {
    console.error("Error fetching total redirects:", error)
    return NextResponse.json({ error: "Failed to fetch total redirects" }, { status: 500 })
  }
}
