/**
 * Resize an image File to maxSide × maxSide (preserving aspect ratio),
 * then return a base64 data-URL (image/jpeg at given quality).
 */
export function resizeImage(
  file: File,
  maxSide = 1600,
  quality = 0.88
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Not an image file"));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/** Strip the "data:image/jpeg;base64," prefix to get raw base64 */
export function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, "");
}

/** Convert 0-1000 Gemini box coords to pixel coords on a canvas */
export function geminiBoxToPixels(
  box: [number, number, number, number],
  canvasW: number,
  canvasH: number
): { x: number; y: number; w: number; h: number } {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    x: (xmin / 1000) * canvasW,
    y: (ymin / 1000) * canvasH,
    w: ((xmax - xmin) / 1000) * canvasW,
    h: ((ymax - ymin) / 1000) * canvasH,
  };
}
