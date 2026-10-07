import { StudioError } from "@/lib/errors";
import { findModel, type ModelId } from "@/lib/models";

export const STYLE_IDS = ["cinematic", "anime", "ad", "trailer", "cartoon"] as const;

export type StyleId = (typeof STYLE_IDS)[number];

export const STYLE_LABELS: Record<StyleId, string> = {
  cinematic: "Cinematic",
  anime: "Anime",
  ad: "Commercial",
  trailer: "Trailer",
  cartoon: "Cartoon hero",
};

const STYLE_NOTES: Record<StyleId, string> = {
  cinematic: "Shot as cinema: motivated lighting, a restrained camera move, and shallow depth.",
  anime: "Anime short: painted backgrounds, expressive motion, and graphic color.",
  ad: "Commercial: clean product focus, confident pacing, and a broadcast finish.",
  trailer: "Film trailer: dramatic reveals, a sweeping camera, and bold contrast.",
  cartoon: "Cartoon hero: bold shapes, playful motion, and storybook color.",
};

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const IDEAS = [
  {
    label: "Create an anime short film",
    prompt: "Create an anime short film about a courier racing across a neon city at dusk",
  },
  {
    label: "Create a world cup ad",
    prompt: "Create a world cup ad: a player steps onto the pitch as the stadium lights ignite",
  },
  {
    label: "Create a Viking film trailer",
    prompt: "Create a Viking film trailer: a longship cuts through black water toward a burning shore",
  },
  {
    label: "Animate my dog as a cartoon hero",
    prompt: "Animate my dog as a cartoon hero leaping across rooftops at sunset",
  },
  {
    label: "Open on an alpine lake",
    prompt: "A quiet alpine lake at sunrise, mist lifting off the water, slow aerial drift",
  },
  {
    label: "Rainy Tokyo fashion film",
    prompt: "A fashion film on a rainy Tokyo street, neon reflections, a model turning under an umbrella",
  },
] as const;

export type GenerationRequest = {
  prompt: string;
  mode: "video" | "image";
  model: ModelId;
  audio: boolean;
  style: StyleId | null;
  imageUrl: string | null;
  aspectRatio: AspectRatio;
  duration: number;
  characterId: string | null;
};

export function composePrompt(prompt: string, style: StyleId | null) {
  const note = style ? STYLE_NOTES[style] : "";
  const base = prompt.trim();
  if (base && note) return `${base}\n\n${note}`;
  return base || note;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseGenerationRequest(body: unknown): GenerationRequest {
  if (!isRecord(body)) {
    throw new StudioError("Send a prompt as JSON.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length > 2000) {
    throw new StudioError("Keep the prompt under 2000 characters.", 400);
  }

  const mode = body.mode === "image" ? "image" : body.mode === "video" ? "video" : null;
  if (!mode) {
    throw new StudioError("Choose video or image.", 400);
  }

  const model = typeof body.model === "string" ? findModel(body.model) : null;
  if (!model || model.mode !== mode) {
    throw new StudioError("Choose a model for this output.", 400);
  }

  const style = STYLE_IDS.find((id) => id === body.style) ?? null;
  if (body.style != null && body.style !== "" && !style) {
    throw new StudioError("Choose a guide style from the list.", 400);
  }

  const aspectRatio = ASPECT_RATIOS.find((ratio) => ratio === body.aspectRatio) ?? "16:9";
  const durationValue = body.duration == null ? 5 : Number(body.duration);
  const duration = Number.isInteger(durationValue) ? durationValue : 0;
  if (model.mode === "video" && !model.durations.includes(duration)) {
    const choices = model.durations.map((seconds) => `${seconds}s`).join(", ");
    throw new StudioError(`${model.label} accepts ${choices}.`, 400);
  }
  if (model.mode === "video" && model.aspects.length > 0 && !model.aspects.includes(aspectRatio)) {
    throw new StudioError(`${model.label} accepts ${model.aspects.join(", ")}.`, 400);
  }
  if (model.mode === "image" && model.promptLimit && prompt.length > model.promptLimit) {
    throw new StudioError(`${model.label} accepts prompts up to ${model.promptLimit} characters.`, 400);
  }

  const characterId =
    typeof body.characterId === "string" && /^[A-Za-z0-9-]{8,80}$/.test(body.characterId)
      ? body.characterId
      : null;
  const wantsImage = mode === "video" || (model.mode === "image" && model.usesPhoto);
  const imageUrl = wantsImage ? httpsUrl(body.imageUrl) : null;
  if (wantsImage && body.imageUrl && !imageUrl) {
    throw new StudioError("The attached image needs a public https URL.", 400);
  }

  const directed = composePrompt(prompt, style);
  const photoCanStandAlone = model.mode === "video" && Boolean(imageUrl) && !model.imageRequiresPrompt;
  if (!directed && !photoCanStandAlone) {
    throw new StudioError("Write a prompt, or attach a photo to animate.", 400);
  }

  return {
    prompt,
    mode,
    model: model.id,
    audio: mode === "video" && body.audio !== false,
    style,
    imageUrl,
    aspectRatio,
    duration,
    characterId:
      characterId && model.mode === "image" && (model.kind === "soul" || model.kind === "soul-cinema")
        ? characterId
        : null,
  };
}
