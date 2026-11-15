import styles from './SegmentedControl.module.css';

type Props<Value extends string> = {
  /** Names the group for screen readers ("Preisfall"). */
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  /** Spans the full width, e.g. on a phone. */
  full?: boolean;
};

/** Segmented control of the design system: one option is pressed. */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  full = false,
}: Props<Value>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={[styles.segments, full ? styles.full : undefined]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segment}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
