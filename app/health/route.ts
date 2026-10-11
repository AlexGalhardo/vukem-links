import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

// Public and readable from any origin: the sites ask it before trusting the redirect, and fall back to the
// store address when it does not answer. It touches the database because the redirect cannot work without it.
export async function GET(): Promise<Response> {
	try {
		await db.run(sql`select 1`);
		return Response.json({ status: "ok" }, { headers });
	} catch {
		return Response.json({ status: "down" }, { status: 503, headers });
	}
}
