import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconX } from './icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small caps line above the title. */
  kicker?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'board';
}

/** A modal bottom sheet built on <dialog> (focus trapping and Esc come for free). */
export function Sheet({ open, onClose, title, kicker, children, footer, tone = 'default' }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`sheet sheet--${tone}`}
      aria-labelledby={titleId}
      onClick={(event) => {
        // A click on the backdrop (the dialog itself, outside the panel) closes it.
        if (event.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="sheet__panel">
          <header className="sheet__head">
            <div>
              {kicker ? <p className="sheet__kicker">{kicker}</p> : null}
              <h2 id={titleId} className="sheet__title">
                {title}
              </h2>
            </div>
            <button type="button" className="icon-btn sheet__close" onClick={onClose} aria-label="Close">
              <IconX />
            </button>
          </header>
          <div className="sheet__body">{children}</div>
          {footer ? <footer className="sheet__foot">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
