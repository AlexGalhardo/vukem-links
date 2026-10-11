import { isCronRequest } from "@/lib/cron";
import { checkLinks } from "@/lib/health";

export const maxDuration = 300;

// Hourly health check of the links longest without one (see vercel.json). Links that die are reported on Telegram.
export async function GET(request: Request): Promise<Response> {
	if (!isCronRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
	return Response.json(await checkLinks());
}
