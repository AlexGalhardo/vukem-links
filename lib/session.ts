import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export async function getSession(): Promise<Session | null> {
	return auth.api.getSession({ headers: await headers() });
}

/** For pages and server actions: every dashboard entry point must call this. */
export async function requireSession(): Promise<Session> {
	const session = await getSession();
	if (!session) redirect("/login");
	return session;
}
