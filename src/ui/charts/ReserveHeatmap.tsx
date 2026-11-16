import { useTranslation } from 'react-i18next';
import type { OkOfferResult, Scenario } from '../../domain';
import { MONTH_KEYS, formatDecimal, formatKm, formatPercent } from '../../i18n';
import { TrafficLight } from '../components';
import styles from './ReserveHeatmap.module.css';

const WAYS = ['a', 'b'] as const;
const SYMBOL = { green: '✓', yellow: '▲', red: '✕' } as const;
/** Red because the reserve is positive but below the Kilometerreserve. */
const BELOW_SYMBOL = '⊘';

type Props = { result: OkOfferResult; scenario: Scenario };

const wayKm = (c: Scenario['workplaces']['a']['commute']) =>
  (c.city ?? 0) + (c.rural ?? 0) + (c.highway ?? 0);

/**
 * Range reserve in km and percent for both ways in each month (spec
 * "Reichweitenreserve"). Every cell carries its traffic light as colour,
 * symbol and number; the same values are listed below for reading.
 */
export default function ReserveHeatmap({ result, scenario }: Props) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const threshold = scenario.parameters.trafficLightGreenFromPct;
  const minReserveKm = scenario.parameters.minReserveKm;
  const monthName = (index: number) =>
    c(`months.${MONTH_KEYS[index] ?? 'jan'}`);
  const cells = WAYS.map((way) =>
    result.reserves.filter((cell) => cell.way === way),
  );

  return (
    <div className="stack">
      <p className="statusbar t-cap muted">
        {t('detail.reserve.subtitle', {
          soh: formatPercent(result.sohCheck * 100, 1),
          threshold: formatPercent(threshold),
        })}
      </p>
      <div className="row-wrap t-sm muted">
        {WAYS.map((way) => {
          const workplace = scenario.workplaces[way];
          return (
            <span key={way}>
              {t('detail.reserve.wayInfo', {
                way: way.toUpperCase(),
                km: formatKm(wayKm(workplace.commute)),
                charging: workplace.chargesFreeAtWork
                  ? t('detail.reserve.chargingAtWork')
                  : t('detail.reserve.noChargingAtWork'),
              })}
            </span>
          );
        })}
      </div>
      <p className="t-sm muted">{t('detail.reserve.swipe')}</p>
      <div
        className={styles.scroll}
        role="region"
        aria-label={t('detail.reserve.scrollLabel')}
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
            {WAYS.map((way, row) => (
              <tr key={way}>
                <th scope="row">
                  {t('detail.reserve.way', { way: way.toUpperCase() })}
                </th>
                {[...(cells[row] ?? [])]
                  .sort((a, b) => a.month - b.month)
                  .map((cell) => (
                    <td
                      key={cell.month}
                      className={`${styles.cell} ${styles[cell.light]}`}
                    >
                      <span className={styles.symbol} aria-hidden="true">
                        {cell.belowMinReserve
                          ? BELOW_SYMBOL
                          : SYMBOL[cell.light]}
                      </span>
                      {formatDecimal(cell.reserveKm, 0)}
                      <small>{formatPercent(cell.reservePct)}</small>
                      <span className="visually-hidden">
                        {c(`light.${cell.light}`)}
                        {cell.belowMinReserve &&
                          `, ${t('detail.reserve.belowMinReserve')}`}
                      </span>
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.legend}>
        <TrafficLight level="green">
          {c('light.fromThreshold', { value: formatPercent(threshold) })}
        </TrafficLight>
        <TrafficLight level="yellow">
          {c('light.betweenZeroAnd', { value: formatPercent(threshold) })}
        </TrafficLight>
        <TrafficLight level="red">{c('light.belowZero')}</TrafficLight>
        {minReserveKm > 0 && (
          <TrafficLight level="red">
            {`${BELOW_SYMBOL} ${t('detail.reserve.legendBelowMinReserve', {
              value: formatKm(minReserveKm),
            })}`}
          </TrafficLight>
        )}
      </div>
      <details className={styles.alt}>
        <summary>{t('detail.reserve.asTable')}</summary>
        <ul>
          {cells.flat().map((cell) => (
            <li key={`${cell.way}${cell.month}`}>
              {t(
                cell.belowMinReserve
                  ? 'detail.reserve.cellBelow'
                  : 'detail.reserve.cell',
                {
                  way: cell.way.toUpperCase(),
                  month: monthName(cell.month),
                  km: formatKm(cell.reserveKm),
                  pct: formatPercent(cell.reservePct),
                  light: c(`light.${cell.light}`),
                },
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
