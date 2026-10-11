import { timingSafeEqual } from "node:crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` (see vercel.json). Without the secret set, nothing passes. */
export function isCronRequest(request: Request): boolean {
	const secret = process.env.CRON_SECRET;
	const given = Buffer.from(request.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${secret}`);
	return !!secret && given.length === expected.length && timingSafeEqual(given, expected);
}
