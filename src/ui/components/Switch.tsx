import type { ReactNode } from 'react';
import styles from './Switch.module.css';

type Props = {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The state as a word ("An", "Ja"), so it never rests on the knob alone. */
  onText: string;
  offText: string;
};

/** Switch of the design system (role switch). */
export function Switch({
  label,
  hint,
  checked,
  onChange,
  onText,
  offText,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.text}>
        <span>{label}</span>
        {hint !== undefined && <span className={styles.hint}>{hint}</span>}
      </span>
      <span className={styles.control} aria-hidden="true">
        <span className={styles.state}>{checked ? onText : offText}</span>
        <span className={styles.track}>
          <span className={styles.knob} />
        </span>
      </span>
    </button>
  );
}
