import { getUserByEmail, verifyCredentials } from "@/db/users.repository";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export interface User {
	id: string;
	name: string;
	email: string;
	password: string;
	created_at: string | Date;
	updated_at: string | Date;
}

declare module "next-auth" {
	interface Session {
		user: {
			id: string;
			name?: string | null;
			email?: string | null;
			created_at?: Date | null;
			updated_at?: Date | null;
		};
	}

	interface JWT {
		id?: string;
		name?: string | null;
		email?: string | null;
		created_at?: Date | null;
		updated_at?: Date | null;
	}
}

export const authOptions: NextAuthOptions = {
	providers: [
		CredentialsProvider({
			name: "credentials",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null;
				}

				try {
					const user = await verifyCredentials(credentials.email, credentials.password);
					if (user && user.id) {
						return {
							id: user.id,
							name: user.name ?? null,
							email: user.email ?? null,
						};
					}
					return null;
				} catch (error: any) {
					if (error instanceof Error && error.message === "no_password") {
						throw new Error("This user does not have a registered password.");
					}
					return null;
				}
			},
		}),
	],
	pages: {
		signIn: "/login",
		signOut: "/login",
		error: "/login",
	},
	session: {
		strategy: "jwt",
	},
	secret: process.env.NEXTAUTH_SECRET,
	callbacks: {
		async session({ session, token }) {
			if (token) {
				session.user.id = token.id as string;
			}

			const dbUser = await getUserByEmail(token.email as string);

			if (session.user && dbUser) {
				session.user.id = dbUser?.id;
				session.user.name = dbUser?.name;
				session.user.email = dbUser?.email;
				// session.user.created_at = dbUser?.created_at;
				// session.user.updated_at = dbUser?.updated_at;
			}

			return session;
		},
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
			}

			return token;
		},
	},
};
