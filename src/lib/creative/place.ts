import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getImagesList } from "@/lib/product-images";
import { CreativeError } from "@/lib/creative/errors";

async function deleteBlobs(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await del(urls);
  } catch (error) {
    console.error("Blob cleanup failed (original images kept on Vercel):", error);
  }
}

export async function approveCreative(
  productId: string,
  producerId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { creative: true },
  });

  if (!product || product.producerId !== producerId) {
    throw new CreativeError("Product not found.");
  }

  const creative = product.creative;
  if (!creative) {
    throw new CreativeError(
      "No creative exists for this product. Create one first."
    );
  }

  const previousImages = getImagesList(product.images);

  const [updatedProduct, updatedCreative] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: {
        images: JSON.stringify([creative.imageUrl]),
        ...(product.brandLogoUrl ? { brandLogoUrl: null } : {}),
      },
    }),
    prisma.productCreative.update({
      where: { productId },
      data: { status: "ACTIVE", approvedAt: new Date() },
    }),
  ]);

  const markedForDeletion = [...previousImages];
  if (product.brandLogoUrl) markedForDeletion.push(product.brandLogoUrl);
  const toDelete = markedForDeletion.filter((u) => u !== creative.imageUrl);

  await deleteBlobs(toDelete);

  return { creative: updatedCreative, product: updatedProduct };
}