"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { Button, TextField } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export default function LoginPage(): ReactNode {
	const router = useRouter();
	const login = useMutation({
		mutationFn: async (form: FormData) => {
			const { error } = await authClient.signIn.email({
				email: String(form.get("email")),
				password: String(form.get("password")),
			});
			if (error)
				throw new Error(
					error.status === 429 ? "Muitas tentativas. Aguarde um instante." : "E-mail ou senha inválidos.",
				);
		},
		onSuccess: () => {
			router.replace("/");
			router.refresh();
		},
	});

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		login.mutate(new FormData(event.currentTarget));
	}

	return (
		<main className="grid min-h-dvh place-items-center p-4">
			<form
				onSubmit={submit}
				className="flex w-full max-w-xs flex-col gap-3 rounded-lg border border-line bg-panel p-5"
			>
				<h1 className="text-sm font-semibold">Links de afiliados</h1>
				<TextField label="E-mail" name="email" type="email" autoComplete="username" required />
				<TextField label="Senha" name="password" type="password" autoComplete="current-password" required />
				{login.error && (
					<p role="alert" className="text-xs text-bad">
						{login.error.message}
					</p>
				)}
				<Button type="submit" variant="primary" disabled={login.isPending}>
					{login.isPending ? "Entrando…" : "Entrar"}
				</Button>
			</form>
		</main>
	);
}
