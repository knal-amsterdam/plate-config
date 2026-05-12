export const MAX_FINISHED_LENGTH_MM = 2420;
export const MAX_FINISHED_WIDTH_MM = 1200;
export const MIN_FINISHED_LENGTH_MM = 20;
export const MIN_FINISHED_WIDTH_MM = 20;
export const STOCK_SHEET_LENGTH_MM = 2440;
export const STOCK_SHEET_WIDTH_MM = 1220;
export const SHEET_LAYOUT_MARGIN_MM = 10;
export const SHEET_LAYOUT_GAP_MM = 10;
export const MINIMUM_PLATE_PRICE_EUR = 25;
export const MACHINE_SETUP_PRICE_EUR = 100;
export const TRANSPORT_HANDLING_PRICE_EUR = 100;
export const MATERIAL_MARKUP_MULTIPLIER = 1.5;
export const HOLE_PIERCE_PRICE_EUR = 0.8;
export const ROUNDED_CORNER_COMPLEXITY_PRICE_EUR = 2.5;

export const MATERIALS = [
  {
    key: "multiplex-b-bb",
    label: "Multiplex B/BB",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      3: 0,
      5: 0,
      8: 0,
      12: 93.00,
      15: 110.20,
      18: 145.00,
    },
  },
  {
    key: "multiplex-cp-cp",
    label: "Multiplex CP/CP",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      3: 0,
      5: 0,
      8: 0,
      12: 0,
      15: 0,
      18: 0,
    },
  },
  {
    key: "okoume",
    label: "Okoumé",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      6: 56.10,
      8: 0,
      10: 77.44,
      12: 89.48,
      15: 103.27,
      18: 124.51,
      22: 0,
    },
  },
  {
    key: "radiata",
    label: "Radiata",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      6: 25.65,
      9: 36.26,
      12: 40.91,
      15: 48.46,
      18: 58.49,
    },
  },
  {
    key: "berken",
    label: "Berken",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      9: 68.00,
      12: 93.00,
      18: 145.00,
    },
  },
  {
    key: "eucalyptus",
    label: "Eucalyptus",
    sheetLengthMm: STOCK_SHEET_LENGTH_MM,
    sheetWidthMm: STOCK_SHEET_WIDTH_MM,
    priceByThickness: {
      18: 52.49,
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

  if (lengthMm < MIN_FINISHED_LENGTH_MM || widthMm < MIN_FINISHED_WIDTH_MM) {
    throw new Error(`Minimum plate size is ${MIN_FINISHED_LENGTH_MM} × ${MIN_FINISHED_WIDTH_MM} mm.`);
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
  const fullSheetsNeeded = normalizedQuantity;
  const sheetShare = plateAreaMm2 / sheetAreaMm2;
  const materialPriceEur = roundCurrency(stockSheetPriceEur * fullSheetsNeeded);
  const materialPriceWithMarkupEur = roundCurrency(materialPriceEur * MATERIAL_MARKUP_MULTIPLIER);
  const materialMarkupEur = roundCurrency(materialPriceWithMarkupEur - materialPriceEur);
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
  const millingPriceEur = roundCurrency(MACHINE_SETUP_PRICE_EUR * fullSheetsNeeded);
  const unitPriceEur = Math.max(
    MINIMUM_PLATE_PRICE_EUR,
    roundCurrency((stockSheetPriceEur * MATERIAL_MARKUP_MULTIPLIER) + MACHINE_SETUP_PRICE_EUR)
  );
  const subtotalEur = materialPriceWithMarkupEur + millingPriceEur;
  const totalPriceEur = roundCurrency(subtotalEur);

  return {
    materialKey: material.key,
    materialLabel: material.label,
    quantity: normalizedQuantity,
    stockSheetLengthMm: material.sheetLengthMm,
    stockSheetWidthMm: material.sheetWidthMm,
    stockSheetPriceEur,
    fullSheetsNeeded,
    plateAreaMm2,
    plateAreaM2: plateAreaMm2 / 1_000_000,
    sheetShare,
    materialPriceEur,
    materialMarkupEur,
    materialPriceWithMarkupEur,
    cutLengthMm,
    cutLengthM,
    millingPriceEur,
    roundedCornersPriceEur,
    holePatternPriceEur,
    minimumChargeApplied: false,
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
