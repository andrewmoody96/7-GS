// Team photos: the player crops a square on the device (components/PhotoCropSheet), and it's
// shrunk there before upload, so what's stored and sent around is tens of KB whatever the
// camera produced.

/** Shown up to ~180 px (Team page); 512 px stays sharp on 3× screens. */
export const AVATAR_PX = 512;
/** Stay well under the upload limit (contracts AvatarUpload, 200 000 characters). */
const MAX_DATA_URL = 190_000;

export function loadImage(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/') && file.type !== '') return Promise.reject(new Error('Choose a photo.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error('That photo looks empty.'));
      else resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file couldn’t be opened as a photo.'));
    };
    img.src = url;
  });
}

/** A square in the photo's own pixels. */
export interface CropRect {
  x: number;
  y: number;
  side: number;
}

/** The biggest centred square: the crop before the player moves anything. */
export function centredCrop(img: { naturalWidth: number; naturalHeight: number }): CropRect {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  return { x: (img.naturalWidth - side) / 2, y: (img.naturalHeight - side) / 2, side };
}

/**
 * The cropped square as a JPEG data: URL, `size` px across. Quality steps down only if the
 * file would be too large to upload (a very detailed photo).
 */
export function cropToSquare(img: HTMLImageElement, crop: CropRect, size = AVATAR_PX): string {
  const out = Math.min(size, Math.round(crop.side)) || size;
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t resize photos.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.x, crop.y, crop.side, crop.side, 0, 0, out, out);
  for (const quality of [0.9, 0.82, 0.74, 0.66]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error('That photo is too detailed to upload. Try another.');
}

/** A centre-cropped square of `file` (no cropping step). */
export async function squarePhoto(file: File, size = AVATAR_PX): Promise<string> {
  const img = await loadImage(file);
  return cropToSquare(img, centredCrop(img), size);
}
