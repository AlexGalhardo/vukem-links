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
		<html lang="pt-BR">
			<body className="font-sans">
				<div className="app-root">
					<Providers>{children}</Providers>
				</div>
			</body>
		</html>
	);
}
