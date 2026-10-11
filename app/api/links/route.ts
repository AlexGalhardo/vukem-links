import { listLinks } from "@/lib/data";
import { getSession } from "@/lib/session";

export async function GET(): Promise<Response> {
	if (!(await getSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
	return Response.json(await listLinks());
}
