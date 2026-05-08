import { exportSceneToGlb } from "./glb-exporter.js";
import { createPlywoodPlateModel, disposePlywoodPlateModel } from "./model-factory.js";
import { calculatePlatePricing, formatEuro, getMaterialByKey, validatePlateConstraints } from "./pricing.js";
import { createPreviewController } from "./preview.js";
import {
  closeOverviewModal,
  closeMobileDrawer,
  getDomReferences,
  isMobileViewport,
  openOverviewModal,
  openMobileDrawer,
  readContactValues,
  readFormValues,
  resetMetrics,
  renderOverviewTable,
  renderQuoteItems,
  setStatus,
  setExpandedStep,
  syncChoiceCards,
  syncMaterialCards,
  syncCornerRadiusField,
  syncHoleFields,
  updateMetrics,
} from "./ui.js";

const dom = getDomReferences();
const preview = createPreviewController({
  modelViewer: dom.modelViewer,
  emptyState: dom.emptyState,
});

let currentModel = null;
let quoteItems = [];
let editingQuoteIndex = null;

dom.form.addEventListener("submit", preventSubmitOnly);
dom.openControlsButton.addEventListener("click", handleOpenControls);
dom.closeControlsButton.addEventListener("click", handleCloseControls);
dom.mobileBackdrop.addEventListener("click", handleCloseControls);
for (const step of dom.accordionSteps) {
  step.querySelector(".accordion-step__header").addEventListener("click", () => {
    setExpandedStep(dom.accordionSteps, Number(step.dataset.step));
  });
}
dom.materialInput.addEventListener("change", handleInputChange);
for (const card of dom.materialCards) {
  card.addEventListener("click", () => handleMaterialCardSelect(card));
}
dom.lengthInput.addEventListener("input", handleInputChange);
dom.widthInput.addEventListener("input", handleInputChange);
dom.thicknessInput.addEventListener("change", handleInputChange);
dom.quantityInput.addEventListener("input", handleInputChange);
dom.roundedCornersInput.addEventListener("change", handleRoundedCornersChange);
for (const card of dom.cornerChoiceCards) {
  card.addEventListener("click", () => handleCornerChoiceSelect(card));
}
dom.cornerRadiusInput.addEventListener("input", handleInputChange);
dom.holeEnabledInput.addEventListener("change", handleHoleChange);
for (const card of dom.holeChoiceCards) {
  card.addEventListener("click", () => handleHoleChoiceSelect(card));
}
dom.holeXInput.addEventListener("input", handleInputChange);
dom.holeYInput.addEventListener("input", handleInputChange);
dom.holeCountXInput.addEventListener("input", handleInputChange);
dom.holeCountYInput.addEventListener("input", handleInputChange);
dom.holeDiameterInput.addEventListener("input", handleInputChange);
dom.addPlankButton.addEventListener("click", handleAddPlank);
dom.saveNewPlankButton.addEventListener("click", handleSaveAndNewPlank);
dom.reviewOverviewButton.addEventListener("click", handleOpenOverview);
dom.overviewButton.addEventListener("click", handleOpenOverview);
dom.viewerOverviewButton.addEventListener("click", handleOpenOverview);
dom.clearQuoteButton.addEventListener("click", handleClearQuote);
dom.quoteRequestButton.addEventListener("click", handleQuoteRequest);
dom.closeOverviewButton.addEventListener("click", handleCloseOverview);
dom.overviewBackdrop.addEventListener("click", handleCloseOverview);
dom.overviewTableBody.addEventListener("click", handleOverviewTableClick);
dom.customerNameInput.addEventListener("input", updateQuoteRequestState);
dom.customerEmailInput.addEventListener("input", updateQuoteRequestState);
dom.customerPhoneInput.addEventListener("input", updateQuoteRequestState);
dom.customerNoteInput.addEventListener("input", updateQuoteRequestState);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("resize", syncDrawerStateForViewport);
window.addEventListener("beforeunload", cleanup);

syncCornerRadiusField(dom);
syncHoleFields(dom);
syncChoiceCards(dom.cornerChoiceCards, dom.roundedCornersInput.checked);
syncChoiceCards(dom.holeChoiceCards, dom.holeEnabledInput.checked);
syncMaterialCards(dom, dom.materialVariantKeyInput.value);
setExpandedStep(dom.accordionSteps, 1);
renderQuoteItems(dom, quoteItems);
renderOverviewTable(dom, quoteItems);
updateQuoteRequestState();
setStatus(dom.quoteStatusMessage, "", "idle");
syncDrawerStateForViewport();
syncAddPlankButtonLabel();
await initializeApp();

function preventSubmitOnly(event) {
  event.preventDefault();
}

function handleOpenControls() {
  if (!isMobileViewport()) {
    return;
  }

  openMobileDrawer(dom);
}

function handleCloseControls() {
  closeMobileDrawer(dom);
}

function handleKeyDown(event) {
  if (event.key === "Escape" && dom.overviewModal.getAttribute("aria-hidden") === "false") {
    handleCloseOverview();
    return;
  }

  if (event.key === "Escape" && isMobileViewport() && dom.page.dataset.mobileDrawerOpen === "true") {
    closeMobileDrawer(dom);
  }
}

function syncDrawerStateForViewport() {
  if (isMobileViewport()) {
    closeMobileDrawer(dom, { restoreFocus: false });
    return;
  }

  delete dom.page.dataset.mobileDrawerOpen;
  dom.panel.setAttribute("aria-hidden", "false");
  dom.mobileBackdrop.hidden = true;
  dom.openControlsButton.setAttribute("aria-expanded", "false");
}

async function handleInputChange() {
  await renderFromInputs();
}

async function handleMaterialCardSelect(card) {
  syncMaterialCards(dom, card.dataset.variantKey || "");
  await renderFromInputs();
}

async function initializeApp() {
  await renderFromInputs();
}

async function renderFromInputs() {
  const formValues = readCurrentFormValues();
  const {
    materialKey,
    lengthMm,
    widthMm,
    thicknessMm,
    quantity,
    roundedCorners,
    cornerRadiusMm,
    holeEnabled,
    holeXmm,
    holeYmm,
    holeCountX,
    holeCountY,
    holeDiameterMm,
  } = formValues;

  try {
    validateDimensions({
      materialKey,
      lengthMm,
      widthMm,
      thicknessMm,
      quantity,
      roundedCorners,
      cornerRadiusMm,
      holeEnabled,
      holeXmm,
      holeYmm,
      holeCountX,
      holeCountY,
      holeDiameterMm,
    });
    setStatus(dom.statusMessage, "Updating plywood plate preview...", "idle");

    replaceModel(null);
    currentModel = await createPlywoodPlateModel({
      materialKey,
      lengthMm,
      widthMm,
      thicknessMm,
      quantity,
      roundedCorners,
      cornerRadiusMm,
      holeEnabled,
      holeXmm,
      holeYmm,
      holeCountX,
      holeCountY,
      holeDiameterMm,
    });

    const glbBlob = await exportSceneToGlb(currentModel.scene);
    preview.update(glbBlob);
    updateMetrics(dom, {
      ...currentModel.dimensions,
      materialVariantLabel: formValues.materialVariantLabel,
    });

    if (editingQuoteIndex !== null && quoteItems[editingQuoteIndex]) {
      const title = quoteItems[editingQuoteIndex].title || `Plank ${editingQuoteIndex + 1}`;
      quoteItems[editingQuoteIndex] = buildQuoteItem(formValues, title);
      renderQuoteItems(dom, quoteItems);
      renderOverviewTable(dom, quoteItems);
      updateQuoteRequestState();
    }

    setStatus(
      dom.statusMessage,
      editingQuoteIndex !== null
        ? "Plywood plate updated. The loaded plank and overview table are in sync."
        : "Plywood plate updated. Review the settings, add the plank to your set, or inspect it in AR on a supported device.",
      "success"
    );
  } catch (error) {
    replaceModel(null);
    preview.reset();
    resetMetrics(dom);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    setStatus(dom.statusMessage, message, "error");
  }
}

function validateDimensions({
  materialKey,
  lengthMm,
  widthMm,
  thicknessMm,
  quantity,
  roundedCorners,
  cornerRadiusMm,
  holeEnabled,
  holeXmm,
  holeYmm,
  holeCountX,
  holeCountY,
  holeDiameterMm,
}) {
  validatePlateConstraints({ materialKey, lengthMm, widthMm, thicknessMm });

  if (!(quantity >= 1)) {
    throw new Error("Quantity must be 1 or greater.");
  }

  if (roundedCorners && !(cornerRadiusMm > 0)) {
    throw new Error("Enter a corner radius greater than zero when rounded corners are enabled.");
  }

  if (holeEnabled) {
    if (!(holeDiameterMm > 0)) {
      throw new Error("Enter a hole diameter greater than zero when the hole option is enabled.");
    }

    if (!(holeCountX >= 1) || !(holeCountY >= 1)) {
      throw new Error("Hole counts in X and Y must both be 1 or greater.");
    }

    if (holeXmm < 0 || holeYmm < 0) {
      throw new Error("Hole X and Y offsets must be zero or greater.");
    }

    const holeRadiusMm = holeDiameterMm / 2;
    const lastHoleXmm = holeCountX > 1 ? lengthMm - holeXmm : holeXmm;
    const lastHoleYmm = holeCountY > 1 ? widthMm - holeYmm : holeYmm;

    if (holeXmm - holeRadiusMm < 0 || holeXmm + holeRadiusMm > lengthMm) {
      throw new Error("First hole X position and diameter place the hole outside the plate.");
    }

    if (holeYmm - holeRadiusMm < 0 || holeYmm + holeRadiusMm > widthMm) {
      throw new Error("First hole Y position and diameter place the hole outside the plate.");
    }

    if (lastHoleXmm - holeRadiusMm < 0 || lastHoleXmm + holeRadiusMm > lengthMm) {
      throw new Error("Mirrored X hole pattern would place the final hole outside the plate.");
    }

    if (lastHoleYmm - holeRadiusMm < 0 || lastHoleYmm + holeRadiusMm > widthMm) {
      throw new Error("Mirrored Y hole pattern would place the final hole outside the plate.");
    }

    if (holeCountX > 1 && (lengthMm - (2 * holeXmm)) < 0) {
      throw new Error("First hole X offset is too large to mirror the pattern across the plate length.");
    }

    if (holeCountY > 1 && (widthMm - (2 * holeYmm)) < 0) {
      throw new Error("First hole Y offset is too large to mirror the pattern across the plate width.");
    }
  }
}

async function handleRoundedCornersChange() {
  syncChoiceCards(dom.cornerChoiceCards, dom.roundedCornersInput.checked);
  syncCornerRadiusField(dom);
  await renderFromInputs();
}

async function handleHoleChange() {
  syncChoiceCards(dom.holeChoiceCards, dom.holeEnabledInput.checked);
  syncHoleFields(dom);
  await renderFromInputs();
}

async function handleCornerChoiceSelect(card) {
  dom.roundedCornersInput.checked = card.dataset.choiceValue === "true";
  await handleRoundedCornersChange();
}

async function handleHoleChoiceSelect(card) {
  dom.holeEnabledInput.checked = card.dataset.choiceValue === "true";
  await handleHoleChange();
}

function handleAddPlank() {
  try {
    const formValues = readCurrentFormValues();
    validateDimensions(formValues);

    if (editingQuoteIndex !== null && quoteItems[editingQuoteIndex]) {
      const title = quoteItems[editingQuoteIndex].title || `Plank ${editingQuoteIndex + 1}`;
      quoteItems[editingQuoteIndex] = buildQuoteItem(formValues, title);
      setStatus(dom.statusMessage, `${title} saved from the viewer.`, "success");
    } else {
      const item = createQuoteItem(formValues, quoteItems.length + 1);
      quoteItems = [...quoteItems, item];
      setStatus(dom.statusMessage, "Current plank added to the quote set.", "success");
    }

    renderQuoteItems(dom, quoteItems);
    renderOverviewTable(dom, quoteItems);
    updateQuoteRequestState();
    setStatus(dom.quoteStatusMessage, "", "idle");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The plank could not be added.";
    setStatus(dom.statusMessage, message, "error");
  }
}

function handleClearQuote() {
  quoteItems = [];
  editingQuoteIndex = null;
  syncAddPlankButtonLabel();
  renderQuoteItems(dom, quoteItems);
  renderOverviewTable(dom, quoteItems);
  closeOverviewModal(dom, { restoreFocus: false });
  updateQuoteRequestState();
  setExpandedStep(dom.accordionSteps, 6);
  setStatus(dom.quoteStatusMessage, "", "idle");
  setStatus(dom.statusMessage, "Quote set cleared.", "idle");
}

function handleSaveAndNewPlank() {
  if (editingQuoteIndex === null || !quoteItems[editingQuoteIndex]) {
    return;
  }

  try {
    const formValues = readCurrentFormValues();
    validateDimensions(formValues);
    const title = quoteItems[editingQuoteIndex].title || `Plank ${editingQuoteIndex + 1}`;
    quoteItems[editingQuoteIndex] = buildQuoteItem(formValues, title);
    editingQuoteIndex = null;
    syncAddPlankButtonLabel();
    renderQuoteItems(dom, quoteItems);
    renderOverviewTable(dom, quoteItems);
    updateQuoteRequestState();
    setStatus(dom.statusMessage, `${title} saved. You are now editing a new plate.`, "success");
    setStatus(dom.quoteStatusMessage, "", "idle");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The plank could not be saved.";
    setStatus(dom.statusMessage, message, "error");
  }
}

function handleOpenOverview() {
  renderOverviewTable(dom, quoteItems);
  openOverviewModal(dom);
}

function handleCloseOverview() {
  closeOverviewModal(dom);
}

function handleOverviewTableClick(event) {
  const saveButton = event.target.closest("[data-action='save-plank']");

  if (saveButton) {
    const row = saveButton.closest("tr");
    saveOverviewRow(row);
    return;
  }

  const button = event.target.closest("[data-action='load-plank']");

  if (!button) {
    return;
  }

  const row = button.closest("tr");
  const index = Number(row?.dataset.index);

  if (!Number.isInteger(index) || !quoteItems[index]) {
    return;
  }

  loadQuoteItemIntoForm(quoteItems[index], index);
}

function saveOverviewRow(row) {
  if (!row) {
    return;
  }

  const index = Number(row.dataset.index);

  if (!Number.isInteger(index) || !quoteItems[index]) {
    return;
  }

  try {
    const nextValues = readOverviewRowValues(row, quoteItems[index]);
    validateDimensions(nextValues);
    quoteItems[index] = buildQuoteItem(nextValues, nextValues.title || quoteItems[index].title || `Plank ${index + 1}`);
    if (editingQuoteIndex === index) {
      syncLoadedQuoteItemToForm(quoteItems[index]);
    }
    renderQuoteItems(dom, quoteItems);
    renderOverviewTable(dom, quoteItems);
    updateQuoteRequestState();
    setStatus(dom.quoteStatusMessage, `${quoteItems[index].title} saved.`, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The plank could not be saved.";
    setStatus(dom.quoteStatusMessage, message, "error");
  }
}

function readCurrentFormValues() {
  return readFormValues({
    materialInput: dom.materialInput,
    materialVariantKeyInput: dom.materialVariantKeyInput,
    materialVariantLabelInput: dom.materialVariantLabelInput,
    lengthInput: dom.lengthInput,
    widthInput: dom.widthInput,
    thicknessInput: dom.thicknessInput,
    quantityInput: dom.quantityInput,
    roundedCornersInput: dom.roundedCornersInput,
    cornerRadiusInput: dom.cornerRadiusInput,
    holeEnabledInput: dom.holeEnabledInput,
    holeXInput: dom.holeXInput,
    holeYInput: dom.holeYInput,
    holeCountXInput: dom.holeCountXInput,
    holeCountYInput: dom.holeCountYInput,
    holeDiameterInput: dom.holeDiameterInput,
  });
}

function createQuoteItem(values, index) {
  return buildQuoteItem(values, `Plank ${index}`);
}

function buildQuoteItem(values, title) {
  const { title: _ignoredTitle, ...quoteValues } = values;
  const material = getMaterialByKey(values.materialKey);
  const pricing = createPricingSummary(quoteValues);
  const holeText = values.holeEnabled
    ? `Holes ${values.holeCountX}x${values.holeCountY}, first ${values.holeXmm}/${values.holeYmm} mm, diameter ${values.holeDiameterMm} mm`
    : "No holes";
  const cornerText = values.roundedCorners ? `Rounded corners ${values.cornerRadiusMm} mm` : "Square corners";
  const materialText = values.materialVariantLabel
    ? `${material.label} (${values.materialVariantLabel})`
    : material.label;

  return {
    title,
    description: `Qty ${values.quantity}, ${materialText}, ${values.lengthMm} x ${values.widthMm} x ${values.thicknessMm} mm, ${cornerText}, ${holeText}`,
    priceLabel: pricing.formattedTotalPrice,
    values: {
      ...quoteValues,
      materialLabel: material.label,
      pricing,
    },
  };
}

function readOverviewRowValues(row, currentItem) {
  const currentValues = currentItem.values;
  const nextVariantKey = readRowFieldValue(row, "materialVariantKey") || currentValues.materialVariantKey;
  const materialCard = dom.materialCards.find((card) => card.dataset.variantKey === nextVariantKey);

  return {
    ...currentValues,
    materialKey: currentValues.materialKey || "birch-multiplex",
    materialVariantKey: nextVariantKey,
    materialVariantLabel: materialCard?.dataset.variantLabel || currentValues.materialVariantLabel,
    quantity: Number(readRowFieldValue(row, "quantity") || currentValues.quantity),
    lengthMm: Number(readRowFieldValue(row, "lengthMm") || currentValues.lengthMm),
    widthMm: Number(readRowFieldValue(row, "widthMm") || currentValues.widthMm),
    thicknessMm: Number(readRowFieldValue(row, "thicknessMm") || currentValues.thicknessMm),
    title: readRowFieldValue(row, "title").trim(),
  };
}

function readRowFieldValue(row, field) {
  const element = row.querySelector(`[data-field='${field}']`);
  return element?.value ?? "";
}

async function loadQuoteItemIntoForm(item, index) {
  editingQuoteIndex = index;
  syncAddPlankButtonLabel();
  syncLoadedQuoteItemToForm(item);
  closeOverviewModal(dom);
  setExpandedStep(dom.accordionSteps, 5);
  await renderFromInputs();
  setStatus(dom.statusMessage, `${item.title} loaded into the viewer. Editing now stays synced with the table.`, "success");
}

function syncLoadedQuoteItemToForm(item) {
  const values = item.values;
  dom.materialInput.value = values.materialKey;
  syncMaterialCards(dom, values.materialVariantKey);
  dom.lengthInput.value = String(values.lengthMm);
  dom.widthInput.value = String(values.widthMm);
  dom.thicknessInput.value = String(values.thicknessMm);
  dom.quantityInput.value = String(values.quantity);
  dom.roundedCornersInput.checked = Boolean(values.roundedCorners);
  syncChoiceCards(dom.cornerChoiceCards, dom.roundedCornersInput.checked);
  dom.cornerRadiusInput.value = String(values.cornerRadiusMm);
  syncCornerRadiusField(dom);
  dom.holeEnabledInput.checked = Boolean(values.holeEnabled);
  syncChoiceCards(dom.holeChoiceCards, dom.holeEnabledInput.checked);
  dom.holeXInput.value = String(values.holeXmm);
  dom.holeYInput.value = String(values.holeYmm);
  dom.holeCountXInput.value = String(values.holeCountX);
  dom.holeCountYInput.value = String(values.holeCountY);
  dom.holeDiameterInput.value = String(values.holeDiameterMm);
  syncHoleFields(dom);
}

function syncAddPlankButtonLabel() {
  dom.addPlankButton.textContent = editingQuoteIndex !== null ? "Save loaded plank" : "Add plank to set";
  dom.saveNewPlankButton.hidden = editingQuoteIndex === null;
}

function updateQuoteRequestState() {
  const { customerName, customerEmail } = readContactValues({
    customerNameInput: dom.customerNameInput,
    customerEmailInput: dom.customerEmailInput,
    customerPhoneInput: dom.customerPhoneInput,
    customerNoteInput: dom.customerNoteInput,
  });
  const canSubmit = quoteItems.length > 0 && customerName.length > 0 && isValidEmail(customerEmail);

  dom.quoteRequestButton.disabled = !canSubmit;
  dom.quoteRequestButton.setAttribute("aria-disabled", String(!canSubmit));
}

async function handleQuoteRequest() {
  try {
    validateQuoteRequest();
    setStatus(dom.quoteStatusMessage, "Sending your quote request...", "idle");
    dom.quoteRequestButton.disabled = true;
    dom.quoteRequestButton.setAttribute("aria-disabled", "true");

    const { customerName, customerEmail, customerPhone, customerNote } = readContactValues({
      customerNameInput: dom.customerNameInput,
      customerEmailInput: dom.customerEmailInput,
      customerPhoneInput: dom.customerPhoneInput,
      customerNoteInput: dom.customerNoteInput,
    });

    const response = await fetch("/api/request-quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName,
        customerEmail,
        customerPhone,
        customerNote,
        items: quoteItems,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "The quote request could not be sent.");
    }

    setStatus(dom.quoteStatusMessage, "Quote request sent. A confirmation email is on its way.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The quote request could not be sent.";
    setStatus(dom.quoteStatusMessage, message, "error");
  } finally {
    updateQuoteRequestState();
  }
}

function validateQuoteRequest() {
  if (quoteItems.length === 0) {
    throw new Error("Add at least one plank before requesting a quote.");
  }

  const { customerName, customerEmail } = readContactValues({
    customerNameInput: dom.customerNameInput,
    customerEmailInput: dom.customerEmailInput,
    customerPhoneInput: dom.customerPhoneInput,
    customerNoteInput: dom.customerNoteInput,
  });

  if (!customerName) {
    throw new Error("Please enter your name before requesting a quote.");
  }

  if (!isValidEmail(customerEmail)) {
    throw new Error("Please enter a valid email address before requesting a quote.");
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createPricingSummary(values) {
  const pricing = calculatePlatePricing(values);

  return {
    ...pricing,
    formattedTotalPrice: formatEuro(pricing.totalPriceEur),
    formattedUnitPrice: formatEuro(pricing.unitPriceEur),
    formattedMaterialPrice: formatEuro(pricing.materialPriceEur),
    formattedMaterialPriceWithMarkup: formatEuro(pricing.materialPriceWithMarkupEur),
  };
}

function replaceModel(nextModel) {
  if (currentModel) {
    disposePlywoodPlateModel(currentModel);
  }

  currentModel = nextModel;
}

function cleanup() {
  replaceModel(null);
  preview.cleanup();
}
