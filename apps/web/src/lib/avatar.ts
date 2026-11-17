// Team photos are cropped to a centred square and shrunk on the device before upload, so
// what's stored and sent around is a few KB whatever the camera produced.

/** Displayed at most ~56 px; 192 px stays sharp on 3× screens. */
export const AVATAR_PX = 192;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file couldn’t be opened as a photo.'));
    };
    img.src = url;
  });
}

/** A square JPEG data: URL of `file`, centre-cropped and resized to `size` px. */
export async function squarePhoto(file: File, size = AVATAR_PX): Promise<string> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new Error('Choose a photo.');
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('That photo looks empty.');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t resize photos.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}
