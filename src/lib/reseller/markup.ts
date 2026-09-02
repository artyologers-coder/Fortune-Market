import { PrismaClient } from "@prisma/client";

export function computeSellingPrice(sourcePrice: number, markupPercent: number): number {
  return Math.round(sourcePrice * (1 + markupPercent / 100));
}

export async function recalculateCategoryPrices(prisma: PrismaClient, categoryId: string): Promise<number> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    select: { id: true, price: true, externalPrice: true, categoryId: true },
  });

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { markupPercentage: true },
  });

  if (!category) return 0;

  const markup = category.markupPercentage;
  let updated = 0;

  for (const product of products) {
    if (product.externalPrice !== null && product.externalPrice !== undefined) {
      const newPrice = computeSellingPrice(product.externalPrice, markup);
      if (newPrice !== product.price) {
        await prisma.product.update({
          where: { id: product.id },
          data: { price: newPrice },
        });
        updated++;
      }
    }
  }

  return updated;
}

export async function recalculateAllPrices(prisma: PrismaClient): Promise<number> {
  const categories = await prisma.category.findMany({
    select: { id: true, markupPercentage: true },
  });

  const markupMap = new Map(categories.map((c) => [c.id, c.markupPercentage]));

  const products = await prisma.product.findMany({
    where: { externalPrice: { not: null } },
    select: { id: true, price: true, externalPrice: true, categoryId: true },
  });

  let updated = 0;

  for (const product of products) {
    const markup = markupMap.get(product.categoryId) ?? 15;
    const newPrice = computeSellingPrice(product.externalPrice!, markup);
    if (newPrice !== product.price) {
      await prisma.product.update({
        where: { id: product.id },
        data: { price: newPrice },
      });
      updated++;
    }
  }

  return updated;
}