// Crop a team photo: drag to move, zoom with the slider or a pinch, and the round guide shows
// what the badge will show. "Use photo" hands back a square JPEG (lib/avatar cropToSquare).

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { cropToSquare, loadImage, type CropRect } from '../lib/avatar';
import { Sheet } from './Sheet';

const FRAME = 280;
const MAX_ZOOM = 4;

interface View {
  zoom: number;
  /** Top-left of the photo inside the frame, in screen px (≤ 0). */
  x: number;
  y: number;
}

function clampView(img: HTMLImageElement, v: View): View {
  const scale = (FRAME / Math.min(img.naturalWidth, img.naturalHeight)) * v.zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return { zoom: v.zoom, x: Math.min(0, Math.max(FRAME - w, v.x)), y: Math.min(0, Math.max(FRAME - h, v.y)) };
}

/** The photo's square under the frame, in its own pixels. */
export function cropFor(img: { naturalWidth: number; naturalHeight: number }, v: View): CropRect {
  const scale = (FRAME / Math.min(img.naturalWidth, img.naturalHeight)) * v.zoom;
  return { x: -v.x / scale, y: -v.y / scale, side: FRAME / scale };
}

export function PhotoCropSheet({
  file,
  onCancel,
  onDone,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    setImg(null);
    setError(null);
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setSrc(url);
    loadImage(file)
      .then((loaded) => {
        if (cancelled) return;
        setImg(loaded);
        const scale = FRAME / Math.min(loaded.naturalWidth, loaded.naturalHeight);
        setView({ zoom: 1, x: (FRAME - loaded.naturalWidth * scale) / 2, y: (FRAME - loaded.naturalHeight * scale) / 2 });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'That photo couldn’t be opened.'));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  /** Zoom about the frame's centre, so what's in the middle stays there. */
  const zoomTo = (zoom: number) => {
    if (!img) return;
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
      const base = FRAME / Math.min(img.naturalWidth, img.naturalHeight);
      const cx = (FRAME / 2 - v.x) / (base * v.zoom);
      const cy = (FRAME / 2 - v.y) / (base * v.zoom);
      return clampView(img, { zoom: z, x: FRAME / 2 - cx * base * z, y: FRAME / 2 - cy * base * z });
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom };
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId);
    if (!last || !img) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo(pinch.current.zoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinch.current.distance));
      return;
    }
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    setView((v) => clampView(img, { ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const use = () => {
    if (!img) return;
    try {
      onDone(cropToSquare(img, cropFor(img, view)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That photo couldn’t be used.');
    }
  };

  const scale = img ? (FRAME / Math.min(img.naturalWidth, img.naturalHeight)) * view.zoom : 1;
  return (
    <Sheet
      open={file !== null}
      onClose={onCancel}
      kicker="Team photo"
      title="Crop your photo"
      footer={
        <div className="actions">
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!img} onClick={use}>
            Use photo
          </button>
        </div>
      }
    >
      <p className="muted">Drag to move it, and zoom to fit. The circle is what your badge shows.</p>
      <div
        className="cropper"
        style={{ width: FRAME, height: FRAME }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomTo(view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        role="img"
        aria-label="Photo to crop"
      >
        {img && src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="cropper__img"
            style={{ width: img.naturalWidth * scale, height: img.naturalHeight * scale, transform: `translate(${view.x}px, ${view.y}px)` }}
          />
        ) : null}
        <span className="cropper__ring" aria-hidden="true" />
      </div>
      <label className="cropper__zoom">
        <span className="field__label">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          disabled={!img}
          onChange={(e) => zoomTo(Number(e.target.value))}
        />
      </label>
      {error ? <p className="notice notice--error">{error}</p> : null}
    </Sheet>
  );
}
