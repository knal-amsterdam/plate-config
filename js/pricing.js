export const MAX_FINISHED_LENGTH_MM = 2400;
export const MAX_FINISHED_WIDTH_MM = 1200;
export const STOCK_SHEET_LENGTH_MM = 2400;
export const STOCK_SHEET_WIDTH_MM = 1200;
export const SHEET_LAYOUT_MARGIN_MM = 10;
export const SHEET_LAYOUT_GAP_MM = 10;
export const MINIMUM_PLATE_PRICE_EUR = 25;
export const MACHINE_SETUP_PRICE_EUR = 12;
export const MACHINE_PRICE_PER_METER_EUR = 4.5;
export const HOLE_PIERCE_PRICE_EUR = 0.8;
export const ROUNDED_CORNER_COMPLEXITY_PRICE_EUR = 2.5;

export const MATERIALS = [
  {
    key: "birch-multiplex",
    label: "Birch multiplex",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      6: 52,
      9: 58,
      12: 66,
      15: 74,
      18: 86,
      21: 96,
    },
  },
];

export function getMaterialByKey(materialKey) {
  return MATERIALS.find((material) => material.key === materialKey) || MATERIALS[0];
}

export function validatePlateConstraints({ materialKey, lengthMm, widthMm, thicknessMm }) {
  if (!(lengthMm > 0) || !(widthMm > 0) || !(thicknessMm > 0)) {
    throw new Error("Enter a valid length, width, and thickness to render the plywood plate.");
  }

  if (lengthMm > MAX_FINISHED_LENGTH_MM) {
    throw new Error(`Length cannot exceed ${MAX_FINISHED_LENGTH_MM} mm.`);
  }

  if (widthMm > MAX_FINISHED_WIDTH_MM) {
    throw new Error(`Width cannot exceed ${MAX_FINISHED_WIDTH_MM} mm.`);
  }

  const material = getMaterialByKey(materialKey);
  const thicknessPrice = material.priceByThickness[String(thicknessMm)];

  if (typeof thicknessPrice !== "number") {
    throw new Error(`No pricing is configured for ${material.label.toLowerCase()} in ${thicknessMm} mm.`);
  }

  const usableLengthMm = material.sheetLengthMm - (2 * SHEET_LAYOUT_MARGIN_MM);
  const usableWidthMm = material.sheetWidthMm - (2 * SHEET_LAYOUT_MARGIN_MM);
  const fitsDefault = lengthMm <= usableLengthMm && widthMm <= usableWidthMm;
  const fitsRotated = widthMm <= usableLengthMm && lengthMm <= usableWidthMm;

  if (!fitsDefault && !fitsRotated) {
    throw new Error(`This plate does not fit within the usable ${usableLengthMm} x ${usableWidthMm} mm sheet area.`);
  }
}

export function calculatePlatePricing({
  materialKey,
  quantity = 1,
  lengthMm,
  widthMm,
  thicknessMm,
  roundedCorners,
  cornerRadiusMm = 0,
  holeEnabled,
  holeCountX,
  holeCountY,
  holeDiameterMm = 0,
}) {
  const material = getMaterialByKey(materialKey);
  const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const stockSheetPriceEur = material.priceByThickness[String(thicknessMm)];
  const sheetAreaMm2 = material.sheetLengthMm * material.sheetWidthMm;
  const plateAreaMm2 = lengthMm * widthMm;
  const sheetShare = plateAreaMm2 / sheetAreaMm2;
  const materialPriceEur = roundCurrency(sheetShare * stockSheetPriceEur);
  const cutLengthMm = getPlateCutLengthMm({
    lengthMm,
    widthMm,
    roundedCorners,
    cornerRadiusMm,
    holeEnabled,
    holeCountX,
    holeCountY,
    holeDiameterMm,
  });
  const cutLengthM = cutLengthMm / 1000;
  const holeCount = holeEnabled ? Math.max(1, Math.floor(holeCountX)) * Math.max(1, Math.floor(holeCountY)) : 0;
  const roundedCornersPriceEur = roundedCorners ? 4 * ROUNDED_CORNER_COMPLEXITY_PRICE_EUR : 0;
  const holePatternPriceEur = holeCount * HOLE_PIERCE_PRICE_EUR;
  const millingPriceEur = roundCurrency(MACHINE_SETUP_PRICE_EUR + (cutLengthM * MACHINE_PRICE_PER_METER_EUR) + roundedCornersPriceEur + holePatternPriceEur);
  const subtotalEur = materialPriceEur + millingPriceEur;
  const unitPriceEur = Math.max(MINIMUM_PLATE_PRICE_EUR, roundCurrency(subtotalEur));
  const totalPriceEur = roundCurrency(unitPriceEur * normalizedQuantity);

  return {
    materialKey: material.key,
    materialLabel: material.label,
    quantity: normalizedQuantity,
    stockSheetLengthMm: material.sheetLengthMm,
    stockSheetWidthMm: material.sheetWidthMm,
    stockSheetPriceEur,
    plateAreaMm2,
    plateAreaM2: plateAreaMm2 / 1_000_000,
    sheetShare,
    materialPriceEur,
    cutLengthMm,
    cutLengthM,
    millingPriceEur,
    roundedCornersPriceEur,
    holePatternPriceEur,
    minimumChargeApplied: unitPriceEur > subtotalEur,
    unitPriceEur,
    totalPriceEur,
  };
}

export function formatEuro(value) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function getPlateCutLengthMm({
  lengthMm,
  widthMm,
  roundedCorners,
  cornerRadiusMm,
  holeEnabled,
  holeCountX,
  holeCountY,
  holeDiameterMm,
}) {
  const clampedRadiusMm = roundedCorners ? Math.max(0, Math.min(cornerRadiusMm, lengthMm / 2, widthMm / 2)) : 0;
  const squarePerimeterMm = 2 * (lengthMm + widthMm);
  const outerPerimeterMm = clampedRadiusMm > 0
    ? squarePerimeterMm - (8 * clampedRadiusMm) + (2 * Math.PI * clampedRadiusMm)
    : squarePerimeterMm;
  const holeCount = holeEnabled ? Math.max(1, Math.floor(holeCountX)) * Math.max(1, Math.floor(holeCountY)) : 0;
  const nominalHolePerimeterMm = holeEnabled && holeDiameterMm > 0 ? holeCount * Math.PI * holeDiameterMm : 0;
  return outerPerimeterMm + nominalHolePerimeterMm;
}
