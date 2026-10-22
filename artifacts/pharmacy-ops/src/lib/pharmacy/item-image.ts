const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 480;

export async function prepareItemImage(source: File | string): Promise<string> {
  if (typeof source === "string") {
    if (!source.startsWith("data:image/")) throw new Error("Only image files can be attached to an item.");
    return compressDataUrl(source);
  }
  if (!source.type.startsWith("image/")) throw new Error("Choose a JPG, PNG, or similar image file.");
  if (source.size > MAX_BYTES) throw new Error("That image is larger than 8 MB. Choose a smaller photo.");
  const dataUrl = await readFile(source);
  return compressDataUrl(dataUrl);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

function compressDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === "undefined") return Promise.resolve(dataUrl);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => reject(new Error("That file does not look like a usable image."));
    image.src = dataUrl;
  });
}
