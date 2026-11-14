import { createInertiaApp } from "@inertiajs/react";

import DashboardLayout from "./layouts/DashboardLayout";
import GuestLayout from "./layouts/GuestLayout";

// Dark mode follows the "dark" class on <html>: the saved choice
// (localStorage.theme = "dark" | "light") or the system preference.
try {
  const theme = localStorage.getItem("theme");
  const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch {
  // Storage can be blocked (private mode): keep the default theme.
}

// The @inertiajs/vite plugin resolves pages from ./pages and mounts the app.
// The login and the error page are the only ones without the sidebar.
createInertiaApp({
  layout: (name: string) => (name === "Auth/Login" || name === "Error" ? GuestLayout : DashboardLayout),
  nonce: document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce,
  progress: { color: "#737373" },
}).finally(() => {
  document.documentElement.removeAttribute("data-hydrating");
});
