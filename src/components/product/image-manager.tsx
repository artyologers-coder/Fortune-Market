"use client";

import { useState, useRef, useCallback } from "react";

interface ImageManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
  uploadEndpoint?: string;
  productId?: string;
  maxImages?: number;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const MAX_DIMENSION = 1000;

async function compressImage(file: File): Promise<File> {
  const isGif = file.type === "image/gif";
  if (isGif || file.size <= MAX_FILE_SIZE * 0.6) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    if (scale === 1 && file.type === "image/webp") {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale) || 1;
    canvas.height = Math.round(height * scale) || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8)
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}

export function ImageManager({
  images,
  onChange,
  uploadEndpoint = "/api/upload",
  productId,
  maxImages = 10,
}: ImageManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setError("");

      const added: string[] = [];
      for (const file of Array.from(files)) {
        if (images.length + added.length >= maxImages) {
          setError(`Maximum ${maxImages} images allowed`);
          break;
        }
        if (file.size > MAX_FILE_SIZE) {
          setError(`"${file.name}" is over 3 MB`);
          continue;
        }
        let uploadFile = file;
        try {
          uploadFile = await compressImage(file);
        } catch {
          // compression failed; fall through with original file
        }
        const fd = new FormData();
        fd.append("file", uploadFile);
        if (productId) fd.append("productId", productId);
        try {
          const res = await fetch(uploadEndpoint, { method: "POST", body: fd });
          const data = await res.json();
          if (res.ok && data.url) {
            added.push(data.url);
          } else {
            setError(data.error || `Failed to upload ${file.name}`);
          }
        } catch {
          setError(`Failed to upload ${file.name}`);
        }
      }

      if (added.length > 0) {
        onChange([...images, ...added]);
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [images, onChange, uploadEndpoint, productId, maxImages]
  );

  async function handleDelete(index: number) {
    const url = images[index];
    const next = images.filter((_, i) => i !== index);
    onChange(next);
    try {
      await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url], productId }),
      });
    } catch {
      // best-effort blob cleanup
    }
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index >= images.length - 1) return;
    const next = [...images];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((url, i) => (
          <div
            key={`${url}-${i}`}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`relative w-24 h-24 rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all ${
              dragIndex === i
                ? "opacity-50 border-primary scale-95"
                : overIndex === i
                ? "border-primary"
                : "border-gray-200"
            }`}
          >
            <img
              src={url}
              alt={`Product image ${i + 1}`}
              className="w-full h-full object-cover"
            />

            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold rounded px-1.5 py-0.5">
              {i + 1}
            </div>

            <div className="absolute top-1 right-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => handleDelete(i)}
                className="w-5 h-5 bg-red-600 text-white text-[10px] rounded-full hover:bg-red-700 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="absolute bottom-1 right-1 flex gap-0.5">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  className="w-5 h-5 bg-black/60 text-white text-[10px] rounded hover:bg-black/80 flex items-center justify-center"
                >
                  ←
                </button>
              )}
              {i < images.length - 1 && (
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  className="w-5 h-5 bg-black/60 text-white text-[10px] rounded hover:bg-black/80 flex items-center justify-center"
                >
                  →
                </button>
              )}
            </div>
          </div>
        ))}

        {images.length < maxImages && (
          <>
            <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 text-gray-400 text-xs transition-colors">
              {uploading ? (
                <span className="animate-pulse">...</span>
              ) : (
                <>
                  <span className="text-lg leading-none">+</span>
                  <span>Add</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {images.length > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {images.length}/{maxImages} images · Drag to reorder · First image is the hero
        </p>
      )}
    </div>
  );
}
