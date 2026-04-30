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
    materialVariantKeyInput: document.querySelector("#material-variant-key"),
    materialVariantLabelInput: document.querySelector("#material-variant-label"),
    materialCards: Array.from(document.querySelectorAll(".material-card")),
    lengthInput: document.querySelector("#length-mm"),
    widthInput: document.querySelector("#width-mm"),
    thicknessInput: document.querySelector("#thickness-mm"),
    quantityInput: document.querySelector("#quantity"),
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
    clearQuoteButton: document.querySelector("#clear-quote-button"),
    quoteRequestButton: document.querySelector("#quote-request-button"),
    quoteList: document.querySelector("#quote-list"),
    quoteEmpty: document.querySelector("#quote-empty"),
    quoteCountBadge: document.querySelector("#quote-count-badge"),
    quoteStatusMessage: document.querySelector("#quote-status-message"),
    customerNameInput: document.querySelector("#customer-name"),
    customerEmailInput: document.querySelector("#customer-email"),
    customerPhoneInput: document.querySelector("#customer-phone"),
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
  materialVariantKeyInput,
  materialVariantLabelInput,
  lengthInput,
  widthInput,
  thicknessInput,
  quantityInput,
  roundedCornersInput,
  cornerRadiusInput,
  holeEnabledInput,
  holeXInput,
  holeYInput,
  holeCountXInput,
  holeCountYInput,
  holeDiameterInput,
}) {
  const selectedMaterialCard = Array.from(document.querySelectorAll(".material-card")).find(
    (card) => card.dataset.selected === "true"
  );

  return {
    materialKey: materialInput?.value || "birch-multiplex",
    materialVariantKey: materialVariantKeyInput?.value || selectedMaterialCard?.dataset.variantKey || "",
    materialVariantLabel: materialVariantLabelInput?.value || selectedMaterialCard?.dataset.variantLabel || "",
    lengthMm: Number(lengthInput.value),
    widthMm: Number(widthInput.value),
    thicknessMm: Number(thicknessInput.value),
    quantity: Number(quantityInput.value),
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
  metricMaterial.textContent = dimensions.materialVariantLabel
    ? `Material ${dimensions.materialLabel} (${dimensions.materialVariantLabel})`
    : `Material ${dimensions.materialLabel}`;
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

export function renderQuoteItems({ quoteList, quoteEmpty, quoteRequestButton, quoteCountBadge }, items) {
  quoteList.innerHTML = "";
  quoteEmpty.hidden = items.length > 0;
  if (quoteCountBadge) {
    quoteCountBadge.hidden = items.length === 0;
    quoteCountBadge.textContent = `${items.length} ${items.length === 1 ? "plate" : "plates"} added`;
  }

  for (const item of items) {
    const wrapper = document.createElement("article");
    wrapper.className = "quote-item";

    const title = document.createElement("p");
    title.className = "quote-item__title";
    title.textContent = item.title;

    const meta = document.createElement("p");
    meta.className = "quote-item__meta";
    meta.textContent = item.description;

    wrapper.append(title, meta);
    quoteList.append(wrapper);
  }

  if (items.length === 0) {
    quoteRequestButton.disabled = true;
    quoteRequestButton.setAttribute("aria-disabled", "true");
    return;
  }

  quoteRequestButton.disabled = false;
  quoteRequestButton.setAttribute("aria-disabled", "false");
}

export function readContactValues({ customerNameInput, customerEmailInput, customerPhoneInput }) {
  return {
    customerName: customerNameInput.value.trim(),
    customerEmail: customerEmailInput.value.trim(),
    customerPhone: customerPhoneInput.value.trim(),
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

export function syncMaterialCards({ materialCards, materialVariantKeyInput, materialVariantLabelInput }, nextVariantKey) {
  for (const card of materialCards) {
    const isSelected = card.dataset.variantKey === nextVariantKey;
    card.dataset.selected = String(isSelected);
    card.setAttribute("aria-pressed", String(isSelected));

    if (isSelected) {
      materialVariantKeyInput.value = card.dataset.variantKey || "";
      materialVariantLabelInput.value = card.dataset.variantLabel || "";
    }
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
