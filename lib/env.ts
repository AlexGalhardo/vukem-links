// Shape of the environment. Checked by scripts/check-env.ts at the start of every build: a malformed value always
// fails the build, and a missing essential value fails the production build. No I/O here.
import { z } from "zod";

/** Every variable is optional here; `ESSENTIAL` says which ones production cannot run without. */
export const envSchema = z
	.object({
		TURSO_DATABASE_URL: z
			.string()
			.regex(/^(file:|libsql:\/\/|https:\/\/)\S+$/, "file:, libsql:// ou https://")
			.optional(),
		TURSO_AUTH_TOKEN: z.string().min(20, "token com 20 caracteres ou mais").optional(),
		BETTER_AUTH_SECRET: z.string().min(32, "segredo com 32 caracteres ou mais").optional(),
		BETTER_AUTH_URL: z.url({ protocol: /^https?$/, error: "endereço http(s)" }).optional(),
		CRON_SECRET: z.string().min(16, "segredo com 16 caracteres ou mais").optional(),
		LINKS_API_KEY: z.string().min(32, "chave com 32 caracteres ou mais").optional(),
		ADMIN_EMAIL: z.email("e-mail").optional(),
		ADMIN_PASSWORD: z.string().min(8, "senha com 8 caracteres ou mais").optional(),
		TELEGRAM_BOT_HTTP_TOKEN: z
			.string()
			.regex(/^\d+:[\w-]{30,}$/, "token de bot do Telegram")
			.optional(),
		TELEGRAM_BOT_CHANNEL_ID: z
			.string()
			.regex(/^(-?\d+|@\w+)$/, "id numérico ou @canal")
			.optional(),
	})
	.refine((env) => !env.TELEGRAM_BOT_HTTP_TOKEN === !env.TELEGRAM_BOT_CHANNEL_ID, {
		message: "defina o token e o canal juntos, ou nenhum dos dois",
		path: ["TELEGRAM_BOT_HTTP_TOKEN"],
	});

export const ESSENTIAL = [
	"TURSO_DATABASE_URL",
	"TURSO_AUTH_TOKEN",
	"BETTER_AUTH_SECRET",
	"BETTER_AUTH_URL",
	"CRON_SECRET",
	"LINKS_API_KEY",
] as const satisfies readonly (keyof z.infer<typeof envSchema>)[];

/**
 * Problems of an environment, one line each, naming the variable and never its value.
 * An empty string counts as not set, which is how .env.example ships.
 */
export function envProblems(env: Record<string, string | undefined>, production: boolean): string[] {
	const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
	const parsed = envSchema.safeParse(present);
	const problems = parsed.success
		? []
		: parsed.error.issues.map((issue) => `${issue.path.join(".")}: valor inválido (${issue.message})`);
	if (!production) return problems;
	for (const name of ESSENTIAL) if (!present[name]) problems.push(`${name}: obrigatória em produção e não definida`);
	// A local file database cannot work on Vercel, where the file system is read-only and not shared.
	if (present.TURSO_DATABASE_URL?.startsWith("file:"))
		problems.push("TURSO_DATABASE_URL: produção exige um banco remoto (libsql:// ou https://)");
	return problems;
}
