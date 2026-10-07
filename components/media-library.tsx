"use client";

import { useEffect, useId, useRef, useState } from "react";

export type LibraryMedia = {
  id: string;
  url: string;
  name: string;
  kind: "image" | "video";
  createdAt: string;
};

type LibraryTab = "uploads" | "elements" | "generations" | "liked";
type LibraryFilter = "recent" | "all" | "images" | "videos" | "audio";

const UPLOADS_KEY = "sky-uploads";

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "uploads", label: "Uploads" },
  { id: "elements", label: "Elements" },
  { id: "generations", label: "Generations" },
  { id: "liked", label: "Liked" },
];

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "audio", label: "Audio" },
];

function isLibraryMedia(value: unknown): value is LibraryMedia {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LibraryMedia>;
  return (
    typeof item.id === "string" &&
    typeof item.url === "string" &&
    typeof item.name === "string" &&
    (item.kind === "image" || item.kind === "video") &&
    typeof item.createdAt === "string"
  );
}

export function readUploads(): LibraryMedia[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(UPLOADS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLibraryMedia).slice(0, 40);
  } catch {
    return [];
  }
}

export function rememberUpload(item: { url: string; name: string; kind: "image" | "video" }) {
  const next = [
    { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
    ...readUploads().filter((existing) => existing.url !== item.url),
  ].slice(0, 40);
  localStorage.setItem(UPLOADS_KEY, JSON.stringify(next));
  return next;
}

export function MediaLibrary({
  uploads,
  elements,
  generations,
  uploading,
  allowVideo,
  onUpload,
  onSelect,
  onSelectElement,
  onClose,
}: {
  uploads: LibraryMedia[];
  elements: LibraryMedia[];
  generations: LibraryMedia[];
  uploading: boolean;
  allowVideo: boolean;
  onUpload: (file: File) => void;
  onSelect: (item: LibraryMedia) => void;
  onSelectElement: (item: LibraryMedia) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const fileId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<LibraryTab>("uploads");
  const [filter, setFilter] = useState<LibraryFilter>("recent");

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const source = tab === "uploads" ? uploads : tab === "elements" ? elements : tab === "generations" ? generations : [];
  const visible = source.filter((item) => {
    if (filter === "images") return item.kind === "image";
    if (filter === "videos") return item.kind === "video";
    if (filter === "audio") return false;
    return true;
  });

  const accept =
    filter === "videos" ? "video/mp4" : filter === "images" ? "image/jpeg,image/png,image/webp,image/gif" : "image/jpeg,image/png,image/webp,image/gif,video/mp4";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(36rem,82vh)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-[#2a2a2a] text-white shadow-2xl outline-none"
      >
        <div className="flex items-center gap-1 px-5 pt-5">
          <h2 id={titleId} className="sr-only">
            Media library
          </h2>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-1.5 text-sm ${tab === item.id ? "bg-white font-medium text-[#1a1a1a]" : "text-white/55 hover:text-white"}`}
            >
              {item.label}
            </button>
          ))}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <CloseIcon />
          </button>
        </div>

        <div className="mx-5 mt-4 flex items-center gap-1 border-b border-white/10 pb-3">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1 text-sm ${filter === item.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === "liked" ? (
            <p className="px-1 py-16 text-center text-sm text-white/45">Nothing liked yet.</p>
          ) : filter === "audio" ? (
            <p className="px-1 py-16 text-center text-sm text-white/45">Audio is not available yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tab === "uploads" ? (
                <>
                  <input
                    id={fileId}
                    type="file"
                    accept={accept}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) onUpload(file);
                    }}
                  />
                  <label
                    htmlFor={fileId}
                    className="flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 text-sm text-white hover:border-white/40"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10">
                      {uploading ? <span className="text-xs">…</span> : <UploadCloudIcon />}
                    </span>
                    {uploading ? "Uploading" : "Upload media"}
                  </label>
                </>
              ) : null}
              {visible.map((item) => {
                const blocked = item.kind === "video" && !allowVideo;
                return (
                <button
                  key={item.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    if (blocked) return;
                    if (tab === "elements") onSelectElement(item);
                    else onSelect(item);
                  }}
                  className={`group relative h-44 overflow-hidden rounded-2xl bg-black/30 text-left ring-1 ring-white/10 ${blocked ? "cursor-default opacity-40" : "hover:ring-white/40"}`}
                >
                  {item.url && item.kind === "image" ? (
                    // Higgsfield hosts these files; the URL is only known after upload.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  ) : item.url && item.kind === "video" ? (
                    <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-sm text-white/50">Character</span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-2 text-xs text-white">
                    {item.name}
                  </span>
                </button>
                );
              })}
            </div>
          )}
          {tab === "generations" && visible.length === 0 && filter !== "audio" ? (
            <p className="px-1 py-10 text-center text-sm text-white/45">Finished generations show up here.</p>
          ) : null}
          {tab === "elements" && visible.length === 0 && filter !== "audio" ? (
            <p className="px-1 py-10 text-center text-sm text-white/45">Trained characters show up here.</p>
          ) : null}
          {tab === "uploads" && filter === "videos" && !allowVideo ? (
            <p className="mt-4 text-center text-xs text-white/40">Clips attach from Motion, Edit, and Extend.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UploadCloudIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.2 17.5h9.8a3.7 3.7 0 0 0 .3-7.4 5.2 5.2 0 0 0-10-1.6 3.3 3.3 0 0 0-.1 9Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 16.2V10.2M9.7 12.4 12 10.1l2.3 2.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
