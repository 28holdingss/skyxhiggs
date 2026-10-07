import { requireActionAuth } from "@/lib/action-auth";
import { StudioError, toErrorResponse } from "@/lib/errors";
import { normalizeUploadType, uploadInput } from "@/lib/higgsfield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Fetch a public image URL and store it on Higgsfield.
 * ChatGPT Actions use this instead of multipart upload.
 */
export async function POST(request: Request) {
  try {
    requireActionAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StudioError("Send JSON with imageUrl.", 400);
    }

    const imageUrl =
      body && typeof body === "object" && typeof (body as { imageUrl?: unknown }).imageUrl === "string"
        ? (body as { imageUrl: string }).imageUrl.trim()
        : "";

    if (!imageUrl || imageUrl.length > 2000) {
      throw new StudioError("Provide a public https imageUrl.", 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new StudioError("Provide a public https imageUrl.", 400);
    }
    if (parsed.protocol !== "https:") {
      throw new StudioError("imageUrl must be https.", 400);
    }

    let remote: Response;
    try {
      remote = await fetch(imageUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
        headers: { Accept: "image/*,*/*" },
      });
    } catch {
      throw new StudioError("Could not download that image.", 502);
    }

    if (!remote.ok) {
      throw new StudioError("Could not download that image.", 502);
    }

    const bytes = new Uint8Array(await remote.arrayBuffer());
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new StudioError("Images need to be under 20 MB.", 400);
    }

    const headerType = remote.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const name = parsed.pathname.split("/").pop() || "image.jpg";
    const contentType = normalizeUploadType(headerType, name);
    if (!contentType || contentType === "video/mp4") {
      throw new StudioError("Use a JPEG, PNG, WebP, or GIF image URL.", 400);
    }

    const publicUrl = await uploadInput(bytes, contentType);
    return Response.json({ publicUrl });
  } catch (error) {
    return toErrorResponse(error);
  }
}
