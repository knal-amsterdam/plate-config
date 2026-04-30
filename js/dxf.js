const DXF_EOL = "\r\n";

export function createPlateDxf(item) {
  return createOffsetPlateEntitiesDxf(item, { offsetXmm: 0, offsetYmm: 0 });
}

export function createSheetLayoutDxfs(items, {
  sheetLengthMm = 2400,
  sheetWidthMm = 1200,
  marginMm = 10,
  gapMm = 10,
} = {}) {
  const groups = groupItemsForSheetLayouts(items);

  return groups.flatMap((group) => {
    const expandedItems = expandItemsByQuantity(group.items);
    const sheets = packItemsOnSheets(expandedItems, { sheetLengthMm, sheetWidthMm, marginMm, gapMm });

    return sheets.map((sheet, index) => ({
      filename: `sheet-layout-${slugify(group.groupLabel)}-${index + 1}.dxf`,
      content: createSheetLayoutDxf(sheet, { sheetLengthMm, sheetWidthMm }),
      placements: sheet.placements,
    }));
  });
}

function createSheetLayoutDxf(sheet, { sheetLengthMm, sheetWidthMm }) {
  const entities = [];

  addRectangle(entities, 0, 0, sheetLengthMm, sheetWidthMm, "SHEET");

  for (const placement of sheet.placements) {
    addOffsetPlateEntities(entities, placement.item, {
      offsetXmm: placement.x,
      offsetYmm: placement.y,
      rotated: placement.rotated,
    });
    addPlacementLabel(entities, placement);
  }

  return buildDxfDocument(entities);
}

function createOffsetPlateEntitiesDxf(item, { offsetXmm, offsetYmm, rotated = false }) {
  const values = item.values;
  const entities = [];

  addOffsetPlateEntities(entities, item, { offsetXmm, offsetYmm, rotated });
  return buildDxfDocument(entities);
}

function addOffsetPlateEntities(entities, item, { offsetXmm, offsetYmm, rotated = false }) {
  const values = getTransformedValues(item.values, rotated);
  addOuterProfile(entities, values, offsetXmm, offsetYmm);
  addHoleCircles(entities, values, offsetXmm, offsetYmm);
}

function addOuterProfile(entities, values, offsetXmm = 0, offsetYmm = 0) {
  const { lengthMm, widthMm, roundedCorners, cornerRadiusMm } = values;
  const radius = roundedCorners ? Math.max(0, Math.min(cornerRadiusMm, lengthMm / 2, widthMm / 2)) : 0;

  if (radius <= 0) {
    addLine(entities, offsetXmm, offsetYmm, offsetXmm + lengthMm, offsetYmm);
    addLine(entities, offsetXmm + lengthMm, offsetYmm, offsetXmm + lengthMm, offsetYmm + widthMm);
    addLine(entities, offsetXmm + lengthMm, offsetYmm + widthMm, offsetXmm, offsetYmm + widthMm);
    addLine(entities, offsetXmm, offsetYmm + widthMm, offsetXmm, offsetYmm);
    return;
  }

  addLine(entities, offsetXmm + radius, offsetYmm, offsetXmm + lengthMm - radius, offsetYmm);
  addArc(entities, offsetXmm + lengthMm - radius, offsetYmm + radius, radius, 270, 360);
  addLine(entities, offsetXmm + lengthMm, offsetYmm + radius, offsetXmm + lengthMm, offsetYmm + widthMm - radius);
  addArc(entities, offsetXmm + lengthMm - radius, offsetYmm + widthMm - radius, radius, 0, 90);
  addLine(entities, offsetXmm + lengthMm - radius, offsetYmm + widthMm, offsetXmm + radius, offsetYmm + widthMm);
  addArc(entities, offsetXmm + radius, offsetYmm + widthMm - radius, radius, 90, 180);
  addLine(entities, offsetXmm, offsetYmm + widthMm - radius, offsetXmm, offsetYmm + radius);
  addArc(entities, offsetXmm + radius, offsetYmm + radius, radius, 180, 270);
}

function addHoleCircles(entities, values, offsetXmm = 0, offsetYmm = 0) {
  if (!values.holeEnabled || !(values.holeDiameterMm > 0)) {
    return;
  }

  const xPositions = createPatternPositions(values.lengthMm, values.holeXmm, values.holeCountX);
  const yPositions = createPatternPositions(values.widthMm, values.holeYmm, values.holeCountY);
  const radius = values.holeDiameterMm / 2;

  for (const x of xPositions) {
    for (const y of yPositions) {
      addCircle(entities, offsetXmm + x, offsetYmm + y, radius);
    }
  }
}

function createPatternPositions(totalMm, firstOffsetMm, countValue) {
  const count = Math.max(1, Math.floor(countValue));

  if (count === 1) {
    return [firstOffsetMm];
  }

  const spacing = (totalMm - (2 * firstOffsetMm)) / (count - 1);
  return Array.from({ length: count }, (_, index) => firstOffsetMm + (spacing * index));
}

function addLine(entities, x1, y1, x2, y2) {
  entities.push(
    "0",
    "LINE",
    "8",
    "OUTLINE",
    "10",
    formatNumber(x1),
    "20",
    formatNumber(y1),
    "30",
    "0.0",
    "11",
    formatNumber(x2),
    "21",
    formatNumber(y2),
    "31",
    "0.0"
  );
}

function addRectangle(entities, x, y, lengthMm, widthMm, layerName) {
  entities.push(
    "0", "LWPOLYLINE",
    "8", layerName,
    "90", "4",
    "70", "1",
    "10", formatNumber(x), "20", formatNumber(y),
    "10", formatNumber(x + lengthMm), "20", formatNumber(y),
    "10", formatNumber(x + lengthMm), "20", formatNumber(y + widthMm),
    "10", formatNumber(x), "20", formatNumber(y + widthMm)
  );
}

function addArc(entities, x, y, radius, startAngle, endAngle) {
  entities.push(
    "0",
    "ARC",
    "8",
    "OUTLINE",
    "10",
    formatNumber(x),
    "20",
    formatNumber(y),
    "30",
    "0.0",
    "40",
    formatNumber(radius),
    "50",
    formatNumber(startAngle),
    "51",
    formatNumber(endAngle)
  );
}

function addCircle(entities, x, y, radius) {
  entities.push(
    "0",
    "CIRCLE",
    "8",
    "HOLES",
    "10",
    formatNumber(x),
    "20",
    formatNumber(y),
    "30",
    "0.0",
    "40",
    formatNumber(radius)
  );
}

function addPlacementLabel(entities, placement) {
  entities.push(
    "0",
    "TEXT",
    "8",
    "LABELS",
    "10",
    formatNumber(placement.x + 12),
    "20",
    formatNumber(placement.y + 18),
    "30",
    "0.0",
    "40",
    "12.0",
    "1",
    `${placement.item.title} x${placement.item.values.quantityInstance || 1}`
  );
}

function buildDxfDocument(entities) {
  const sections = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$INSUNITS",
    "70",
    "4",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entities,
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ];

  return sections.join(DXF_EOL);
}

function getTransformedValues(values, rotated) {
  if (!rotated) {
    return values;
  }

  return {
    ...values,
    lengthMm: values.widthMm,
    widthMm: values.lengthMm,
    holeXmm: values.holeYmm,
    holeYmm: values.holeXmm,
    holeCountX: values.holeCountY,
    holeCountY: values.holeCountX,
  };
}

function expandItemsByQuantity(items) {
  return items.flatMap((item) => {
    const quantity = Math.max(1, Math.floor(Number(item.values.quantity || 1)));
    return Array.from({ length: quantity }, (_, index) => ({
      ...item,
      title: quantity > 1 ? `${item.title}-${index + 1}` : item.title,
      values: {
        ...item.values,
        quantityInstance: 1,
      },
    }));
  });
}

function groupItemsForSheetLayouts(items) {
  const groups = new Map();

  for (const item of items) {
    const groupKey = `${item.values.materialKey || "material"}-${item.values.thicknessMm}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupLabel: `${item.values.materialLabel || "material"}-${item.values.thicknessMm}mm`,
        items: [],
      });
    }

    groups.get(groupKey).items.push(item);
  }

  return Array.from(groups.values());
}

function packItemsOnSheets(items, { sheetLengthMm, sheetWidthMm, marginMm, gapMm }) {
  const usableLengthMm = sheetLengthMm - (2 * marginMm);
  const usableWidthMm = sheetWidthMm - (2 * marginMm);
  const sorted = [...items].sort((a, b) => Math.max(b.values.lengthMm, b.values.widthMm) - Math.max(a.values.lengthMm, a.values.widthMm));
  const sheets = [];

  for (const item of sorted) {
    let placed = false;

    for (const sheet of sheets) {
      if (tryPlaceOnSheet(sheet, item, { usableLengthMm, usableWidthMm, marginMm, gapMm })) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      const sheet = {
        placements: [],
        cursorX: marginMm,
        cursorY: marginMm,
        rowHeight: 0,
      };

      if (!tryPlaceOnSheet(sheet, item, { usableLengthMm, usableWidthMm, marginMm, gapMm })) {
        throw new Error(`Could not place ${item.title} on a ${sheetLengthMm} x ${sheetWidthMm} mm sheet.`);
      }

      sheets.push(sheet);
    }
  }

  return sheets;
}

function tryPlaceOnSheet(sheet, item, { usableLengthMm, usableWidthMm, marginMm, gapMm }) {
  const options = [
    { rotated: false, lengthMm: item.values.lengthMm, widthMm: item.values.widthMm },
    { rotated: true, lengthMm: item.values.widthMm, widthMm: item.values.lengthMm },
  ];

  for (const option of options) {
    const placed = tryPlaceOrientation(sheet, item, option, { usableLengthMm, usableWidthMm, marginMm, gapMm });
    if (placed) {
      return true;
    }
  }

  return false;
}

function tryPlaceOrientation(sheet, item, option, { usableLengthMm, usableWidthMm, marginMm, gapMm }) {
  let candidateX = sheet.cursorX;
  let candidateY = sheet.cursorY;
  let rowHeight = sheet.rowHeight;

  if ((candidateX - marginMm) + option.lengthMm > usableLengthMm) {
    candidateX = marginMm;
    candidateY = candidateY + rowHeight + gapMm;
    rowHeight = 0;
  }

  if ((candidateX - marginMm) + option.lengthMm > usableLengthMm || (candidateY - marginMm) + option.widthMm > usableWidthMm) {
    return false;
  }

  sheet.placements.push({
    item,
    x: candidateX,
    y: candidateY,
    rotated: option.rotated,
    lengthMm: option.lengthMm,
    widthMm: option.widthMm,
  });

  sheet.cursorX = candidateX + option.lengthMm + gapMm;
  sheet.cursorY = candidateY;
  sheet.rowHeight = Math.max(rowHeight, option.widthMm);
  return true;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatNumber(value) {
  return Number(value).toFixed(4);
}
