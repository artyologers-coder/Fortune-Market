import Image from "next/image";
import { getFirstImage } from "@/lib/product-images";

interface ProductImageProps {
  images: string | string[] | null | undefined;
  alt: string;
  imgClassName?: string;
  emojiClass?: string;
}

function isSupportedImageHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "images.unsplash.com" ||
      host.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export function ProductImage({
  images,
  alt,
  imgClassName = "",
  emojiClass = "text-4xl",
}: ProductImageProps) {
  const src = getFirstImage(images);

  if (src) {
    if (isSupportedImageHost(src)) {
      return (
        <div className={`relative w-full aspect-square overflow-hidden ${imgClassName}`}>
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        </div>
      );
    }

    return (
      <img
        src={src}
        alt={alt}
        className={`w-full aspect-square object-cover ${imgClassName}`}
      />
    );
  }

  return (
    <div
      className={`aspect-square bg-gray-100 flex items-center justify-center text-gray-400 ${emojiClass}`}
    >
      📦
    </div>
  );
}