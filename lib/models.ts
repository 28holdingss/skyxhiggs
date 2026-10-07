import type { AspectRatio } from "@/lib/prompts";

export type ModelId =
  | "seedance-2.5"
  | "seedance-2"
  | "kling-3"
  | "kling-3-pro"
  | "kling-3-4k"
  | "kling-3-turbo"
  | "kling-2.6"
  | "kling-2.5"
  | "wan-3"
  | "wan-3-prime"
  | "wan-2.7"
  | "wan-2.6"
  | "happy-horse-1.1"
  | "happy-horse-1"
  | "minimax-h3"
  | "ltx-2.5"
  | "ltx-2.5-pro"
  | "hailuo-2.3"
  | "pixverse-v6"
  | "cinema-studio-4"
  | "grok-video-1.5"
  | "soul-v2"
  | "soul"
  | "soul-cinema"
  | "grok-image"
  | "marketing-studio"
  | "qwen-image-3"
  | "ideogram-4"
  | "recraft-v4.1"
  | "recraft-v4.1-pro"
  | "recraft-v4.1-utility"
  | "recraft-v4.1-utility-pro"
  | "z-image";

const STANDARD_ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];

export type VideoModel = {
  id: ModelId;
  label: string;
  mode: "video";
  audio: "generate_audio" | "sound" | null;
  textPath: string;
  imagePath: string;
  imageRequiresPrompt: boolean;
  durations: number[];
  resolution: string | null;
  aspects: AspectRatio[];
  aspectOnText: boolean;
  aspectOnImage: boolean;
  /** Send the attached photo as image_urls instead of image_url. */
  imageList?: boolean;
};

type ImageModel = {
  id: ModelId;
  label: string;
  mode: "image";
  path: string;
  editPath?: string;
  kind: "soul" | "soul-cinema" | "grok" | "plain" | "ideogram" | "qwen" | "marketing";
  usesPhoto: boolean;
  resolution?: string;
  promptLimit?: number;
};

export type StudioModel = VideoModel | ImageModel;

export const MODELS: StudioModel[] = [
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    mode: "video",
    audio: "generate_audio",
    textPath: "/bytedance/seedance-2.5/text-to-video",
    imagePath: "/bytedance/seedance-2.5/image-to-video",
    imageRequiresPrompt: false,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "seedance-2",
    label: "Seedance 2.0",
    mode: "video",
    audio: "generate_audio",
    textPath: "/bytedance/seedance-2.0/text-to-video",
    imagePath: "/bytedance/seedance-2.0/image-to-video",
    imageRequiresPrompt: false,
    durations: [5, 10],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "kling-3",
    label: "Kling 3.0",
    mode: "video",
    audio: "sound",
    textPath: "/kling-video/v3.0/std/text-to-video",
    imagePath: "/kling-video/v3.0/std/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10],
    resolution: null,
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "kling-3-pro",
    label: "Kling 3.0 Pro",
    mode: "video",
    audio: "sound",
    textPath: "/kling-video/v3.0/pro/text-to-video",
    imagePath: "/kling-video/v3.0/pro/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: null,
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "kling-3-4k",
    label: "Kling 3.0 4K",
    mode: "video",
    audio: "sound",
    textPath: "/kling-video/v3.0/4k/text-to-video",
    imagePath: "/kling-video/v3.0/4k/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: null,
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "kling-3-turbo",
    label: "Kling 3.0 Turbo",
    mode: "video",
    audio: null,
    textPath: "/kling-video/v3.0-turbo/text-to-video",
    imagePath: "/kling-video/v3.0-turbo/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "kling-2.6",
    label: "Kling 2.6",
    mode: "video",
    audio: "sound",
    textPath: "/kling-video/v2.6/pro/text-to-video",
    imagePath: "/kling-video/v2.6/pro/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10],
    resolution: null,
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "kling-2.5",
    label: "Kling 2.5 Turbo",
    mode: "video",
    audio: null,
    textPath: "/kling-video/v2.5-turbo/pro/text-to-video",
    imagePath: "/kling-video/v2.5-turbo/pro/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10],
    resolution: null,
    aspects: [],
    aspectOnText: false,
    aspectOnImage: false,
  },
  {
    id: "wan-3",
    label: "Wan 3.0",
    mode: "video",
    audio: "generate_audio",
    textPath: "/alibaba/wan-3.0/text-to-video",
    imagePath: "/alibaba/wan-3.0/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "wan-3-prime",
    label: "Wan 3.0 Prime",
    mode: "video",
    audio: "generate_audio",
    textPath: "/alibaba/wan-3.0-prime/text-to-video",
    imagePath: "/alibaba/wan-3.0-prime/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15, 30],
    resolution: "1080p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "wan-2.7",
    label: "Wan 2.7",
    mode: "video",
    audio: null,
    textPath: "/wan/v2.7/text-to-video",
    imagePath: "/wan/v2.7/image-to-video",
    imageRequiresPrompt: false,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "wan-2.6",
    label: "Wan 2.6",
    mode: "video",
    audio: null,
    textPath: "/wan/v2.6/text-to-video",
    imagePath: "/wan/v2.6/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: [],
    aspectOnText: false,
    aspectOnImage: false,
  },
  {
    id: "happy-horse-1.1",
    label: "HappyHorse 1.1",
    mode: "video",
    audio: null,
    textPath: "/alibaba/happy-horse/v1.1/text-to-video",
    imagePath: "/alibaba/happy-horse/v1.1/image-to-video",
    imageRequiresPrompt: false,
    durations: [5, 10, 15],
    resolution: "1080p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "happy-horse-1",
    label: "Happy Horse 1.0",
    mode: "video",
    audio: null,
    textPath: "/alibaba/happy-horse/text-to-video",
    imagePath: "/alibaba/happy-horse/image-to-video",
    imageRequiresPrompt: false,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "minimax-h3",
    label: "MiniMax H3",
    mode: "video",
    audio: null,
    textPath: "/minimax/h3/text-to-video",
    imagePath: "/minimax/h3/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: "2K",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "ltx-2.5",
    label: "LTX-2.5 Fast",
    mode: "video",
    audio: "generate_audio",
    textPath: "/lightricks/ltx-2.5/text-to-video/fast",
    imagePath: "/lightricks/ltx-2.5/image-to-video/fast",
    imageRequiresPrompt: true,
    durations: [6, 8, 10],
    resolution: "720p",
    aspects: ["16:9", "9:16"],
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "ltx-2.5-pro",
    label: "LTX-2.5 Pro",
    mode: "video",
    audio: "generate_audio",
    textPath: "/lightricks/ltx-2.5/text-to-video/pro",
    imagePath: "/lightricks/ltx-2.5/image-to-video/pro",
    imageRequiresPrompt: true,
    durations: [6, 8, 10],
    resolution: "720p",
    aspects: ["16:9", "9:16"],
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "hailuo-2.3",
    label: "Hailuo 2.3",
    mode: "video",
    audio: null,
    textPath: "/minimax/hailuo-2.3/standard/text-to-video",
    imagePath: "/minimax/hailuo-2.3/standard/image-to-video",
    imageRequiresPrompt: true,
    durations: [6, 10],
    resolution: null,
    aspects: [],
    aspectOnText: false,
    aspectOnImage: false,
  },
  {
    id: "pixverse-v6",
    label: "PixVerse V6",
    mode: "video",
    audio: "generate_audio",
    textPath: "/pixverse/v6/text-to-video",
    imagePath: "/pixverse/v6/image-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: false,
  },
  {
    id: "cinema-studio-4",
    label: "Cinema Studio 4.0",
    mode: "video",
    audio: "generate_audio",
    textPath: "/higgsfield/cinema-studio/4.0",
    imagePath: "/higgsfield/cinema-studio/4.0",
    imageRequiresPrompt: true,
    durations: [5, 10, 15, 30],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: true,
    imageList: true,
  },
  {
    id: "grok-video-1.5",
    label: "Grok Video 1.5",
    mode: "video",
    audio: null,
    textPath: "/xai/grok-imagine-video/v1.5/reference-to-video",
    imagePath: "/xai/grok-imagine-video/v1.5/reference-to-video",
    imageRequiresPrompt: true,
    durations: [5, 10, 15],
    resolution: "720p",
    aspects: STANDARD_ASPECTS,
    aspectOnText: true,
    aspectOnImage: true,
  },
  {
    id: "soul-v2",
    label: "Soul v2",
    mode: "image",
    path: "/higgsfield-ai/soul/v2/standard",
    kind: "soul",
    usesPhoto: false,
  },
  {
    id: "soul",
    label: "Soul",
    mode: "image",
    path: "/higgsfield-ai/soul/standard",
    kind: "soul",
    usesPhoto: false,
  },
  {
    id: "soul-cinema",
    label: "Soul Cinema",
    mode: "image",
    path: "/higgsfield-ai/soul/cinema",
    kind: "soul-cinema",
    usesPhoto: false,
  },
  {
    id: "grok-image",
    label: "Grok Image 2.0",
    mode: "image",
    path: "/xai/grok-imagine-image-2.0",
    kind: "grok",
    usesPhoto: true,
  },
  {
    id: "marketing-studio",
    label: "Marketing Studio",
    mode: "image",
    path: "/marketing-studio/image",
    kind: "marketing",
    usesPhoto: true,
    resolution: "2k",
  },
  {
    id: "qwen-image-3",
    label: "Qwen Image 3",
    mode: "image",
    path: "/alibaba/qwen-image-3/text-to-image",
    editPath: "/alibaba/qwen-image-3/edit",
    kind: "qwen",
    usesPhoto: true,
    resolution: "1k",
  },
  {
    id: "ideogram-4",
    label: "Ideogram 4.0",
    mode: "image",
    path: "/ideogram/v4.0",
    kind: "ideogram",
    usesPhoto: true,
  },
  {
    id: "recraft-v4.1",
    label: "Recraft V4.1",
    mode: "image",
    path: "/recraft/v4.1/text-to-image",
    kind: "plain",
    usesPhoto: false,
    resolution: "1k",
  },
  {
    id: "recraft-v4.1-pro",
    label: "Recraft V4.1 Pro",
    mode: "image",
    path: "/recraft/v4.1/pro/text-to-image",
    kind: "plain",
    usesPhoto: false,
    resolution: "2k",
  },
  {
    id: "recraft-v4.1-utility",
    label: "Recraft V4.1 Utility",
    mode: "image",
    path: "/recraft/v4.1/utility/text-to-image",
    kind: "plain",
    usesPhoto: false,
    resolution: "1k",
  },
  {
    id: "recraft-v4.1-utility-pro",
    label: "Recraft V4.1 Utility Pro",
    mode: "image",
    path: "/recraft/v4.1/utility/pro/text-to-image",
    kind: "plain",
    usesPhoto: false,
    resolution: "2k",
  },
  {
    id: "z-image",
    label: "Z-Image Turbo",
    mode: "image",
    path: "/z-image/turbo",
    kind: "plain",
    usesPhoto: false,
    resolution: "1k",
    promptLimit: 800,
  },
];

export function modelsFor(mode: "video" | "image") {
  return MODELS.filter((model) => model.mode === mode);
}

export function findModel(id: string): StudioModel | null {
  return MODELS.find((model) => model.id === id) ?? null;
}

export function modelLabel(id: string) {
  return findModel(id)?.label ?? id;
}

export function defaultModel(mode: "video" | "image"): ModelId {
  return mode === "video" ? "seedance-2.5" : "soul-v2";
}
