import { isCronRequest } from "@/lib/cron";
import { getClicksByProject } from "@/lib/data";
import { weeklyReportMessage } from "@/lib/links";
import { notify } from "@/lib/telegram";

const DAYS = 7;

// Weekly click report sent to Telegram (Sunday 17:00 in Brasília, see vercel.json).
export async function GET(request: Request): Promise<Response> {
	if (!isCronRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
	const projects = await getClicksByProject(DAYS);
	await notify(weeklyReportMessage(projects, DAYS));
	return Response.json({ days: DAYS, projects });
}
