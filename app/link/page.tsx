"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRandomLinkBySubcategoryId, incrementLinkClicks } from "@/app/actions"; // Importar das actions

// Componente interno que usa useSearchParams
function LinkRedirectContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const id = searchParams.get("id");

	useEffect(() => {
		async function handleRedirect() {
			try {
				// Se o ID não for fornecido, redireciona para a home
				if (!id) {
					console.log("Missing subcategory ID parameter.");
					router.push("/");
					return;
				}

				console.log("Searching for link with subcategory ID:", id);
				const randomLink = await getRandomLinkBySubcategoryId(id);

				if (!randomLink) {
					console.log("No link found for subcategory ID:", id);
					router.push("/");
					return;
				}

				console.log("Found link:", randomLink.url);

				// Increment clicks count via Server Action
				await incrementLinkClicks(randomLink.id);

				// Redirect to the affiliate link
				window.location.href = randomLink.url;
			} catch (error) {
				console.error("Error redirecting link:", error);
				router.push("/");
			}
		}

		handleRedirect();
	}, [id, router]);

	// Mostrar loading enquanto processa
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
				<p className="mt-4 text-gray-600">Redirecionando...</p>
			</div>
		</div>
	);
}

// Componente de loading para o Suspense
function LoadingFallback() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
				<p className="mt-4 text-gray-600">Carregando...</p>
			</div>
		</div>
	);
}

// Componente principal que envolve com Suspense
export default function LinkRedirectPage() {
	return (
		<Suspense fallback={<LoadingFallback />}>
			<LinkRedirectContent />
		</Suspense>
	);
}
