import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import AdminDashboard from "@/components/AdminDashboard";

async function checkAuth() {
	const cookieStore = await cookies();
	const auth = cookieStore.get("auth");

	if (!auth || auth.value !== "authenticated") {
		redirect("/login");
	}
}

export default async function AdminPage() {
	await checkAuth();

	return <AdminDashboard />;
}
