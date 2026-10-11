"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const ITEMS = [
	{ href: "/", label: "Visão geral" },
	{ href: "/links", label: "Links" },
	{ href: "/projects", label: "Projetos" },
];

export function Nav({ email }: { email: string }): ReactNode {
	const pathname = usePathname();
	const router = useRouter();
	return (
		<header className="sticky top-0 z-30 border-b border-line bg-panel">
			<div className="mx-auto flex h-11 max-w-7xl items-center gap-1 px-4">
				<span className="mr-3 font-semibold">Links de afiliados</span>
				<nav aria-label="Principal" className="flex gap-1">
					{ITEMS.map((item) => {
						const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
						return (
							<Link
								key={item.href}
								href={item.href}
								aria-current={active ? "page" : undefined}
								className={`rounded-md px-2.5 py-1 ${active ? "bg-raised font-medium" : "text-muted hover:text-fg"}`}
							>
								{item.label}
							</Link>
						);
					})}
				</nav>
				<span className="ml-auto hidden text-muted sm:inline">{email}</span>
				<Button variant="ghost" onClick={() => authClient.signOut().then(() => router.replace("/login"))}>
					Sair
				</Button>
			</div>
		</header>
	);
}
