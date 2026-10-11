import { timingSafeEqual } from "node:crypto";
import { checkLinks } from "@/lib/health";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` (see vercel.json).
export async function GET(request: Request): Promise<Response> {
	const secret = process.env.CRON_SECRET;
	const given = Buffer.from(request.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${secret}`);
	if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected))
		return Response.json({ error: "unauthorized" }, { status: 401 });
	return Response.json(await checkLinks());
}
