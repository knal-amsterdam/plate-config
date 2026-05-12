export function getDomReferences() {
  return {
    page: document.querySelector(".page"),
    panel: document.querySelector("#controls-drawer"),
    form: document.querySelector("#panel-form"),
    accordionSteps: Array.from(document.querySelectorAll(".accordion-step")),
    openControlsButton: document.querySelector("#open-controls-button"),
    closeControlsButton: document.querySelector("#close-controls-button"),
    mobileBackdrop: document.querySelector("#mobile-backdrop"),
    materialInput: document.querySelector("#material-key"),
    materialCards: Array.from(document.querySelectorAll(".material-card")),
    lengthInput: document.querySelector("#length-mm"),
    widthInput: document.querySelector("#width-mm"),
    thicknessInput: document.querySelector("#thickness-mm"),
    quantityInput: document.querySelector("#quantity"),
    edgeTreatmentInput: document.querySelector("#edge-treatment"),
    roundedCornersInput: document.querySelector("#rounded-corners"),
    cornerChoiceCards: Array.from(document.querySelectorAll('[data-choice-group="corners"]')),
    cornerRadiusInput: document.querySelector("#corner-radius-mm"),
    cornerRadiusField: document.querySelector("#corner-radius-field"),
    cornerRadiusPanel: document.querySelector("#corner-radius-panel"),
    holeEnabledInput: document.querySelector("#hole-enabled"),
    holeChoiceCards: Array.from(document.querySelectorAll('[data-choice-group="holes"]')),
    holeXInput: document.querySelector("#hole-x-mm"),
    holeYInput: document.querySelector("#hole-y-mm"),
    holeCountXInput: document.querySelector("#hole-count-x"),
    holeCountYInput: document.querySelector("#hole-count-y"),
    holeDiameterInput: document.querySelector("#hole-diameter-mm"),
    holeFields: document.querySelector("#hole-fields"),
    holePatternFields: document.querySelector("#hole-pattern-fields"),
    holeSizeFields: document.querySelector("#hole-size-fields"),
    holeSettingsPanel: document.querySelector("#hole-settings-panel"),
    addPlankButton: document.querySelector("#add-plank-button"),
    saveNewPlankButton: document.querySelector("#save-new-plank-button"),
    reviewOverviewButton: document.querySelector("#review-overview-button"),
    overviewButton: document.querySelector("#overview-button"),
    viewerOverviewButton: document.querySelector("#viewer-overview-button"),
    clearQuoteButton: document.querySelector("#clear-quote-button"),
    quoteRequestButton: document.querySelector("#quote-request-button"),
    quoteCountBadge: document.querySelector("#quote-count-badge"),
    quoteStatusMessage: document.querySelector("#quote-status-message"),
    overviewModal: document.querySelector("#overview-modal"),
    overviewBackdrop: document.querySelector("#overview-backdrop"),
    closeOverviewButton: document.querySelector("#close-overview-button"),
    overviewEmpty: document.querySelector("#overview-empty"),
    overviewTableWrap: document.querySelector("#overview-table-wrap"),
    overviewTableBody: document.querySelector("#overview-table-body"),
    customerNameInput: document.querySelector("#customer-name"),
    customerEmailInput: document.querySelector("#customer-email"),
    customerPhoneInput: document.querySelector("#customer-phone"),
    customerDeliveryInput: document.querySelector("#customer-delivery"),
    customerNoteInput: document.querySelector("#customer-note"),
    statusMessage: document.querySelector("#status-message"),
    modelViewer: document.querySelector("#model-viewer"),
    emptyState: document.querySelector("#viewer-empty"),
    metricMaterial: document.querySelector("#metric-material"),
    metricLength: document.querySelector("#metric-length"),
    metricWidth: document.querySelector("#metric-width"),
    metricThickness: document.querySelector("#metric-thickness"),
    metricQuantity: document.querySelector("#metric-quantity"),
    metricCornerRadius: document.querySelector("#metric-corner-radius"),
    metricHole: document.querySelector("#metric-hole"),
  };
}

export function isMobileViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

export function readFormValues({
  materialInput,
  lengthInput,
  widthInput,
  thicknessInput,
  quantityInput,
  edgeTreatmentInput,
  roundedCornersInput,
  cornerRadiusInput,
  holeEnabledInput,
  holeXInput,
  holeYInput,
  holeCountXInput,
  holeCountYInput,
  holeDiameterInput,
}) {
  return {
    materialKey: materialInput?.value || "multiplex-b-bb",
    lengthMm: Number(lengthInput.value),
    widthMm: Number(widthInput.value),
    thicknessMm: Number(thicknessInput.value),
    quantity: Number(quantityInput.value),
    edgeTreatment: edgeTreatmentInput.checked,
    edgeTreatmentMm: edgeTreatmentInput.checked ? 3.2 : 0,
    roundedCorners: roundedCornersInput.checked,
    cornerRadiusMm: Number(cornerRadiusInput.value),
    holeEnabled: holeEnabledInput.checked,
    holeXmm: Number(holeXInput.value),
    holeYmm: Number(holeYInput.value),
    holeCountX: Number(holeCountXInput.value),
    holeCountY: Number(holeCountYInput.value),
    holeDiameterMm: Number(holeDiameterInput.value),
  };
}

export function setStatus(statusElement, message, state = "idle") {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

export function updateMetrics({
  metricMaterial,
  metricLength,
  metricWidth,
  metricThickness,
  metricQuantity,
  metricCornerRadius,
  metricHole,
}, dimensions) {
  metricMaterial.textContent = `Material ${dimensions.materialLabel}`;
  metricLength.textContent = `Length ${dimensions.lengthMm.toFixed(0)} mm`;
  metricWidth.textContent = `Width ${dimensions.widthMm.toFixed(0)} mm`;
  metricThickness.textContent = `Thickness ${dimensions.thicknessMm.toFixed(0)} mm`;
  metricQuantity.textContent = `Quantity ${dimensions.quantity.toFixed(0)}`;
  metricCornerRadius.textContent = dimensions.cornerRadiusMm > 0
    ? `Corner radius ${dimensions.cornerRadiusMm.toFixed(0)} mm`
    : "Corner radius Square";
  metricHole.textContent = dimensions.holeDiameterMm > 0
    ? `Hole ${dimensions.holeCountX.toFixed(0)}x${dimensions.holeCountY.toFixed(0)}, ${dimensions.holeXmm.toFixed(0)}/${dimensions.holeYmm.toFixed(0)}, d${dimensions.holeDiameterMm.toFixed(0)} mm`
    : "Hole None";
}

export function resetMetrics({ metricMaterial, metricLength, metricWidth, metricThickness, metricQuantity, metricCornerRadius, metricHole }) {
  metricMaterial.textContent = "Material -";
  metricLength.textContent = "Length -";
  metricWidth.textContent = "Width -";
  metricThickness.textContent = "Thickness -";
  metricQuantity.textContent = "Quantity -";
  metricCornerRadius.textContent = "Corner radius -";
  metricHole.textContent = "Hole -";
}

export function syncCornerRadiusField({ roundedCornersInput, cornerRadiusInput, cornerRadiusField, cornerRadiusPanel }) {
  const isEnabled = roundedCornersInput.checked;
  cornerRadiusInput.disabled = !isEnabled;
  cornerRadiusField.dataset.disabled = String(!isEnabled);

  if (cornerRadiusPanel) {
    cornerRadiusPanel.hidden = !isEnabled;
  }
}

export function syncHoleFields({
  holeEnabledInput,
  holeXInput,
  holeYInput,
  holeCountXInput,
  holeCountYInput,
  holeDiameterInput,
  holeFields,
  holePatternFields,
  holeSizeFields,
  holeSettingsPanel,
}) {
  const isEnabled = holeEnabledInput.checked;
  holeXInput.disabled = !isEnabled;
  holeYInput.disabled = !isEnabled;
  holeCountXInput.disabled = !isEnabled;
  holeCountYInput.disabled = !isEnabled;
  holeDiameterInput.disabled = !isEnabled;
  holeFields.dataset.disabled = String(!isEnabled);
  holePatternFields.dataset.disabled = String(!isEnabled);
  holeSizeFields.dataset.disabled = String(!isEnabled);

  if (holeSettingsPanel) {
    holeSettingsPanel.hidden = !isEnabled;
  }
}

export function renderQuoteItems({ quoteRequestButton, quoteCountBadge }, items) {
  if (quoteCountBadge) {
    quoteCountBadge.hidden = items.length === 0;
    quoteCountBadge.textContent = `${items.length} ${items.length === 1 ? "plate" : "plates"} added`;
  }

  if (items.length === 0) {
    quoteRequestButton.disabled = true;
    quoteRequestButton.setAttribute("aria-disabled", "true");
    return;
  }

  quoteRequestButton.disabled = false;
  quoteRequestButton.setAttribute("aria-disabled", "false");
}

export function readContactValues({ customerNameInput, customerEmailInput, customerPhoneInput, customerDeliveryInput, customerNoteInput }) {
  return {
    customerName: customerNameInput.value.trim(),
    customerEmail: customerEmailInput.value.trim(),
    customerPhone: customerPhoneInput.value.trim(),
    customerDelivery: customerDeliveryInput?.value || "collect",
    customerNote: customerNoteInput.value.trim(),
  };
}

export function setExpandedStep(steps, activeStep) {
  for (const step of steps) {
    const stepNumber = Number(step.dataset.step);
    const isActive = stepNumber === activeStep;
    const button = step.querySelector(".accordion-step__header");
    const panel = step.querySelector(".accordion-step__panel");

    step.dataset.expanded = String(isActive);
    button.setAttribute("aria-expanded", String(isActive));
    panel.hidden = !isActive;
  }
}

export function renderOverviewTable({
  reviewOverviewButton,
  overviewButton,
  viewerOverviewButton,
  overviewEmpty,
  overviewTableWrap,
  overviewTableBody,
  thicknessInput,
  materialCards,
}, items) {
  const canOpenOverview = true;
  const hasOverviewContent = items.length > 0;

  if (reviewOverviewButton) {
    reviewOverviewButton.hidden = !canOpenOverview;
    reviewOverviewButton.disabled = !canOpenOverview;
    reviewOverviewButton.setAttribute("aria-disabled", String(!canOpenOverview));
  }

  if (overviewButton) {
    overviewButton.hidden = !canOpenOverview;
    overviewButton.disabled = !canOpenOverview;
    overviewButton.setAttribute("aria-disabled", String(!canOpenOverview));
  }

  if (viewerOverviewButton) {
    viewerOverviewButton.hidden = !canOpenOverview;
    viewerOverviewButton.disabled = !canOpenOverview;
    viewerOverviewButton.setAttribute("aria-disabled", String(!canOpenOverview));
  }

  if (!overviewEmpty || !overviewTableWrap || !overviewTableBody) {
    return;
  }

  overviewTableBody.innerHTML = "";
  overviewEmpty.hidden = hasOverviewContent;
  overviewTableWrap.hidden = !hasOverviewContent;

  for (const [index, item] of items.entries()) {
    const row = document.createElement("tr");
    const values = item.values || {};
    row.dataset.index = String(index);
    const cornersText = values.roundedCorners ? `${values.cornerRadiusMm} mm radius` : "Square";
    const holesText = values.holeEnabled
      ? `${values.holeCountX}x${values.holeCountY}, ${values.holeXmm}/${values.holeYmm}, d${values.holeDiameterMm}`
      : "None";

    row.append(
      createTableCell(createTitleInput(item.title)),
      createTableCell(createNumberInput("quantity", values.quantity, { min: 1, step: 1 })),
      createTableCell(createMaterialEditor(values, materialCards)),
      createTableCell(createNumberInput("lengthMm", values.lengthMm, { min: 1, step: 1 })),
      createTableCell(createNumberInput("widthMm", values.widthMm, { min: 1, step: 1 })),
      createTableCell(createThicknessEditor(values, thicknessInput)),
      createTableCell(cornersText),
      createTableCell(holesText),
      createTableCell(createSaveButton()),
      createTableCell(createLoadButton())
      // createTableCell(createDeleteButton())
    );

    overviewTableBody.append(row);
  }
}

function createTableCell(content) {
  const cell = document.createElement("td");
  if (typeof content === "string") {
    cell.textContent = content;
  } else if (content) {
    cell.append(content);
  }
  return cell;
}

function createTitleInput(value) {
  const input = document.createElement("input");
  input.className = "overview-input";
  input.type = "text";
  input.value = value || "";
  input.dataset.field = "title";
  input.setAttribute("aria-label", "Plank name");
  return input;
}

function createNumberInput(field, value, { min = 0, step = 1 } = {}) {
  const input = document.createElement("input");
  input.className = "overview-input overview-input--number";
  input.type = "number";
  input.value = String(value ?? "");
  input.min = String(min);
  input.step = String(step);
  input.dataset.field = field;
  input.setAttribute("aria-label", field);
  return input;
}

function createSelect(field, value, options, ariaLabel) {
  const select = document.createElement("select");
  select.className = "overview-select";
  select.dataset.field = field;
  select.setAttribute("aria-label", ariaLabel);

  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue.value;
    option.textContent = optionValue.label;
    option.selected = optionValue.value === String(value);
    select.append(option);
  }

  return select;
}

function createEditorStack(label, controls) {
  const wrapper = document.createElement("div");
  wrapper.className = "overview-stack";

  const title = document.createElement("span");
  title.className = "overview-stack__label";
  title.textContent = label;

  const body = document.createElement("div");
  body.className = "overview-stack__controls";

  for (const control of controls) {
    body.append(control);
  }

  wrapper.append(title, body);
  return wrapper;
}

function createMaterialEditor(values, materialCards = []) {
  const materialOptions = materialCards.map((card) => ({
    value: card.dataset.materialKey || "",
    label: card.textContent?.trim() || card.dataset.materialKey || "",
  }));
  return createSelect("materialKey", values.materialKey, materialOptions, "Material");
}

function createThicknessEditor(values, thicknessInput) {
  const thicknessOptions = Array.from(thicknessInput?.options || []).map((option) => ({
    value: option.value,
    label: option.textContent?.trim() || option.value,
  }));

  return createSelect("thicknessMm", values.thicknessMm, thicknessOptions, "Thickness");
}

function createLoadButton() {
  const button = document.createElement("button");
  button.className = "overview-icon-button";
  button.type = "button";
  button.dataset.action = "load-plank";
  button.setAttribute("aria-label", "Load plank in viewer");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a9 9 0 1 0 9 9a9.01 9.01 0 0 0-9-9Zm0 3.3a5.7 5.7 0 1 1-5.7 5.7A5.71 5.71 0 0 1 12 6.3Zm0 2.1a3.6 3.6 0 1 0 3.6 3.6A3.6 3.6 0 0 0 12 8.4Z" />
    </svg>
  `;
  return button;
}

function createSaveButton() {
  const button = document.createElement("button");
  button.className = "overview-action-button";
  button.type = "button";
  button.dataset.action = "save-plank";
  button.textContent = "Save";
  return button;
}

// function createDeleteButton() {
//   const button = document.createElement("button");
//   button.className = "overview-action-button overview-action-button--delete";
//   button.type = "button";
//   button.dataset.action = "delete-plank";
//   button.textContent = "Delete";
//   return button;
// }

export function syncMaterialCards({ materialCards, materialInput }, nextMaterialKey) {
  for (const card of materialCards) {
    const isSelected = card.dataset.materialKey === nextMaterialKey;
    card.dataset.selected = String(isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  }
  materialInput.value = nextMaterialKey;
}

export function syncThicknessOptions({ thicknessInput }, material) {
  const currentValue = thicknessInput.value;
  thicknessInput.innerHTML = "";

  const thicknesses = Object.keys(material.priceByThickness).map(Number).sort((a, b) => a - b);
  for (const thickness of thicknesses) {
    const option = document.createElement("option");
    option.value = String(thickness);
    option.textContent = `${thickness} mm`;
    thicknessInput.append(option);
  }

  if (thicknesses.includes(Number(currentValue))) {
    thicknessInput.value = currentValue;
  } else {
    thicknessInput.value = String(thicknesses[thicknesses.length - 1] || "");
  }
}

export function syncChoiceCards(cards, selectedValue) {
  for (const card of cards) {
    const isSelected = card.dataset.choiceValue === String(selectedValue);
    card.dataset.selected = String(isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  }
}

export function openMobileDrawer({ page, panel, openControlsButton, closeControlsButton, mobileBackdrop }) {
  if (!page || !panel || !openControlsButton || !closeControlsButton || !mobileBackdrop) {
    return;
  }

  page.dataset.mobileDrawerOpen = "true";
  panel.setAttribute("aria-hidden", "false");
  mobileBackdrop.hidden = false;
  openControlsButton.setAttribute("aria-expanded", "true");
  closeControlsButton.focus();
}

export function closeMobileDrawer({ page, panel, openControlsButton, mobileBackdrop }, { restoreFocus = true } = {}) {
  if (!page || !panel || !openControlsButton || !mobileBackdrop) {
    return;
  }

  page.dataset.mobileDrawerOpen = "false";
  panel.setAttribute("aria-hidden", "true");
  mobileBackdrop.hidden = true;
  openControlsButton.setAttribute("aria-expanded", "false");

  if (restoreFocus) {
    openControlsButton.focus();
  }
}

export function openOverviewModal({ overviewModal, closeOverviewButton }) {
  if (!overviewModal) {
    return;
  }

  overviewModal.hidden = false;
  overviewModal.setAttribute("aria-hidden", "false");
  document.body.dataset.modalOpen = "true";

  if (closeOverviewButton) {
    closeOverviewButton.focus();
  }
}

export function closeOverviewModal({ overviewModal, overviewButton }, { restoreFocus = true } = {}) {
  if (!overviewModal) {
    return;
  }

  overviewModal.hidden = true;
  overviewModal.setAttribute("aria-hidden", "true");
  delete document.body.dataset.modalOpen;

  if (restoreFocus && overviewButton && !overviewButton.disabled) {
    overviewButton.focus();
  }
}
