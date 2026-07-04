import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { IMAGE_MIME, resolveFile } from "@/lib/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve a cover image by fileId (read-only; no audio — spec §18). */
export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const resolved = await resolveFile(fileId);
  if (!resolved || resolved.fileType !== "IMAGE") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const buf = await readFile(resolved.abs);
    const mime = IMAGE_MIME[resolved.extension] ?? "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    // disk not mounted or file unreadable
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
}
