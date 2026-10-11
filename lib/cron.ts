import { timingSafeEqual } from "node:crypto";

/** True when the request carries `Authorization: Bearer <secret>`. An unset secret never matches. */
export function hasBearer(request: Request, secret: string | undefined): boolean {
	const given = Buffer.from(request.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${secret}`);
	return !!secret && given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` (see vercel.json). */
export function isCronRequest(request: Request): boolean {
	return hasBearer(request, process.env.CRON_SECRET);
}
