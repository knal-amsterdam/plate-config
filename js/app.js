import { exportSceneToGlb } from "./glb-exporter.js";
import { createPlywoodPlateModel, disposePlywoodPlateModel } from "./model-factory.js";
import { calculatePlatePricing, formatEuro, getMaterialByKey, validatePlateConstraints } from "./pricing.js";
import { createPreviewController } from "./preview.js";
import {
  closeMobileDrawer,
  getDomReferences,
  isMobileViewport,
  openMobileDrawer,
  readContactValues,
  readFormValues,
  resetMetrics,
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
dom.clearQuoteButton.addEventListener("click", handleClearQuote);
dom.quoteRequestButton.addEventListener("click", handleQuoteRequest);
dom.customerNameInput.addEventListener("input", updateQuoteRequestState);
dom.customerEmailInput.addEventListener("input", updateQuoteRequestState);
dom.customerPhoneInput.addEventListener("input", updateQuoteRequestState);
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
updateQuoteRequestState();
setStatus(dom.quoteStatusMessage, "", "idle");
syncDrawerStateForViewport();
renderFromInputs();

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
  if (event.key !== "Escape" || !isMobileViewport() || dom.page.dataset.mobileDrawerOpen !== "true") {
    return;
  }

  closeMobileDrawer(dom);
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
    setStatus(
      dom.statusMessage,
      "Plywood plate updated. Review the settings, add the plank to your set, or inspect it in AR on a supported device.",
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

    const item = createQuoteItem(formValues, quoteItems.length + 1);
    quoteItems = [...quoteItems, item];
    renderQuoteItems(dom, quoteItems);
    updateQuoteRequestState();
    setStatus(dom.quoteStatusMessage, "", "idle");
    setStatus(dom.statusMessage, "Current plank added to the quote set.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The plank could not be added.";
    setStatus(dom.statusMessage, message, "error");
  }
}

function handleClearQuote() {
  quoteItems = [];
  renderQuoteItems(dom, quoteItems);
  updateQuoteRequestState();
  setExpandedStep(dom.accordionSteps, 6);
  setStatus(dom.quoteStatusMessage, "", "idle");
  setStatus(dom.statusMessage, "Quote set cleared.", "idle");
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
  const material = getMaterialByKey(values.materialKey);
  const pricing = createPricingSummary(values);
  const holeText = values.holeEnabled
    ? `Holes ${values.holeCountX}x${values.holeCountY}, first ${values.holeXmm}/${values.holeYmm} mm, diameter ${values.holeDiameterMm} mm`
    : "No holes";
  const cornerText = values.roundedCorners ? `Rounded corners ${values.cornerRadiusMm} mm` : "Square corners";
  const materialText = values.materialVariantLabel
    ? `${material.label} (${values.materialVariantLabel})`
    : material.label;

  return {
    title: `Plank ${index}`,
    description: `Qty ${values.quantity}, ${materialText}, ${values.lengthMm} x ${values.widthMm} x ${values.thicknessMm} mm, ${cornerText}, ${holeText}`,
    priceLabel: pricing.formattedTotalPrice,
    values: {
      ...values,
      materialLabel: material.label,
      pricing,
    },
  };
}

function updateQuoteRequestState() {
  const { customerName, customerEmail } = readContactValues({
    customerNameInput: dom.customerNameInput,
    customerEmailInput: dom.customerEmailInput,
    customerPhoneInput: dom.customerPhoneInput,
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

    const { customerName, customerEmail, customerPhone } = readContactValues({
      customerNameInput: dom.customerNameInput,
      customerEmailInput: dom.customerEmailInput,
      customerPhoneInput: dom.customerPhoneInput,
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
