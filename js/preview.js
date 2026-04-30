export function createPreviewController({ modelViewer, emptyState }) {
  let currentObjectUrl = "";

  function update(glbBlob) {
    cleanup();

    currentObjectUrl = URL.createObjectURL(glbBlob);
    modelViewer.src = currentObjectUrl;
    modelViewer.dataset.loaded = "true";
    emptyState.hidden = true;
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
