import * as THREE from "https://esm.sh/three@0.164.1";
import { MM_TO_METERS } from "./constants.js";
import { getMaterialByKey } from "./pricing.js";

const textureLoader = new THREE.TextureLoader();
let oakFaceTextureCachePromise = null;

export async function createPlywoodPlateModel({
  materialKey,
  lengthMm,
  widthMm,
  thicknessMm,
  quantity = 1,
  roundedCorners,
  cornerRadiusMm,
  holeEnabled,
  holeXmm,
  holeYmm,
  holeCountX,
  holeCountY,
  holeDiameterMm,
}) {
  const material = getMaterialByKey(materialKey);
  const lengthM = lengthMm * MM_TO_METERS;
  const widthM = widthMm * MM_TO_METERS;
  const thicknessM = thicknessMm * MM_TO_METERS;
  const effectiveCornerRadiusMm = roundedCorners ? cornerRadiusMm : 0;
  const maxCornerRadiusMm = Math.min(lengthMm, widthMm) / 2;
  const clampedCornerRadiusMm = Math.min(effectiveCornerRadiusMm, maxCornerRadiusMm);
  const effectiveHoleDiameterMm = holeEnabled ? holeDiameterMm : 0;
  const effectiveHoleCountX = holeEnabled ? Math.max(1, Math.floor(holeCountX)) : 0;
  const effectiveHoleCountY = holeEnabled ? Math.max(1, Math.floor(holeCountY)) : 0;

  if (!(lengthM > 0) || !(widthM > 0) || !(thicknessM > 0) || clampedCornerRadiusMm < 0) {
    throw new Error("Length, width, thickness, and corner radius must all be valid values.");
  }

  const scene = new THREE.Scene();
  const geometry = createPlateGeometry({
    lengthM,
    widthM,
    thicknessM,
    cornerRadiusM: clampedCornerRadiusMm * MM_TO_METERS,
    holeEnabled,
    holeXmm,
    holeYmm,
    holeCountX: effectiveHoleCountX,
    holeCountY: effectiveHoleCountY,
    holeDiameterMm: effectiveHoleDiameterMm,
  });

  const woodTextures = await createWoodTextures({ lengthM, widthM });

  const plateMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodTextures.plate,
    metalness: 0.02,
    roughness: 0.9,
  });
  const materials = [plateMaterial];

  const mesh = new THREE.Mesh(geometry, plateMaterial);
  mesh.name = "PlywoodPlate";
  mesh.rotation.z = Math.PI / 2;
  scene.add(mesh);

  return {
    scene,
    mesh,
    materials,
    textures: woodTextures,
    dimensions: {
      lengthMm,
      widthMm,
      thicknessMm,
      quantity,
      materialKey: material.key,
      materialLabel: material.label,
      cornerRadiusMm: clampedCornerRadiusMm,
      holeXmm: holeEnabled ? holeXmm : 0,
      holeYmm: holeEnabled ? holeYmm : 0,
      holeCountX: holeEnabled ? effectiveHoleCountX : 0,
      holeCountY: holeEnabled ? effectiveHoleCountY : 0,
      holeDiameterMm: effectiveHoleDiameterMm,
      lengthM,
      widthM,
      thicknessM,
    },
  };
}

export function disposePlywoodPlateModel(model) {
  if (!model) {
    return;
  }

  model.mesh.geometry.dispose();

  for (const material of model.materials) {
    material.dispose();
  }

  for (const texture of Object.values(model.textures ?? {})) {
    texture.dispose();
  }
}

function createPlateGeometry({
  lengthM,
  widthM,
  thicknessM,
  cornerRadiusM,
  holeEnabled,
  holeXmm,
  holeYmm,
  holeCountX,
  holeCountY,
  holeDiameterMm,
}) {
  if (cornerRadiusM <= 0 && !holeEnabled) {
    return new THREE.BoxGeometry(lengthM, thicknessM, widthM);
  }

  return createExtrudedPlateGeometry({
    lengthM,
    widthM,
    thicknessM,
    cornerRadiusM,
    holeEnabled,
    holeXmm,
    holeYmm,
    holeCountX,
    holeCountY,
    holeDiameterMm,
  });
}

function createExtrudedPlateGeometry({
  lengthM,
  widthM,
  thicknessM,
  cornerRadiusM,
  holeEnabled,
  holeXmm,
  holeYmm,
  holeCountX,
  holeCountY,
  holeDiameterMm,
}) {
  const halfLength = lengthM / 2;
  const halfWidth = widthM / 2;
  const radius = Math.min(cornerRadiusM, halfLength, halfWidth);
  const shape = new THREE.Shape();

  shape.moveTo(-halfLength + radius, -halfWidth);
  shape.lineTo(halfLength - radius, -halfWidth);
  shape.absarc(halfLength - radius, -halfWidth + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(halfLength, halfWidth - radius);
  shape.absarc(halfLength - radius, halfWidth - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(-halfLength + radius, halfWidth);
  shape.absarc(-halfLength + radius, halfWidth - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfLength, -halfWidth + radius);
  shape.absarc(-halfLength + radius, -halfWidth + radius, radius, Math.PI, 1.5 * Math.PI, false);

  if (holeEnabled && holeDiameterMm > 0) {
    const holeRadiusM = (holeDiameterMm * MM_TO_METERS) / 2;
    const xPositionsM = createPatternPositions(lengthM, holeXmm, holeCountX);
    const yPositionsM = createPatternPositions(widthM, holeYmm, holeCountY);

    for (const holeCenterX of xPositionsM) {
      for (const holeCenterY of yPositionsM) {
        const holePath = new THREE.Path();
        holePath.absellipse(
          holeCenterX,
          holeCenterY,
          holeRadiusM,
          holeRadiusM,
          0,
          Math.PI * 2,
          false,
          0
        );
        shape.holes.push(holePath);
      }
    }
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessM,
    bevelEnabled: false,
    curveSegments: 24,
  });

  geometry.center();
  geometry.rotateX(-Math.PI / 2);

  return geometry;
}

function createPatternPositions(totalM, firstOffsetMm, countValue) {
  const count = Math.max(1, Math.floor(countValue));
  const firstOffsetM = firstOffsetMm * MM_TO_METERS;
  const usableSpanM = totalM - (2 * firstOffsetM);

  if (count === 1) {
    return [(-totalM / 2) + firstOffsetM];
  }

  const spacingM = usableSpanM / (count - 1);

  return Array.from({ length: count }, (_, index) => (-totalM / 2) + firstOffsetM + (spacingM * index));
}

async function createWoodTextures({ lengthM, widthM }) {
  const cachedOakFaceTexture = await loadOakFaceTexture();

  return {
    plate: configureTextureForPlate(cachedOakFaceTexture.clone(), lengthM, widthM),
  };
}

async function loadOakFaceTexture() {
  if (!oakFaceTextureCachePromise) {
    oakFaceTextureCachePromise = loadTexture("./textures/oak_veneer_01_diff_1k.jpg").then((face) => {
      face.colorSpace = THREE.SRGBColorSpace;
      face.anisotropy = 8;
      return face;
    });
  }

  return oakFaceTextureCachePromise;
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, resolve, undefined, () => {
      reject(new Error(`The texture could not be loaded: ${url}`));
    });
  });
}

function configureTextureForPlate(texture, lengthM, widthM) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI / 2;
  texture.repeat.set(
    Math.max(1, widthM / 0.22),
    Math.max(1, lengthM / 0.12)
  );
  texture.needsUpdate = true;
  return texture;
}

function buildWoodTexture({ width, height, base, grain, accent, horizontal }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  // Layer several soft bands and streaks so the exported GLB reads like timber instead of flat color.
  for (let index = 0; index < 70; index += 1) {
    const ratio = index / 70;
    const bandSize = horizontal ? height : width;
    const crossSize = horizontal ? width : height;
    const mainPosition = ratio * bandSize;
    const amplitude = 8 + (index % 7) * 3;

    context.beginPath();
    context.lineWidth = 1 + (index % 3);
    context.strokeStyle = index % 5 === 0 ? accent : grain;
    context.globalAlpha = 0.08 + ((index % 5) * 0.03);

    for (let cross = 0; cross <= crossSize; cross += 14) {
      const wave = Math.sin((cross / crossSize) * Math.PI * 4 + index) * amplitude;
      const noise = Math.cos((cross / crossSize) * Math.PI * 9 + index * 0.5) * (amplitude * 0.35);
      const x = horizontal ? cross : mainPosition + wave + noise;
      const y = horizontal ? mainPosition + wave + noise : cross;

      if (cross === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  context.globalAlpha = 0.08;

  for (let index = 0; index < 1600; index += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2.2;
    context.fillStyle = index % 2 === 0 ? grain : accent;
    context.fillRect(x, y, size, size);
  }

  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(horizontal ? 1.2 : 0.8, horizontal ? 1.2 : 3.6);
  texture.anisotropy = 8;

  return texture;
}
