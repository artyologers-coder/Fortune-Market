export interface CodFeeProduct {
  codAmount: number | null;
  codUnit: string | null;
  codUnitsPerKg: number | null;
  codAdditionalKgRate: number | null;
}

export function computeCodFee(
  quantity: number,
  product: CodFeeProduct
): number {
  if (!product.codAmount || product.codAmount <= 0) return 0;

  if (product.codUnit === "per_kg") {
    const unitsPerKg = product.codUnitsPerKg;
    if (!unitsPerKg || unitsPerKg <= 0) return 0;
    const kg = Math.ceil(quantity / unitsPerKg);
    const additional = product.codAdditionalKgRate ?? product.codAmount;
    return product.codAmount + additional * (kg - 1);
  }

  return quantity * product.codAmount;
}