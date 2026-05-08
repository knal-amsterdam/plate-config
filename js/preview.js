export function createPreviewController({ modelViewer, emptyState }) {
  let currentObjectUrl = "";

  function update(glbBlob) {
    cleanup();

    currentObjectUrl = URL.createObjectURL(glbBlob);
    modelViewer.cameraTarget = "0m 0m 0m";
    modelViewer.cameraOrbit = "45deg 62deg auto";
    modelViewer.src = currentObjectUrl;
    modelViewer.dataset.loaded = "true";
    emptyState.hidden = true;

    if (typeof modelViewer.jumpCameraToGoal === "function") {
      modelViewer.jumpCameraToGoal();
    }
  }

  function reset() {
    cleanup();
    modelViewer.removeAttribute("src");
    delete modelViewer.dataset.loaded;
    emptyState.hidden = false;
  }

  // Object URLs are replaced on every export, so revoking the previous one prevents leaks.
  function cleanup() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = "";
    }
  }

  return { update, reset, cleanup };
}
