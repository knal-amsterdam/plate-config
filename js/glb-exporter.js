import { GLTFExporter } from "https://esm.sh/three@0.164.1/examples/jsm/exporters/GLTFExporter.js";

const exporter = new GLTFExporter();

export function exportSceneToGlb(scene) {
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("Three.js returned an unexpected export format."));
          return;
        }

        resolve(new Blob([result], { type: "model/gltf-binary" }));
      },
      (error) => {
        reject(error instanceof Error ? error : new Error("The GLB export failed."));
      },
      { binary: true }
    );
  });
}
