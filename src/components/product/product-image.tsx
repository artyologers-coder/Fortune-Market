import { getFirstImage } from "@/lib/product-images";

interface ProductImageProps {
  images: string | string[] | null | undefined;
  alt: string;
  imgClassName?: string;
  emojiClass?: string;
}

export function ProductImage({
  images,
  alt,
  imgClassName = "",
  emojiClass = "text-4xl",
}: ProductImageProps) {
  const src = getFirstImage(images);

  if (src) {
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