"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function EyeIcon({ crossed }: { crossed: boolean }): ReactNode {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
			{crossed && <path d="m3 3 18 18" />}
		</svg>
	);
}

export default function LoginPage(): ReactNode {
	const router = useRouter();
	const [showPassword, setShowPassword] = useState(false);
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
				<TextField
					label="Senha"
					name="password"
					type={showPassword ? "text" : "password"}
					autoComplete="current-password"
					required
					trailing={
						<button
							type="button"
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							aria-pressed={showPassword}
							onClick={() => setShowPassword((shown) => !shown)}
							className="grid h-7 w-8 place-items-center rounded-md text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
						>
							<EyeIcon crossed={showPassword} />
						</button>
					}
				/>
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
