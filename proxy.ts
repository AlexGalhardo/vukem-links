import { type NextRequest, NextResponse } from "next/server";

// First path segment of everything the app serves. `link` and `api` answer their own 404s: they are not pages.
const KNOWN = new Set(["", "login", "links", "projects", "link", "health", "api"]);

// An address that is not a page goes to the start page, which sends a visitor without a session to /login.
// This is not an access check: every page, action and route still verifies the session itself.
export default function proxy(request: NextRequest): NextResponse | undefined {
	const first = request.nextUrl.pathname.split("/")[1] ?? "";
	// Files (favicon, robots.txt) are not pages.
	if (KNOWN.has(first) || first.includes(".")) return undefined;
	return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
	matcher: ["/((?!_next/).*)"],
};
