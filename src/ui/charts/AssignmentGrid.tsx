import { useTranslation } from 'react-i18next';
import type { OkOfferResult, Scenario } from '../../domain';
import { MONTH_KEYS } from '../../i18n';
import { planView, warmestMonth, type PlanLine } from '../forms/planView';
import styles from './AssignmentGrid.module.css';
import { PlanIcon, PlanLineGlyph, wayIcon } from './PlanIcons';

type Props = { result: OkOfferResult; scenario: Scenario };

/**
 * Which car drives where, per weekday, month and presence state (spec
 * "Zuordnungsplan"). A line reads: who is there, an arrow, who drives, and
 * to which workplace. A month in which the plan differs from the usual one
 * is highlighted (the winter changes). Each line has its sentence as text.
 */
export default function AssignmentGrid({ result, scenario }: Props) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const days = planView(
    result.plan,
    warmestMonth(scenario.parameters.monthlyTempC),
  );
  const name = (way: 'a' | 'b') =>
    scenario.workplaces[way].name.trim() ||
    t('detail.reserve.way', { way: way.toUpperCase() });

  const sentence = (line: PlanLine): string => {
    const who =
      line.present.length === 2
        ? t('detail.plan.bothPresent')
        : t('detail.plan.onlyPresent', { name: name(line.present[0] ?? 'a') });
    const what =
      line.vehicle === 'ev'
        ? t('detail.plan.evDrives', { name: name(line.target) })
        : t('detail.plan.iceDrives', { name: name(line.target) });
    return t('detail.plan.line', { who, what });
  };

  return (
    <div className="stack">
      <div
        className={styles.legend}
        aria-label={t('detail.plan.legendLabel')}
        role="group"
      >
        <span>
          <PlanIcon name="bolt" className={styles.ev} />
          {t('detail.plan.ev')}
        </span>
        <span>
          <PlanIcon name="pump" className={styles.ice} />
          {t('detail.plan.ice')}
        </span>
        {(['a', 'b'] as const).map((way) => (
          <span key={way}>
            <PlanIcon name={wayIcon(way)} />
            {t('detail.plan.workplace', {
              name: name(way),
              way: way.toUpperCase(),
            })}
          </span>
        ))}
        <span className={styles.legendText}>{t('detail.plan.legendText')}</span>
      </div>
      <p className="t-sm muted">{t('detail.reserve.swipe')}</p>
      <div
        className={styles.scroll}
        role="region"
        aria-label={t('detail.plan.scrollLabel')}
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <td />
              {MONTH_KEYS.map((key) => (
                <th scope="col" key={key}>
                  {c(`monthsShort.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.weekday}>
                <th scope="row">
                  <abbr title={c(`weekdays.${day.weekday}`)}>
                    {c(`weekdaysShort.${day.weekday}`)}
                  </abbr>
                </th>
                {day.months.map((month) => (
                  <td
                    key={month.month}
                    className={`${styles.cell} ${month.change ? styles.change : ''}`}
                  >
                    {month.lines.map((line) => (
                      <span key={line.state} className={styles.line}>
                        <PlanLineGlyph
                          label={sentence(line)}
                          icons={[
                            ...line.present.map((way) => ({
                              name: wayIcon(way),
                            })),
                            { name: 'arrow' as const, className: styles.arrow },
                            {
                              name:
                                line.vehicle === 'ev'
                                  ? ('bolt' as const)
                                  : ('pump' as const),
                              className:
                                line.vehicle === 'ev' ? styles.ev : styles.ice,
                            },
                            { name: wayIcon(line.target) },
                          ]}
                        />
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
