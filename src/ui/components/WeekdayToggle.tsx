import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { WEEKDAYS, type Weekday } from '../../domain';
import fieldStyles from './Field.module.css';
import styles from './WeekdayToggle.module.css';

type Props = {
  label: string;
  value: readonly Weekday[];
  onChange: (value: Weekday[]) => void;
};

/**
 * Weekday toggles (design system): one pressed button per visited day. With
 * no day left, the field says that at least one is needed.
 */
export function WeekdayToggle({ label, value, onChange }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const empty = value.length === 0;
  const toggle = (day: Weekday) =>
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : WEEKDAYS.filter((d) => d === day || value.includes(d)),
    );
  return (
    <div className={`${fieldStyles.field} ${empty ? fieldStyles.error : ''}`}>
      <span className={fieldStyles.label} id={`${id}-label`}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={empty ? `${id}-msg` : undefined}
        className={styles.days}
      >
        {WEEKDAYS.map((day) => (
          <button
            key={day}
            type="button"
            className={styles.day}
            aria-pressed={value.includes(day)}
            onClick={() => toggle(day)}
          >
            <span aria-hidden="true">{t(`weekdaysShort.${day}`)}</span>
            <span className="visually-hidden">{t(`weekdays.${day}`)}</span>
          </button>
        ))}
      </div>
      {empty && (
        <span className={fieldStyles.message} id={`${id}-msg`}>
          <span aria-hidden="true">✕</span>
          {t('validation.weekdays')}
        </span>
      )}
    </div>
  );
}
