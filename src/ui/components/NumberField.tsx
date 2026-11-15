import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { parseNumberField } from '../../domain';
import { formatInput } from '../../i18n';
import styles from './Field.module.css';
import {
  describedBy,
  FieldFrame,
  type FieldMarks,
  type FieldMessage,
} from './FieldFrame';

export type NumberRules = {
  /** The value is needed. Empty shows "Ohne diesen Wert wird nicht gerechnet" if `nullable`, else "Bitte einen Wert eingeben". */
  required: boolean;
  /** An empty field is stored as `null`. Without it, an empty field is an error and the last value stays. */
  nullable: boolean;
  min?: number;
  /** `min` itself is not allowed. */
  minExclusive?: boolean;
  max?: number;
  integer?: boolean;
};

export type NumberError =
  | 'required'
  | 'invalid'
  | 'negative'
  | 'zero'
  | 'notNegative'
  | 'belowMin'
  | 'aboveMax'
  | 'integer';

export type NumberCheck =
  { ok: true; value: number | null } | { ok: false; error: NumberError };

/**
 * The check on leaving a field (spec "Validierung"): decimal comma or point,
 * required, range and whole numbers. Reading the number is src/domain's job.
 */
export function checkNumber(text: string, rules: NumberRules): NumberCheck {
  const parsed = parseNumberField(text, {
    required: rules.required || !rules.nullable,
    ...(rules.max !== undefined ? { max: rules.max } : {}),
  });
  if (!parsed.ok) return parsed;
  const { value } = parsed;
  if (value === null) return { ok: true, value };
  const { min } = rules;
  if (min !== undefined) {
    if (min === 0 && rules.minExclusive && value <= 0) {
      return { ok: false, error: value < 0 ? 'negative' : 'zero' };
    }
    if (min === 0 && value < 0) return { ok: false, error: 'notNegative' };
    if (rules.minExclusive ? value <= min : value < min) {
      return { ok: false, error: 'belowMin' };
    }
  }
  if (rules.integer && !Number.isInteger(value)) {
    return { ok: false, error: 'integer' };
  }
  return { ok: true, value };
}

type Props = {
  label: ReactNode;
  /** Plain name of the field, for "… zurücksetzen". */
  name: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  rules: NumberRules;
  unit?: string;
  /** Decimals the value is padded to, e.g. 2 for prices. */
  decimals?: number;
  marks?: FieldMarks;
  hint?: ReactNode;
  /** A plausibility warning from src/domain; it blocks nothing. */
  warning?: string | null;
  /** An error of a rule across fields, e.g. minimum above mid. */
  error?: string | null;
  onReset?: (() => void) | null;
  placeholder?: string;
  /**
   * A rule across entries. A message shows at the field and keeps the value
   * from being stored, like a failed check of the number itself.
   */
  validate?: (value: number | null) => string | null;
  id?: string;
};

/**
 * Number field with the unit at the end (design system). The text stays as
 * typed until the field is left; then it is checked, and only a valid value
 * reaches the scenario. An empty optional field stores `null`.
 */
export function NumberField({
  label,
  name,
  value,
  onCommit,
  rules,
  unit,
  decimals = 0,
  marks,
  hint,
  warning = null,
  error: groupError = null,
  onReset = null,
  placeholder,
  validate,
  id: givenId,
}: Props) {
  const { t } = useTranslation();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  /** The text while it differs from the stored value; `null` shows the value. */
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<NumberError | null>(null);
  const [custom, setCustom] = useState<string | null>(null);

  const leave = () => {
    if (draft === null) return;
    const checked = checkNumber(draft, rules);
    if (!checked.ok) {
      if (checked.error === 'required' && rules.nullable) {
        if (value !== null) onCommit(null);
        setDraft(null);
      }
      setError(checked.error);
      return;
    }
    const rejected = validate?.(checked.value) ?? null;
    if (rejected) {
      setCustom(rejected);
      return;
    }
    setError(null);
    setCustom(null);
    setDraft(null);
    if (checked.value !== value) onCommit(checked.value);
  };

  const errorText = (code: NumberError): string => {
    switch (code) {
      case 'required':
        return t(
          rules.nullable ? 'validation.noCalculation' : 'validation.required',
        );
      case 'invalid':
        return t('validation.notANumber');
      case 'negative':
        return t('validation.negative');
      case 'zero':
        return t('validation.greaterThanZero');
      case 'notNegative':
        return t('validation.notNegative');
      case 'integer':
        return t('validation.integer');
      case 'belowMin':
      case 'aboveMax':
        if (rules.min !== undefined && rules.max !== undefined) {
          return t('validation.range', {
            min: formatInput(rules.min),
            max: formatInput(rules.max),
          });
        }
        return code === 'belowMin'
          ? t('validation.atLeast', { min: formatInput(rules.min ?? 0) })
          : t('validation.atMost', { max: formatInput(rules.max ?? 0) });
    }
  };

  // "Pflicht" disappears as soon as the field has a value again.
  const shownError = error === 'required' && value !== null ? null : error;
  const message: FieldMessage | null = custom
    ? { tone: 'error', text: custom }
    : shownError
      ? { tone: 'error', text: errorText(shownError) }
      : groupError
        ? { tone: 'error', text: groupError }
        : warning
          ? { tone: 'warn', text: warning }
          : null;

  const reset = onReset
    ? {
        label: name,
        onReset: () => {
          setDraft(null);
          setError(null);
          setCustom(null);
          onReset();
        },
      }
    : null;

  return (
    <FieldFrame
      id={id}
      label={label}
      marks={marks}
      hint={hint}
      message={message}
      reset={reset}
    >
      <div className={styles.box}>
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode={
            rules.integer && (rules.min ?? 0) >= 0 ? 'numeric' : 'decimal'
          }
          autoComplete="off"
          placeholder={placeholder}
          value={draft ?? (value === null ? '' : formatInput(value, decimals))}
          aria-invalid={message?.tone === 'error' ? true : undefined}
          aria-describedby={
            [
              unit !== undefined ? `${id}-unit` : null,
              describedBy(id, {
                hint: hint !== undefined || reset !== null,
                message: message !== null,
              }),
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(event) => setDraft(event.target.value)}
          onBlur={leave}
          onKeyDown={(event) => {
            if (event.key === 'Enter') leave();
          }}
        />
        {unit !== undefined && (
          <span className={styles.unit} id={`${id}-unit`}>
            {unit}
          </span>
        )}
      </div>
    </FieldFrame>
  );
}
