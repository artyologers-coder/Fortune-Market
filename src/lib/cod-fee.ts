export interface CodFeeProduct {
  codAmount: number | null;
  codUnit: string | null;
  codUnitsPerKg: number | null;
}

export function computeCodFee(
  quantity: number,
  product: CodFeeProduct
): number {
  if (!product.codAmount || product.codAmount <= 0) return 0;

  if (product.codUnit === "per_kg") {
    const unitsPerKg = product.codUnitsPerKg;
    if (!unitsPerKg || unitsPerKg <= 0) return 0;
    return Math.ceil(quantity / unitsPerKg) * product.codAmount;
  }

  return quantity * product.codAmount;
}