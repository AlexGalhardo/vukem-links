import { redirect } from "next/navigation";

// An address that is not a page goes to the start page (which sends a visitor without a session to /login).
// /link and the API keep their own 404 answers: they are not pages.
export default function NotFound(): never {
	redirect("/");
}
