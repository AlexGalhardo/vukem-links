import { Link, router, usePage } from "@inertiajs/react";
import { type ReactNode, useEffect, useState } from "react";

import { Folder, LayoutDashboard, Link2, LogOut, Menu, Moon, Sun, X } from "../components/icons";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import type { SharedProps } from "../page-props";

const nav = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard, match: (url: string) => url === "/" },
  { href: "/links", label: "Links", icon: Link2, match: (url: string) => url.startsWith("/links") },
  { href: "/projects", label: "Projetos", icon: Folder, match: (url: string) => url.startsWith("/projects") },
];

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  return [
    dark,
    () => {
      const next = !dark;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {
        // Storage can be blocked (private mode): the choice lasts for this page only.
      }
      setDark(next);
    },
  ];
}

// Toast shows the one-time flash message of the last action, then fades out.
function Toast() {
  const page = usePage<SharedProps>();
  const success = typeof page.flash?.success === "string" ? page.flash.success : undefined;
  const error = typeof page.flash?.error === "string" ? page.flash.error : undefined;
  const message = error ?? success;
  const [shown, setShown] = useState<string | undefined>();

  useEffect(() => {
    if (!message) return;
    setShown(message);
    const timer = setTimeout(() => setShown(undefined), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!shown) return null;
  return (
    <div
      role="status"
      className={cn(
        "fixed right-4 bottom-4 z-50 max-w-sm rounded-md border bg-card px-4 py-3 text-sm shadow-lg",
        error && "border-destructive text-destructive",
      )}
    >
      {shown}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const page = usePage<SharedProps>();
  const url = page.url.split("?")[0];
  const [open, setOpen] = useState(false);
  const [dark, toggleTheme] = useTheme();

  const sidebar = (
    <nav aria-label="Principal" className="flex h-full flex-col gap-1 p-3">
      <Link href="/" className="mb-3 flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
        <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
          <Link2 width={14} height={14} />
        </span>
        {page.props.appName}
      </Link>
      {nav.map((item) => {
        const active = item.match(url);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon />
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto grid gap-2 border-t pt-3">
        <p className="truncate px-2 text-xs text-muted-foreground">{page.props.auth?.user?.email}</p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="flex-1 justify-start" onClick={toggleTheme}>
            {dark ? <Sun /> : <Moon />}
            {dark ? "Tema claro" : "Tema escuro"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.post("/logout")} aria-label="Sair">
            <LogOut />
            Sair
          </Button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r bg-sidebar lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background px-3 py-2 lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <span className="text-sm font-semibold">{page.props.appName}</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-60 border-r bg-sidebar">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar menu"
              className="absolute top-2 right-2"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 p-4 lg:p-6">
        <div className="mx-auto grid max-w-6xl gap-4">{children}</div>
      </main>
      <Toast />
    </div>
  );
}
