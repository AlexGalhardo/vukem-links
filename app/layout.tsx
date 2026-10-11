import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
	title: { default: "Links de afiliados", template: "%s · Links de afiliados" },
	robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
	return (
		// suppressHydrationWarning: the script below sets data-theme before React hydrates.
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static string; restores the saved theme before first paint to avoid a flash.
					dangerouslySetInnerHTML={{
						__html: 'try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch{}',
					}}
				/>
			</head>
			<body className="font-sans">
				<div className="app-root">
					<Providers>{children}</Providers>
				</div>
			</body>
		</html>
	);
}
