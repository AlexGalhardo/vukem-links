// First step of every build: refuses a malformed environment, and a production build without the essentials.
import { envProblems } from "@/lib/env";

const production = process.env.VERCEL_ENV === "production";
const problems = envProblems(process.env, production);

if (problems.length) {
	console.error(`Variáveis de ambiente com problema (${problems.length}):\n- ${problems.join("\n- ")}`);
	console.error("Veja .env.example e docs/setup.md.");
	process.exit(1);
}
console.log(`Variáveis de ambiente conferidas (${production ? "produção" : "desenvolvimento"}).`);
