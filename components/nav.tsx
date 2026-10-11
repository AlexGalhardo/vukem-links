"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const ITEMS = [
	{ href: "/", label: "Visão geral" },
	{ href: "/links", label: "Links" },
	{ href: "/projects", label: "Projetos" },
];

// Dark is the default; app/layout.tsx restores the saved choice before first paint.
function toggleTheme(): void {
	const root = document.documentElement;
	const next = root.dataset.theme === "light" ? "dark" : "light";
	root.dataset.theme = next;
	localStorage.setItem("theme", next);
}

export function Nav({ email }: { email: string }): ReactNode {
	const pathname = usePathname();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	return (
		<header className="sticky top-0 z-30 border-b border-line bg-panel">
			<div className="relative mx-auto flex h-11 max-w-7xl items-center gap-1 px-4">
				<span className="mr-3 font-semibold">Links de afiliados</span>
				<nav
					id="main-nav"
					aria-label="Principal"
					className={`${open ? "flex" : "hidden"} absolute inset-x-0 top-full flex-col gap-1 border-b border-line bg-panel p-2 sm:static sm:flex sm:flex-row sm:border-0 sm:p-0`}
				>
					{ITEMS.map((item) => {
						const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
						return (
							<Link
								key={item.href}
								href={item.href}
								aria-current={active ? "page" : undefined}
								onClick={() => setOpen(false)}
								className={`rounded-md px-2.5 py-1 ${active ? "bg-raised font-medium" : "text-muted hover:text-fg"}`}
							>
								{item.label}
							</Link>
						);
					})}
				</nav>
				<span className="ml-auto hidden text-muted sm:inline">{email}</span>
				<Button variant="ghost" className="ml-auto sm:ml-0" aria-label="Alternar tema" onClick={toggleTheme}>
					<svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 fill-current">
						<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5v11a5.5 5.5 0 0 1 0-11Z" />
					</svg>
				</Button>
				<Button variant="ghost" onClick={() => authClient.signOut().then(() => router.replace("/login"))}>
					Sair
				</Button>
				<Button
					variant="ghost"
					className="sm:hidden"
					aria-label="Menu"
					aria-expanded={open}
					aria-controls="main-nav"
					onClick={() => setOpen((value) => !value)}
				>
					<svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 fill-current">
						<path d="M2 3.25h12v1.5H2zm0 4h12v1.5H2zm0 4h12v1.5H2z" />
					</svg>
				</Button>
			</div>
		</header>
	);
}
