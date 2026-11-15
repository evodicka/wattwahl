import { useId, type ReactNode } from 'react';
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
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={hint !== undefined ? `${id}-hint` : undefined}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.text}>
        <span id={`${id}-label`}>{label}</span>
        {hint !== undefined && (
          <span className={styles.hint} id={`${id}-hint`}>
            {hint}
          </span>
        )}
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
