export async function loadImageTextureData(file) {
  if (!(file instanceof File)) {
    throw new Error("Select an image file before generating the model.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("The selected file is not a supported image.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadHtmlImage(dataUrl);

  return { dataUrl, image };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The image could not be read in the browser."));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The uploaded file could not be decoded as an image."));
    image.src = src;
  });
}
