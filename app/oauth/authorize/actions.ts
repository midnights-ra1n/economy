"use server";

import { redirect } from "next/navigation";
import { ORIGIN, requireUser } from "@/lib/auth";
import { authorizeRedirect, checkAuthorize } from "@/lib/oauth";

/** Allow or deny: the request is checked again from the form (never trust the page that sent it). */
export async function decide(form: FormData) {
  const user = await requireUser();
  const params = Object.fromEntries([...form].flatMap(([k, v]) => (typeof v === "string" && !k.startsWith("$") ? [[k, v]] : [])));
  const req = checkAuthorize(params, ORIGIN);
  const allow = form.get("decision") === "allow";
  redirect(authorizeRedirect(req, ORIGIN, allow ? user.id : null, form.get("grant") === "write" ? "write" : "read"));
}
