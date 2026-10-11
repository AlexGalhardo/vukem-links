import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { requireSession } from "@/lib/session";

// Manual health checks run inside server actions of these pages.
export const maxDuration = 300;

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
	const session = await requireSession();
	return (
		<>
			<Nav email={session.user.email} />
			<main className="mx-auto flex max-w-7xl flex-col gap-3 p-4">{children}</main>
		</>
	);
}
