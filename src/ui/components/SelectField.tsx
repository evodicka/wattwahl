import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';
import { describedBy, FieldFrame, type FieldMarks } from './FieldFrame';

type Props<Value extends string> = {
  label: ReactNode;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  marks?: FieldMarks;
  hint?: ReactNode;
  onReset?: { name: string; onReset: () => void } | null;
  id?: string;
};

/** Native select of the design system. */
export function SelectField<Value extends string>({
  label,
  value,
  options,
  onChange,
  marks,
  hint,
  onReset = null,
  id: givenId,
}: Props<Value>) {
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const reset = onReset
    ? { label: onReset.name, onReset: onReset.onReset }
    : null;
  return (
    <FieldFrame id={id} label={label} marks={marks} hint={hint} reset={reset}>
      <select
        id={id}
        className={styles.select}
        value={value}
        aria-describedby={describedBy(id, {
          hint: hint !== undefined || reset !== null,
          message: false,
        })}
        onChange={(event) => {
          const chosen = options.find((o) => o.value === event.target.value);
          if (chosen) onChange(chosen.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}
