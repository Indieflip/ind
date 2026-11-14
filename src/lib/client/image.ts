/** Redimensionne et compresse une photo (BL ou problème) avant stockage/envoi. */
export async function compressImage(file: Blob, maxSide = 1800, quality = 0.78): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void;
  if (bitmap) {
    w = bitmap.width; h = bitmap.height;
    draw = (ctx) => ctx.drawImage(bitmap, 0, 0, cw, ch);
  } else {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth; h = img.naturalHeight;
    draw = (ctx) => ctx.drawImage(img, 0, 0, cw, ch);
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  return canvas.toDataURL("image/jpeg", quality);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
