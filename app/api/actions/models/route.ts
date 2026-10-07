import { requireActionAuth } from "@/lib/action-auth";
import { toErrorResponse } from "@/lib/errors";
import { MODELS } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalog of Create models for ChatGPT (ids + framing rules). */
export async function GET(request: Request) {
  try {
    requireActionAuth(request);
    const models = MODELS.map((model) => {
      if (model.mode === "video") {
        return {
          id: model.id,
          label: model.label,
          mode: model.mode,
          durations: model.durations,
          aspects: model.aspects,
          aspectOnText: model.aspectOnText,
          aspectOnImage: model.aspectOnImage,
          usesPhoto: true,
          imageRequiresPrompt: model.imageRequiresPrompt,
          audio: model.audio,
        };
      }
      return {
        id: model.id,
        label: model.label,
        mode: model.mode,
        aspects: ["16:9", "9:16", "1:1"],
        usesPhoto: model.usesPhoto,
        audio: null,
      };
    });
    return Response.json({
      models,
      defaults: { video: "seedance-2.5", image: "soul-v2" },
      note: "When aspectOnImage is false, do not promise a chosen aspect ratio if imageUrl is set; prefer a model with aspectOnImage true for 9:16 fashion clips with a photo.",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
