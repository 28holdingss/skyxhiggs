"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BorderBeam } from "border-beam";
import { useMicrophone, VoiceBeam } from "voice-glow";
import { MediaLibrary, readUploads, rememberUpload, type LibraryMedia } from "@/components/media-library";
import { defaultModel, findModel, modelLabel, modelsFor, type ModelId } from "@/lib/models";
import { ASPECT_RATIOS, STYLE_IDS, STYLE_LABELS, type AspectRatio, type StyleId } from "@/lib/prompts";
import type { PublicJob } from "@/lib/types";
import {
  workflowProfile,
  workflowsFor,
  workflowLabel,
  type StudioBitrate,
  type StudioEditMode,
  type StudioResolution,
  type StudioTask,
} from "@/lib/workflows";

const PENDING = new Set<PublicJob["status"]>(["submitting", "queued", "in_progress"]);

const STATUS_LABEL: Record<PublicJob["status"], string> = {
  submitting: "Sending",
  queued: "Queued",
  in_progress: "Generating",
  completed: "Ready",
  failed: "Failed",
  nsfw: "Moderated",
  canceled: "Canceled",
};

type SpeechResult = {
  readonly 0: { transcript: string };
};

type SpeechResultEvent = {
  readonly results: ArrayLike<SpeechResult>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition() {
  const speechWindow = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

function presentError(error: string) {
  if (error === "not_enough_credits") {
    return "This Higgsfield account does not have enough credits for that generation.";
  }
  return error;
}

function usdLabel(usd: string) {
  const amount = Number(usd);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

type Attachment = { publicUrl: string; preview: string; name: string };

function releasePreview(preview: string | null | undefined) {
  if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
}

const EXTEND_DURATIONS = [5, 10, 15, 30];

export function Studio() {
  const promptId = useId();
  const guideRef = useRef<HTMLDivElement>(null);
  const guideMenuRef = useRef<HTMLDivElement>(null);
  const mic = useMicrophone();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const previewRef = useRef<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [surface, setSurface] = useState<"create" | "studio">("create");
  const [studioJob, setStudioJob] = useState<Exclude<StudioTask, "create">>("motion");
  const task: StudioTask = surface === "create" ? "create" : studioJob;
  const [mode, setMode] = useState<"video" | "image">("video");
  const [motionModel, setMotionModel] = useState("genjutsu-motion");
  const [editModel, setEditModel] = useState("seedance-2.5-edit");
  const [characterModel, setCharacterModel] = useState("soul-id-v2");
  const [orientation, setOrientation] = useState<"image" | "video">("video");
  const [studioResolution, setStudioResolution] = useState<StudioResolution>("720p");
  const [bitrate, setBitrate] = useState<StudioBitrate>("high");
  const [editMode, setEditMode] = useState<StudioEditMode>("pro");
  const [characterId, setCharacterId] = useState("");
  const [modelId, setModelId] = useState<ModelId>("seedance-2.5");
  const [audio, setAudio] = useState(true);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [style, setStyle] = useState<StyleId | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guidePlace, setGuidePlace] = useState<{ top: number; left: number } | null>(null);
  const [image, setImage] = useState<Attachment | null>(null);
  const [video, setVideo] = useState<Attachment | null>(null);
  const [refVideo, setRefVideo] = useState<Attachment | null>(null);
  const [photos, setPhotos] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [uploads, setUploads] = useState<LibraryMedia[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryIntent, setLibraryIntent] = useState<"image" | "video" | "reference">("image");
  const [refreshToken, setRefreshToken] = useState(0);

  const selectedModel = findModel(modelId);
  const videoModel = selectedModel?.mode === "video" ? selectedModel : null;
  const photoStandsAlone = Boolean(videoModel && image && !videoModel.imageRequiresPrompt);
  const workflowModel =
    task === "motion" ? motionModel : task === "edit" ? editModel : task === "character" ? characterModel : "seedance-2.5-extend";
  const studioProfile = task === "create" ? null : workflowProfile(workflowModel);
  const showWorkflowAudio =
    (task === "motion" && motionModel.startsWith("kling")) ||
    (task === "edit" && editModel.startsWith("seedance")) ||
    task === "extend";
  const soulCharacterModel =
    modelId === "soul" ? "soul-id-v1" : modelId === "soul-v2" ? "soul-id-v2" : modelId === "soul-cinema" ? "soul-id-cinema" : null;
  const characters = jobs.filter(
    (job) => job.status === "completed" && job.referenceId && job.model === soulCharacterModel,
  );
  const canSubmit =
    !submitting &&
    !uploading &&
    (task === "create"
      ? prompt.trim().length > 0 || photoStandsAlone
      : task === "motion"
        ? Boolean(video && photos.length > 0)
        : task === "character"
          ? prompt.trim().length > 0 && photos.length > 0
          : prompt.trim().length > 0 && Boolean(video));
  const showAspect =
    mode === "image" || Boolean(videoModel && videoModel.aspects.length > 0 && !(image && !videoModel.aspectOnImage));
  const aspectOptions = videoModel && mode === "video" ? videoModel.aspects : ASPECT_RATIOS;

  function fitVideoModel(nextId: ModelId) {
    const nextModel = findModel(nextId);
    if (nextModel?.mode !== "video") return;
    setDuration((current) => (nextModel.durations.includes(current) ? current : nextModel.durations[0]));
    if (nextModel.aspects.length > 0) {
      setAspectRatio((current) => (nextModel.aspects.includes(current) ? current : nextModel.aspects[0]));
    }
  }

  function chooseMode(next: "video" | "image") {
    setMode(next);
    const current = findModel(modelId);
    const nextId = !current || current.mode !== next ? defaultModel(next) : modelId;
    if (nextId !== modelId) setModelId(nextId);
    if (next === "video") fitVideoModel(nextId);
  }

  function chooseModel(nextId: ModelId) {
    setModelId(nextId);
    fitVideoModel(nextId);
  }

  useEffect(() => {
    setUploads(readUploads());
  }, []);

  useEffect(() => {
    return () => {
      releasePreview(previewRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!guideOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!guideRef.current?.contains(target) && !guideMenuRef.current?.contains(target)) setGuideOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [guideOpen]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    async function tick() {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const body = (await response.json()) as {
          jobs?: PublicJob[];
          configured?: boolean;
          authError?: boolean;
          error?: string;
        };
        if (stopped) return;
        if (!response.ok) return;
        setJobs(body.jobs ?? []);
        setConfigured(body.configured !== false);
        setAuthError(Boolean(body.authError));
        if ((body.jobs ?? []).some((job) => PENDING.has(job.status))) {
          timer = window.setTimeout(() => void tick(), 3000);
        }
      } catch {
        if (!stopped) timer = window.setTimeout(() => void tick(), 5000);
      }
    }

    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [refreshToken]);

  function clearImage() {
    releasePreview(previewRef.current);
    previewRef.current = null;
    setImage(null);
  }

  function openLibrary(intent: "image" | "video" | "reference") {
    setLibraryIntent(intent);
    setLibraryOpen(true);
  }

  function chooseStudioJob(next: Exclude<StudioTask, "create">) {
    setStudioJob(next);
    if (next === "extend" && !EXTEND_DURATIONS.includes(duration)) setDuration(5);
  }

  function placeAttachment(attachment: Attachment, kind: "image" | "video" | "reference") {
    if (kind === "reference") {
      setRefVideo((current) => {
        releasePreview(current?.preview);
        return attachment;
      });
      return;
    }
    if (kind === "video") {
      setVideo((current) => {
        releasePreview(current?.preview);
        return attachment;
      });
      return;
    }
    if (task !== "create") {
      const limit = workflowProfile(workflowModel).imageLimit;
      setPhotos((current) => {
        if (limit <= 1) {
          current.forEach((photo) => releasePreview(photo.preview));
          return [attachment];
        }
        if (current.length >= limit) {
          releasePreview(attachment.preview);
          return current;
        }
        return [...current, attachment];
      });
      return;
    }
    releasePreview(previewRef.current);
    previewRef.current = attachment.preview;
    setImage(attachment);
  }

  function selectLibrary(item: LibraryMedia) {
    const kind = item.kind === "video" ? (libraryIntent === "reference" ? "reference" : "video") : "image";
    if (kind === "image" && task !== "create" && photos.length >= workflowProfile(workflowModel).imageLimit && workflowProfile(workflowModel).imageLimit > 1) {
      setError(`This model takes ${workflowProfile(workflowModel).imageLimit} photos.`);
      return;
    }
    placeAttachment({ publicUrl: item.url, preview: item.url, name: item.name }, kind);
    if (kind === "image") {
      const current = findModel(modelId);
      if (task === "create" && current?.mode === "image" && !current.usesPhoto) {
        const nextId = defaultModel("video");
        setMode("video");
        setModelId(nextId);
        fitVideoModel(nextId);
      }
    }
    setLibraryOpen(false);
  }

  async function onFile(file: File | null, kind: "image" | "video" | "reference" = "image") {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const body = (await response.json()) as { publicUrl?: string; error?: string };
      if (!response.ok || !body.publicUrl) {
        throw new Error(body.error || "The image did not upload.");
      }
      const isVideo = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
      setUploads(rememberUpload({ url: body.publicUrl, name: file.name, kind: isVideo ? "video" : "image" }));
      const preview = URL.createObjectURL(file);
      const attachment = { publicUrl: body.publicUrl, preview, name: file.name };
      if (isVideo && task === "create") {
        releasePreview(preview);
        setError("Clips attach from Motion, Edit, and Extend.");
        return;
      }
      const resolved = isVideo ? (kind === "reference" ? "reference" : "video") : "image";
      placeAttachment(attachment, resolved);
      setLibraryOpen(false);
      const current = findModel(modelId);
      if (resolved === "image" && task === "create" && current?.mode === "image" && !current.usesPhoto) {
        const nextId = defaultModel("video");
        setMode("video");
        setModelId(nextId);
        fitVideoModel(nextId);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The image did not upload.");
    } finally {
      setUploading(false);
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      mic.stop();
      setListening(false);
      return;
    }

    void mic.start();

    const recognition = speechRecognition();
    if (!recognition) {
      setListening(true);
      return;
    }

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript.trim();
      if (!transcript) return;
      setPrompt((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
    };
    recognition.onerror = () => {
      mic.stop();
      setListening(false);
    };
    recognition.onend = () => {
      mic.stop();
      setListening(false);
    };
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      mic.stop();
      setListening(false);
      setError("Voice input is not available in this browser.");
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          task === "create"
            ? {
                prompt,
                mode,
                model: modelId,
                audio,
                style,
                aspectRatio,
                duration,
                imageUrl:
                  mode === "video" || (selectedModel?.mode === "image" && selectedModel.usesPhoto)
                    ? image?.publicUrl
                    : undefined,
                characterId: soulCharacterModel ? characterId || undefined : undefined,
              }
            : {
                task,
                model: workflowModel,
                prompt,
                style: task === "character" ? null : style,
                videoUrl: video?.publicUrl,
                referenceVideoUrl: refVideo?.publicUrl,
                imageUrls: photos.map((photo) => photo.publicUrl),
                audio,
                duration,
                orientation,
                resolution: studioResolution,
                bitrate,
                editMode,
              },
        ),
      });
      const body = (await response.json()) as { job?: PublicJob; error?: string };
      if (!response.ok || !body.job) {
        throw new Error(body.error || "Higgsfield did not start this generation.");
      }
      setJobs((current) => [body.job!, ...current.filter((job) => job.id !== body.job!.id)]);
      setRefreshToken((value) => value + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Higgsfield did not start this generation.");
      setRefreshToken((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelJob(id: string) {
    setError(null);
    const response = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
    const body = (await response.json()) as { job?: PublicJob; error?: string };
    if (!response.ok || !body.job) {
      setError(body.error || "That generation could not be canceled.");
      return;
    }
    setJobs((current) => current.map((job) => (job.id === body.job!.id ? body.job! : job)));
    setRefreshToken((value) => value + 1);
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(920px_540px_at_6%_112%,rgba(255,122,150,0.92),transparent_68%),radial-gradient(840px_540px_at_100%_-8%,rgba(164,118,214,0.88),transparent_62%),linear-gradient(165deg,#f7e9f0_0%,#ecd6e2_48%,#ddc8eb_100%)]" />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div>
          <p className="text-lg font-semibold tracking-tight text-[#24131c]">Sky × Higgs</p>
          <p className="text-sm text-[#24131c]/60">By skyland technology , powered by Higgsfield</p>
        </div>
      </header>

      <section className="mx-auto mt-14 w-full max-w-3xl sm:mt-24">
        {!configured ? (
          <p className="mb-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[#24131c] ring-1 ring-black/5">
            Add <code className="font-mono text-[0.92em]">HF_API_KEY_ID</code> and{" "}
            <code className="font-mono text-[0.92em]">HF_API_KEY_SECRET</code> to{" "}
            <code className="font-mono text-[0.92em]">.env.local</code>, then restart the server.
          </p>
        ) : null}
        {authError ? (
          <p className="mb-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[#24131c] ring-1 ring-black/5">
            Higgsfield rejected the API key. Check the key id and secret in .env.local.
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          <Segment
            value={surface}
            options={[
              { value: "create", label: "Create" },
              { value: "studio", label: "Studio" },
            ]}
            onChange={setSurface}
          />
          {surface === "create" ? (
            <Segment
              value={mode}
              options={[
                { value: "video", label: "Video" },
                { value: "image", label: "Image" },
              ]}
              onChange={chooseMode}
            />
          ) : (
            <Segment
              value={studioJob}
              options={[
                { value: "motion", label: "Motion", icon: <MotionIcon /> },
                { value: "edit", label: "Edit", icon: <EditIcon /> },
                { value: "extend", label: "Extend", icon: <ExtendIcon /> },
                { value: "character", label: "Character", icon: <CharacterIcon /> },
              ]}
              onChange={chooseStudioJob}
            />
          )}
        </div>

        <BorderBeam
          size="md"
          duration={6}
          colorVariant="colorful"
          theme="dark"
          strength={1}
          glowSize={2}
          borderRadius={28}
          className="w-full"
          css={`
            [data-beam="{id}"] {
              overflow: visible;
            }
            [data-beam="{id}"][data-active]::before,
            [data-beam="{id}"][data-fading]::before {
              opacity: 0;
            }
            [data-beam="{id}"][data-active]::after,
            [data-beam="{id}"][data-fading]::after {
              padding: 2px;
              opacity: 1;
              filter: none;
              background: conic-gradient(
                from var(--beam-angle-{id}),
                transparent 0%,
                transparent 62%,
                #ff4d88 74%,
                #7c6cff 82%,
                #3ec6ff 90%,
                transparent 100%
              );
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              mask-composite: exclude;
            }
            [data-beam="{id}"][data-active] [data-beam-bloom],
            [data-beam="{id}"][data-fading] [data-beam-bloom] {
              padding: 2px;
              opacity: 1;
              filter: blur(12px);
              background: conic-gradient(
                from var(--beam-angle-{id}),
                transparent 0%,
                transparent 66%,
                rgba(255, 77, 136, 0.95) 78%,
                rgba(62, 198, 255, 0.95) 90%,
                transparent 100%
              );
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              mask-composite: exclude;
            }
          `}
        >
        <VoiceBeam
          stream={mic.stream}
          processing={submitting || jobs.some((job) => PENDING.has(job.status))}
          idle={0}
          theme="dark"
          colorVariant="colorful"
          borderRadius={28}
          className="w-full"
        >
        <form
          onSubmit={onSubmit}
          className="rounded-[28px] bg-[#0c0c0e] p-4 text-white shadow-[0_28px_70px_rgba(48,12,32,0.28)] sm:p-5"
        >
          <label htmlFor={promptId} className="sr-only">
            Prompt
          </label>
          <textarea
            id={promptId}
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={task === "character" ? 1 : 3}
            placeholder={
              task === "motion"
                ? "Describe the performance..."
                : task === "edit"
                  ? "Describe what should change..."
                  : task === "extend"
                    ? "Describe how the clip continues..."
                    : task === "character"
                      ? "Name this character"
                      : "Animate my dog as a cartoon hero..."
            }
            className={`${task === "character" ? "min-h-12" : "min-h-24"} w-full resize-none bg-transparent px-2 pt-1 text-[15px] leading-6 text-white/90 outline-none placeholder:text-white/35`}
          />

          {task !== "create" && (video || refVideo || photos.length > 0) ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 px-2">
              {video ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
                  <span className="max-w-32 truncate">{video.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      releasePreview(video.preview);
                      setVideo(null);
                    }}
                    className="text-white/50 hover:text-white"
                  >
                    Remove
                  </button>
                </span>
              ) : null}
              {refVideo ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
                  <span className="max-w-32 truncate">{refVideo.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      releasePreview(refVideo.preview);
                      setRefVideo(null);
                    }}
                    className="text-white/50 hover:text-white"
                  >
                    Remove
                  </button>
                </span>
              ) : null}
              {photos.map((photo) => (
                <span key={photo.publicUrl} className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt="" className="h-7 w-7 rounded-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${photo.name}`}
                    onClick={() => {
                      releasePreview(photo.preview);
                      setPhotos((current) => current.filter((item) => item.publicUrl !== photo.publicUrl));
                    }}
                    className="text-sm text-white/50 hover:text-white"
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {task === "create" && image ? (
            <div className="mb-2 flex items-center gap-2 px-2">
              {/* Local preview of the photo the user just attached. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm text-white/70">{image.name}</span>
              <button
                type="button"
                onClick={clearImage}
                className="text-sm text-white/60 hover:text-white"
              >
                Remove
              </button>
            </div>
          ) : null}

          {task === "create" && mode === "image" && image && selectedModel?.mode === "image" && !selectedModel.usesPhoto ? (
            <p className="px-2 pb-2 text-xs text-white/45">
              This photo animates in Video. Grok Image, Qwen, Ideogram, and Marketing Studio can use it as a reference.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openLibrary("image")}
                className="group relative grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
                aria-label={task === "motion" ? "Attach a character photo" : "Attach a photo"}
              >
                <PlusIcon />
                <HoverName name={task === "character" ? "Photos" : "Photo"} />
              </button>
              {task === "motion" || task === "edit" || task === "extend" ? (
                <>
                  <button
                    type="button"
                    onClick={() => openLibrary("video")}
                    aria-label="Attach a source clip"
                    className="group relative grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
                  >
                    <ClipIcon />
                    <HoverName name="Clip" />
                  </button>
                  {studioProfile?.referenceClip ? (
                    <button
                      type="button"
                      onClick={() => openLibrary("reference")}
                      aria-label="Attach a reference clip"
                      className="group relative grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
                    >
                      <RefIcon />
                      <HoverName name="Reference" />
                    </button>
                  ) : null}
                </>
              ) : null}
              {task === "create" ? (
                <label className="relative inline-flex cursor-pointer items-center">
                  <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/15">
                    {selectedModel?.label ?? "Model"}
                    <ChevronIcon />
                  </span>
                  <select
                    aria-label="Model"
                    value={modelId}
                    onChange={(event) => chooseModel(event.target.value as ModelId)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    {modelsFor(mode).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="relative inline-flex cursor-pointer items-center">
                  <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/15">
                    {workflowLabel(workflowModel) ?? "Model"}
                    <ChevronIcon />
                  </span>
                  <select
                    aria-label="Model"
                    value={workflowModel}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (task === "motion") setMotionModel(next);
                      if (task === "edit") setEditModel(next);
                      if (task === "character") setCharacterModel(next);
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    {workflowsFor(task).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {task === "create" && characters.length > 0 ? (
                <label className="relative inline-flex cursor-pointer items-center">
                  <span className="pointer-events-none inline-flex max-w-40 items-center gap-1 truncate rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/15">
                    {characters.find((job) => job.referenceId === characterId)?.prompt || "No character"}
                    <ChevronIcon />
                  </span>
                  <select
                    aria-label="Character"
                    value={characterId}
                    onChange={(event) => setCharacterId(event.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="">No character</option>
                    {characters.map((job) => (
                      <option key={job.id} value={job.referenceId ?? ""}>
                        {job.prompt}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {task === "create" && videoModel?.audio ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio}
                  onClick={() => setAudio((current) => !current)}
                  className="inline-flex items-center gap-2 text-sm text-white/80"
                >
                  Audio
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${audio ? "bg-white" : "bg-white/20"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${audio ? "left-4 bg-[#0c0c0e]" : "left-0.5 bg-white"}`}
                    />
                  </span>
                </button>
              ) : null}
              {showWorkflowAudio ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio}
                  onClick={() => setAudio((current) => !current)}
                  className="inline-flex items-center gap-2 text-sm text-white/80"
                >
                  {task === "motion" ? "Sound" : "Audio"}
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${audio ? "bg-white" : "bg-white/20"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${audio ? "left-4 bg-[#0c0c0e]" : "left-0.5 bg-white"}`}
                    />
                  </span>
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {task === "character" ? null : (
              <div ref={guideRef} className="relative">
                <button
                  type="button"
                  aria-expanded={guideOpen}
                  onClick={() => {
                    if (guideOpen) {
                      setGuideOpen(false);
                      return;
                    }
                    const rect = guideRef.current?.getBoundingClientRect();
                    const form = guideRef.current?.closest("form")?.getBoundingClientRect();
                    if (rect && form) setGuidePlace({ top: form.top + 12, left: rect.right });
                    setGuideOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  {style ? STYLE_LABELS[style] : "Guide me"}
                  <ChevronIcon />
                </button>
              </div>
              )}

              <button
                type="button"
                aria-pressed={listening || mic.state === "live"}
                aria-label={listening || mic.state === "live" ? "Stop voice input" : "Start voice input"}
                onClick={toggleListening}
                className={`grid h-10 w-10 place-items-center rounded-full ${listening || mic.state === "live" ? "bg-white text-black" : "text-white/80 hover:bg-white/10"}`}
              >
                <MicIcon />
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                aria-label={submitting ? "Sending" : "Generate"}
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-black disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-white/40"
              >
                <ArrowUpIcon />
              </button>
            </div>
          </div>
        </form>
        </VoiceBeam>
        </BorderBeam>

        {error ? <p className="mt-3 px-2 text-sm text-[#6d2438]">{presentError(error)}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {task === "create" && videoModel ? (
            <Segment
              value={duration}
              options={videoModel.durations.map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
              onChange={setDuration}
            />
          ) : null}
          {task === "extend" ? (
            <Segment
              value={EXTEND_DURATIONS.includes(duration) ? duration : 5}
              options={EXTEND_DURATIONS.map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
              onChange={setDuration}
            />
          ) : null}
          {studioProfile?.resolution ? (
            <Segment
              value={studioResolution}
              options={[
                { value: "480p", label: "480p" },
                { value: "720p", label: "720p" },
              ]}
              onChange={setStudioResolution}
            />
          ) : null}
          {studioProfile?.bitrate ? (
            <Segment
              value={bitrate}
              options={[
                { value: "standard", label: "Standard" },
                { value: "high", label: "High" },
              ]}
              onChange={setBitrate}
            />
          ) : null}
          {studioProfile && studioProfile.modes.length > 0 ? (
            <Segment
              value={studioProfile.modes.includes(editMode) ? editMode : "pro"}
              options={studioProfile.modes.map((mode) => ({ value: mode, label: mode.toUpperCase() }))}
              onChange={setEditMode}
            />
          ) : null}
          {task === "motion" && motionModel.startsWith("kling") ? (
            <Segment
              value={orientation}
              options={[
                { value: "image", label: "Match image" },
                { value: "video", label: "Match video" },
              ]}
              onChange={setOrientation}
            />
          ) : null}
          {task === "create" && showAspect ? (
            <Segment
              value={aspectRatio}
              options={aspectOptions.map((ratio) => ({ value: ratio, label: ratio }))}
              onChange={setAspectRatio}
            />
          ) : task === "create" && mode === "video" && image ? (
            <span className="rounded-full bg-white/55 px-3 py-1.5 text-sm text-[#24131c]/70">
              Framing follows your photo
            </span>
          ) : null}
        </div>
      </section>

      <section className="mx-auto mt-14 w-full max-w-5xl pb-16">
        {jobs.length === 0 ? (
          <p className="text-center text-sm text-[#24131c]/55">Generations show up here. Finished files stay on Higgsfield for about seven days.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onCancel={cancelJob} />
            ))}
          </div>
        )}
      </section>
      {guideOpen && guidePlace
        ? createPortal(
            <div
              ref={guideMenuRef}
              style={{ top: guidePlace.top, left: guidePlace.left }}
              className="fixed z-40 w-44 -translate-x-full rounded-2xl border border-white/10 bg-[#1a1a1d] p-1 shadow-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setStyle(null);
                  setGuideOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10"
              >
                No guide
              </button>
              {STYLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setStyle(id);
                    setGuideOpen(false);
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                >
                  {STYLE_LABELS[id]}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      {libraryOpen ? (
        <MediaLibrary
          uploads={uploads}
          elements={jobs
            .filter((job) => job.status === "completed" && job.referenceId)
            .map((job) => ({
              id: job.referenceId ?? job.id,
              url: job.outputUrl ?? "",
              name: job.prompt,
              kind: "image" as const,
              createdAt: job.createdAt,
            }))}
          generations={jobs
            .filter((job) => job.status === "completed" && job.outputUrl && (job.outputKind === "image" || job.outputKind === "video"))
            .map((job) => ({
              id: job.id,
              url: job.outputUrl ?? "",
              name: job.prompt,
              kind: job.outputKind === "video" ? ("video" as const) : ("image" as const),
              createdAt: job.createdAt,
            }))}
          uploading={uploading}
          allowVideo={task === "motion" || task === "edit" || task === "extend"}
          onUpload={(file) => void onFile(file, libraryIntent === "reference" ? "reference" : libraryIntent)}
          onSelect={selectLibrary}
          onSelectElement={(item) => {
            setCharacterId(item.id);
            setLibraryOpen(false);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}
    </main>
  );
}

function JobCard({ job, onCancel }: { job: PublicJob; onCancel: (id: string) => void }) {
  const price = job.estimate ? usdLabel(job.estimate.usd) : null;
  const pending = PENDING.has(job.status);
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function shareOutput() {
    if (!job.outputUrl) return;
    setShareNote(null);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Sky × Higgs",
          text: job.prompt || "Generated with Sky × Higgs",
          url: job.outputUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(job.outputUrl);
      setShareNote("Link copied");
      window.setTimeout(() => setShareNote(null), 2000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareNote("Could not share");
      window.setTimeout(() => setShareNote(null), 2000);
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl bg-white/75 shadow-sm ring-1 ring-black/5 backdrop-blur">
      <div className="relative aspect-video bg-[#1a1218]">
        {job.outputKind === "video" && job.outputUrl ? (
          <video src={job.outputUrl} controls playsInline className="h-full w-full object-cover" />
        ) : job.outputUrl ? (
          // Higgsfield returns a short-lived CDN URL that is not known at build time.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.outputUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-white/70">
            {pending ? <span className="animate-pulse">{STATUS_LABEL[job.status]}</span> : STATUS_LABEL[job.status]}
          </div>
        )}
        {job.status === "completed" && job.outputUrl ? (
          <button
            type="button"
            onClick={() => void shareOutput()}
            aria-label="Share"
            className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
          >
            <ShareIcon />
          </button>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-[#24131c]/60">
          <span>
            {workflowLabel(job.model) ?? modelLabel(job.model)}
            {job.duration ? ` · ${job.duration}s` : ""}
            {job.audio ? " · Audio" : ""} · {STATUS_LABEL[job.status]}
          </span>
          {price ? <span>{price}</span> : null}
        </div>
        <p className="line-clamp-2 text-sm text-[#24131c]">{job.prompt || "Attached photo"}</p>
        {job.referenceId ? <p className="truncate text-xs text-[#24131c]/55">Character {job.referenceId}</p> : null}
        {job.error ? <p className="text-sm text-[#6d2438]">{presentError(job.error)}</p> : null}
        <div className="flex items-center gap-3 text-sm">
          {job.status === "queued" && !job.model.startsWith("soul-id") ? (
            <button type="button" onClick={() => onCancel(job.id)} className="text-[#24131c]/70 hover:text-[#24131c]">
              Cancel
            </button>
          ) : null}
          {job.outputUrl ? (
            <a href={job.outputUrl} target="_blank" rel="noreferrer" className="text-[#24131c] hover:underline">
              Open
            </a>
          ) : null}
          {shareNote ? <span className="text-xs text-[#24131c]/55">{shareNote}</span> : null}
        </div>
      </div>
    </article>
  );
}

function Segment<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-white/55 p-1 ring-1 ring-black/5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${selected ? "bg-white text-[#24131c] shadow-sm" : "text-[#24131c]/65"}`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function HoverName({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-md bg-white px-2 py-1 text-xs font-medium whitespace-nowrap text-[#24131c] opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
    >
      {name}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 6.3v3.4L10.1 8 7 6.3Z" fill="currentColor" />
    </svg>
  );
}

function RefIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4.4" y="1.8" width="9.2" height="7.2" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.6 5.4A1.6 1.6 0 0 0 1.4 7v5.2A1.6 1.6 0 0 0 3 13.8h6.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MotionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="9.4" cy="3" r="1.35" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.6 14.2 7.8 9.2 5.4 7.4M7.8 9.2 10.4 8l2.2 2.4M7.6 8.6 9.8 6.2l2.6.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 5.4h2.1M2 8h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.2 3.1 12.9 6.8 6.4 13.3H2.7V9.6L9.2 3.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 4.3 11.7 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ExtendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.6" y="4.6" width="6.4" height="6.8" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.2 8h5M12 5.4 14.6 8 12 10.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CharacterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.4 13.4c.7-2.5 2.4-3.7 4.6-3.7s3.9 1.2 4.6 3.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="6" y="1.8" width="4" height="7.2" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 7.4a4 4 0 0 0 8 0M8 11.4V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 12.5V3.8M4.2 7.2 8 3.4l3.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="12.2" cy="3.4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12.2" cy="12.6" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3.8" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.3 7.2 10.5 4.3M5.3 8.8 10.5 11.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

