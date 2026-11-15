import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Field.module.css';
import { describedBy, FieldFrame, type FieldMarks } from './FieldFrame';

type Props = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  marks?: FieldMarks;
  hint?: ReactNode;
  /** An error the caller knows, e.g. a name that is taken. */
  error?: string | null;
  id?: string;
};

/** Text field (name, note). It saves while typing; an empty required field shows its message on leaving. */
export function TextField({
  label,
  value,
  onChange,
  required = false,
  marks,
  hint,
  error = null,
  id: givenId,
}: Props) {
  const { t } = useTranslation();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const [left, setLeft] = useState(false);
  const missing = required && left && value.trim() === '';
  const text = error ?? (missing ? t('validation.required') : null);
  const message = text ? { tone: 'error' as const, text } : null;
  return (
    <FieldFrame
      id={id}
      label={label}
      marks={{ required, ...marks }}
      hint={hint}
      message={message}
    >
      <div className={styles.box}>
        <input
          id={id}
          className={`${styles.input} ${styles.text}`}
          type="text"
          value={value}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy(id, {
            hint: hint !== undefined,
            message: message !== null,
          })}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setLeft(true)}
        />
      </div>
    </FieldFrame>
  );
}
