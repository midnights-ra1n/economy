import { currentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { statementFile } from "@/lib/reports";

/** GET /releves/:id: the stored PDF, shown in the browser (or downloaded with ?download). Owner only. */
export async function GET(request: Request, ctx: RouteContext<"/releves/[id]">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const file = statementFile(user.id, Number((await ctx.params).id), await getLocale());
  if (!file) return new Response("Not found", { status: 404 });
  const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
