import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { YearMonthSchema, type YearMonth } from '../../domain';
import { MONTH_KEYS } from '../../i18n';
import styles from './Field.module.css';
import {
  describedBy,
  FieldFrame,
  type FieldMarks,
  type FieldMessage,
} from './FieldFrame';

// The years the stored scenario accepts.
const MIN_YEAR = YearMonthSchema.shape.year.minValue ?? 1990;
const MAX_YEAR = YearMonthSchema.shape.year.maxValue ?? 2100;

type Props = {
  label: ReactNode;
  name: string;
  value: YearMonth | null;
  onCommit: (value: YearMonth | null) => void;
  /** Allows an empty value, e.g. the first registration of a new car. */
  nullable?: boolean;
  marks?: FieldMarks;
  hint?: ReactNode;
  warning?: string | null;
  onReset?: (() => void) | null;
  id?: string;
};

/**
 * Month and year (Stichtag, Erstzulassung): a month select and a year field
 * under one label. The value changes once both parts are valid.
 */
export function MonthYearField({
  label,
  name,
  value,
  onCommit,
  nullable = false,
  marks,
  hint,
  warning = null,
  onReset = null,
  id: givenId,
}: Props) {
  const { t } = useTranslation();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const [month, setMonth] = useState<number | null>(null);
  const [yearDraft, setYearDraft] = useState<string | null>(null);
  const [yearError, setYearError] = useState(false);

  const shownMonth = month ?? value?.month ?? null;
  const yearText = yearDraft ?? (value ? String(value.year) : '');

  const commit = (nextMonth: number | null, nextYear: string) => {
    const text = nextYear.trim();
    if (nextMonth === null && text === '' && nullable) {
      setYearError(false);
      setMonth(null);
      setYearDraft(null);
      if (value !== null) onCommit(null);
      return;
    }
    const year = Number(text);
    const yearOk = /^\d{4}$/.test(text) && year >= MIN_YEAR && year <= MAX_YEAR;
    setYearError(text !== '' && !yearOk);
    if (!yearOk || nextMonth === null) return;
    setMonth(null);
    setYearDraft(null);
    if (value?.month !== nextMonth || value.year !== year) {
      onCommit({ month: nextMonth, year });
    }
  };

  const message: FieldMessage | null = yearError
    ? {
        tone: 'error',
        text: t('validation.year', { min: MIN_YEAR, max: MAX_YEAR }),
      }
    : warning
      ? { tone: 'warn', text: warning }
      : null;
  const reset = onReset
    ? {
        label: name,
        onReset: () => {
          setMonth(null);
          setYearDraft(null);
          setYearError(false);
          onReset();
        },
      }
    : null;
  const description = describedBy(id, {
    hint: hint !== undefined || reset !== null,
    message: message !== null,
  });

  return (
    <FieldFrame
      id={id}
      label={label}
      marks={marks}
      hint={hint}
      message={message}
      reset={reset}
      labelFor="group"
    >
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={description}
        className={styles.pair}
      >
        <select
          id={id}
          className={styles.select}
          aria-label={t('field.month')}
          value={shownMonth ?? ''}
          onChange={(event) => {
            const next =
              event.target.value === '' ? null : Number(event.target.value);
            setMonth(next);
            commit(next, yearText);
          }}
        >
          {(nullable || shownMonth === null) && <option value="" />}
          {MONTH_KEYS.map((key, index) => (
            <option key={key} value={index + 1}>
              {t(`months.${key}`)}
            </option>
          ))}
        </select>
        <div className={styles.box}>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={t('field.year')}
            aria-invalid={yearError ? true : undefined}
            value={yearText}
            onChange={(event) => setYearDraft(event.target.value)}
            onBlur={() => {
              if (yearDraft !== null) commit(shownMonth, yearDraft);
            }}
          />
        </div>
      </div>
    </FieldFrame>
  );
}
