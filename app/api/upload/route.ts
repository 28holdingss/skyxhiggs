import { StudioError, toErrorResponse } from "@/lib/errors";
import { normalizeUploadType, uploadInput } from "@/lib/higgsfield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new StudioError("Choose a file to upload.", 400);
    }

    const contentType = normalizeUploadType(file.type, file.name);
    if (!contentType) {
      throw new StudioError("Use a JPEG, PNG, WebP, GIF, or MP4.", 400);
    }

    const maxBytes = contentType === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      throw new StudioError(
        contentType === "video/mp4" ? "Videos need to be under 100 MB." : "Images need to be under 20 MB.",
        400,
      );
    }

    const publicUrl = await uploadInput(new Uint8Array(await file.arrayBuffer()), contentType);
    return Response.json({ publicUrl });
  } catch (error) {
    return toErrorResponse(error);
  }
}
