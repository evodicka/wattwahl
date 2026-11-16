import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { checkWarnings, type Warning } from '../../domain';
import { formatInput, formatMonthYear } from '../../i18n';
import { NumberField, type FieldMarks, type NumberRules } from '../components';
import { getAt } from './paths';
import {
  isChanged,
  parameterDefault,
  parameterMarks,
  useScenarioEditor,
} from './scenarioForm';

/** The plausibility warning of a path, as text; it blocks nothing (spec "Validierung"). */
export function useWarning(path: string): string | null {
  const { t } = useTranslation();
  const { scenario } = useScenarioEditor();
  if (!scenario) return null;
  const found: Warning | undefined = checkWarnings(scenario).find(
    (w) => w.path === path,
  );
  if (!found) return null;
  switch (found.code) {
    case 'coldAboveMild':
      return t('warning.coldAboveMild');
    case 'capacityAbove200':
      return t('warning.capacity');
    case 'commuteAbove300':
      return t('warning.wayLong');
    case 'minReserveAbove100':
      return t('warning.minReserveLong');
    case 'firstRegistrationAfterReferenceMonth':
      return t('warning.firstRegistrationAfterCutoff', {
        cutoff: formatMonthYear(scenario.parameters.warrantyReferenceMonth),
      });
  }
}

type Props = {
  path: string;
  label: ReactNode;
  /** Plain name for "… zurücksetzen". */
  name: string;
  unit?: string;
  rules: Partial<NumberRules>;
  decimals?: number;
  hint?: ReactNode;
  /** Path of the plausibility warning, if it differs from `path`. */
  warningPath?: string;
  /** Marks from the parameter list; off for fields without a row there. */
  marked?: boolean;
  error?: string | null;
  /** Needed for a calculation: shows "Pflicht" and stores `null` when emptied. */
  required?: boolean;
  /** Replaces the markers of the parameter list. */
  marks?: FieldMarks;
  placeholder?: string;
  /** A rule across entries; a message keeps the value from being stored. */
  validate?: (value: number | null) => string | null;
  /** Shows the default as a hint, with "Zurücksetzen" for a changed value. */
  withDefault?: boolean;
};

/**
 * A number field bound to a path of the active scenario. Markers, the
 * default hint and the reset come from the parameter list (spec
 * "Parameterliste"); a required field without a default shows "Pflicht".
 */
export function PathNumber({
  path,
  label,
  name,
  unit,
  rules,
  decimals = 0,
  hint,
  warningPath,
  marked = true,
  error = null,
  withDefault = false,
  required: requiredProp = false,
  marks: marksProp,
  placeholder,
  validate,
}: Props) {
  const { t } = useTranslation();
  const { scenario, set } = useScenarioEditor();
  const warning = useWarning(warningPath ?? path);
  if (!scenario) return null;
  const raw = getAt(scenario, path);
  const value = typeof raw === 'number' ? raw : null;
  const entry = parameterDefault(path);
  const required = entry?.flag === 'required' || requiredProp;
  const resettable =
    withDefault &&
    entry !== undefined &&
    typeof entry.value === 'number' &&
    isChanged(scenario, entry);
  const defaultHint =
    withDefault && entry && typeof entry.value === 'number'
      ? t('field.default', { value: formatInput(entry.value, decimals) })
      : undefined;
  const resetValue = entry?.value;
  return (
    <NumberField
      id={`f-${path}`}
      label={label}
      name={name}
      unit={unit}
      value={value}
      decimals={decimals}
      rules={{ required, nullable: required, ...rules }}
      marks={
        marksProp ?? (marked ? parameterMarks(scenario, path) : { required })
      }
      placeholder={placeholder}
      validate={validate}
      hint={
        hint !== undefined && defaultHint !== undefined ? (
          <>
            {defaultHint}
            {t('separator')}
            {hint}
          </>
        ) : (
          (hint ?? defaultHint)
        )
      }
      warning={warning}
      error={error}
      onCommit={(next) => set(path, next)}
      onReset={resettable ? () => set(path, resetValue) : null}
    />
  );
}
