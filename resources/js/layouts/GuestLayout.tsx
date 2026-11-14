import type { ReactNode } from "react";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center p-4">{children}</main>;
}
