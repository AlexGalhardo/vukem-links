"use client";

import { AuthProvider } from "@/context/auth-context";
import { SessionProvider } from "next-auth/react";
import type React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<AuthProvider>{children}</AuthProvider>
		</SessionProvider>
	);
}
