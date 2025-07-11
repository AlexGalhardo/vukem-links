"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Check, Eye, EyeOff, X } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginClient() {
	const router = useRouter();

	const { data: session } = useSession();

	useEffect(() => {
		if (session?.user) router.push("/");
	}, [session]);

	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [password, setPassword] = useState("");
	const [showPasswordCriteria, setShowPasswordCriteria] = useState(false);

	const [passwordCriteria, setPasswordCriteria] = useState({
		length: false,
		uppercase: false,
		lowercase: false,
		number: false,
		special: false,
	});

	useEffect(() => {
		if (session?.user?.id) {
			router.push(`/`);
		}
	}, [session]);

	useEffect(() => {
		setPasswordCriteria({
			length: password.length >= 8,
			uppercase: /[A-Z]/.test(password),
			lowercase: /[a-z]/.test(password),
			number: /[0-9]/.test(password),
			special: /[^A-Za-z0-9]/.test(password),
		});
	}, [password]);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			const result = await signIn("credentials", {
				redirect: false,
				email,
				password,
			});

			if (result?.error) {
				if (result.error.includes("Esse usuário não possui senha cadastrada")) {
					setError(
						"Esse usuário não possui senha cadastrada. Logue com sua conta Google e crie uma senha ou resete sua senha.",
					);
				} else {
					setError("Email e/ou senha incorretos");
				}
				setLoading(false);
				return;
			}
		} catch (error) {
			setError("Ocorreu um erro ao fazer login. Tente novamente.");
		} finally {
			setLoading(false);
		}
	};

	const CriteriaItem = ({ met, text }: { met: boolean; text: string }) => (
		<div className="flex items-center space-x-2">
			{met ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-red-500" />}
			<span className={`text-sm ${met ? "text-green-500" : "text-gray-400"}`}>{text}</span>
		</div>
	);

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100  flex items-center justify-center p-4">
			<Card className="w-full max-w-md dark:bg-white text-black">
				<CardContent className="space-y-6 space-x-6">
					<form onSubmit={handleLogin} className="space-y-10 py-6 px-6">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								className="dark:bg-white dark:text-black"
								id="email"
								type="email"
								placeholder=""
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoFocus
							/>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="password">Senha</Label>
							</div>
							<div className="relative">
								<Input
									className="dark:bg-white dark:text-black"
									id="password"
									type={showPassword ? "text" : "password"}
									value={password}
									onChange={(e) => {
										const value = e.target.value;
										setPassword(value);
										setShowPasswordCriteria(value.length > 0);
									}}
									required
								/>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
									onClick={() => setShowPassword(!showPassword)}
								>
									{showPassword ? (
										<EyeOff className="h-4 w-4 text-gray-400" />
									) : (
										<Eye className="h-4 w-4 text-gray-400" />
									)}
								</Button>
							</div>
							{showPasswordCriteria && (
								<div className="mt-2 p-3 rounded-md">
									<p className="text-sm text-gray-600 mb-2">Sua senha deve conter:</p>
									<div className="space-y-1">
										<CriteriaItem met={passwordCriteria.length} text="Pelo menos 8 caracteres" />
										<CriteriaItem
											met={passwordCriteria.uppercase}
											text="Pelo menos 1 letra maiúscula (A-Z)"
										/>
										<CriteriaItem
											met={passwordCriteria.lowercase}
											text="Pelo menos 1 letra minúscula (a-z)"
										/>
										<CriteriaItem met={passwordCriteria.number} text="Pelo menos 1 número (0-9)" />
										<CriteriaItem
											met={passwordCriteria.special}
											text="Pelo menos 1 caractere especial (!@#$...)"
										/>
									</div>
								</div>
							)}
						</div>

						{error && error !== "Callback" && (
							<Alert variant="destructive" className="font-bold text-center bg-red-300 text-red-900">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<Button
							type="submit"
							className="text-white font-bold w-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center"
							disabled={loading}
						>
							{loading ? (
								<>
									<span className="ml-2 h-5 w-5 border-white rounded-full animate-spin"></span>
									Processando...
								</>
							) : (
								<>
									Entrar
									<ArrowRight className="ml-2 h-5 w-5" />
								</>
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
