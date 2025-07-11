import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "@/db/schema"

// Para uso em ambiente de desenvolvimento local com Turso CLI
// Certifique-se de ter as variáveis de ambiente configuradas
// TURSO_DATABASE_URL e TURSO_AUTH_TOKEN
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

export const db = drizzle(client, { schema })
