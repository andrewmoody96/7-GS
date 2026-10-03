import { useId } from 'react';
import { IconMinus, IconPlus } from './icons';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
}

/** A − value + control with ≥44px buttons; the number is also directly editable. */
export function Stepper({ label, value, min, max, onChange, suffix, hint, disabled }: StepperProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="field stepper">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="stepper__row">
        <button
          type="button"
          className="icon-btn stepper__btn"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label}`}
        >
          <IconMinus />
        </button>
        <input
          id={id}
          className="stepper__input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
        />
        {suffix ? <span className="stepper__suffix">{suffix}</span> : null}
        <button
          type="button"
          className="icon-btn stepper__btn"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label}`}
        >
          <IconPlus />
        </button>
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  className?: string;
}

export function Switch({ label, checked, onChange, disabled, hideLabel, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch${checked ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className={hideLabel ? 'sr-only' : 'switch__label'}>{label}</span>
    </button>
  );
}
