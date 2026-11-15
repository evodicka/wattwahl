import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Field.module.css';

/** "Pflicht", "Annahme" and "● geändert" next to a label (Z14 to Z16). */
export type FieldMarks = {
  required?: boolean;
  assumption?: boolean;
  changed?: boolean;
};

export type FieldMessage = { tone: 'error' | 'warn'; text: string };

/** The markers of a field, as text: they never rest on colour alone. */
export function FieldMarkers({ marks }: { marks: FieldMarks | undefined }) {
  const { t } = useTranslation();
  if (!marks) return null;
  return (
    <>
      {marks.required && (
        <>
          {' '}
          <span className={styles.required}>{t('field.required')}</span>
        </>
      )}
      {marks.assumption && (
        <>
          {' '}
          <span className={styles.assumption}>{t('field.assumption')}</span>
        </>
      )}
      {marks.changed && (
        <>
          {' '}
          <span className={styles.changed}>{t('field.changed')}</span>
        </>
      )}
    </>
  );
}

/** Ids of the hint and message of a field, for aria-describedby. */
export const describedBy = (
  id: string,
  parts: { hint: boolean; message: boolean },
): string | undefined =>
  [parts.hint ? `${id}-hint` : null, parts.message ? `${id}-msg` : null]
    .filter(Boolean)
    .join(' ') || undefined;

type Props = {
  /** Id of the control the label belongs to. */
  id: string;
  label: ReactNode;
  marks?: FieldMarks;
  hint?: ReactNode;
  message?: FieldMessage | null;
  /** Shows "Zurücksetzen" after the hint; `label` names the field for screen readers. */
  reset?: { label: string; onReset: () => void } | null;
  /** `group`: the label names a group of controls (month and year). */
  labelFor?: 'control' | 'group';
  children: ReactNode;
};

/**
 * Label, control, hint and message of a form field (design system,
 * NumberField). An error and a warning each carry a symbol and their text.
 */
export function FieldFrame({
  id,
  label,
  marks,
  hint,
  message,
  reset,
  labelFor = 'control',
  children,
}: Props) {
  const { t } = useTranslation();
  const classes = [
    styles.field,
    message?.tone === 'error' ? styles.error : undefined,
    message?.tone === 'warn' ? styles.warn : undefined,
  ];
  const labelContent = (
    <>
      {label}
      <FieldMarkers marks={marks} />
    </>
  );
  const hasHint = hint !== undefined || Boolean(reset);
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {labelFor === 'control' ? (
        <label className={styles.label} htmlFor={id}>
          {labelContent}
        </label>
      ) : (
        <span className={styles.label} id={`${id}-label`}>
          {labelContent}
        </span>
      )}
      {children}
      {hasHint && (
        <span className={styles.hint} id={`${id}-hint`}>
          {hint}
          {hint !== undefined && reset && t('separator')}
          {reset && (
            <button
              type="button"
              className={styles.reset}
              aria-label={t('field.resetField', { label: reset.label })}
              onClick={reset.onReset}
            >
              {t('actions.reset')}
            </button>
          )}
        </span>
      )}
      {message && (
        <span
          className={styles.message}
          id={`${id}-msg`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          <span aria-hidden="true">{message.tone === 'error' ? '✕' : '▲'}</span>
          {message.text}
        </span>
      )}
    </div>
  );
}
