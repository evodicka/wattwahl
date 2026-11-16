import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Scenario } from '../../../domain';
import { MONTH_KEYS, formatEuro, formatKm, formatPercent } from '../../../i18n';
import { Card } from '../../components';
import type { ResultRow } from '../../forms/resultRows';
import styles from './OfferCards.module.css';
import {
  RowProblem,
  SuitabilityBadge,
  SwitchMark,
  WarrantyBadge,
  evEndText,
  evKmText,
  iceEndText,
  offerPath,
  useOfferLabel,
  useRangeText,
} from './parts';

type Props = {
  rows: ResultRow[];
  scenario: Scenario;
};

/** The offers as cards below 900 px (boards M8, T2), in the order of the table. */
export function OfferCards({ rows, scenario }: Props) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const offerLabel = useOfferLabel();
  const rangeText = useRangeText();
  return (
    <div className={styles.list}>
      {rows.map((row) => {
        const ok = row.result.status === 'ok' ? row.result : null;
        const title = t('table.offerTitle', {
          candidate: row.candidateName.trim(),
          offer: offerLabel(row),
        });
        const min = ok?.minReserve ?? null;
        return (
          <Card
            key={row.offerId}
            muted={ok === null}
            className={styles.offer}
            aria-label={title}
          >
            <div className="spread">
              <h3 className="h-heading">{title}</h3>
              <SuitabilityBadge row={row} />
            </div>
            {ok && <SwitchMark result={ok} />}
            {ok && row.total !== null ? (
              <>
                <div className={styles.total}>{formatEuro(row.total)}</div>
                {rangeText(row) && (
                  <span className="t-cap muted">
                    {t('table.rangeCard', { range: rangeText(row) })}
                  </span>
                )}
                <dl className={styles.facts}>
                  <dt>{t('table.minReserve')}</dt>
                  <dd>
                    {min
                      ? t('table.reserveCard', {
                          value: `${formatKm(min.reserveKm)}${c('separator')}${formatPercent(min.reservePct)}`,
                          where: t('table.reserveWhere', {
                            way: min.way.toUpperCase(),
                            month: c(
                              `months.${MONTH_KEYS[min.month] ?? 'jan'}`,
                            ),
                          }),
                        })
                      : t('table.noDrive')}
                  </dd>
                  <dt>{t('table.evPerYear')}</dt>
                  <dd>{`${evKmText(ok)} ${c('units.km')}`}</dd>
                  <dt>{t('table.evEnd')}</dt>
                  <dd>{evEndText(ok)}</dd>
                  <dt>{t('table.iceEnd')}</dt>
                  <dd>{iceEndText(ok)}</dd>
                  <dt>{t('table.warranty')}</dt>
                  <dd>
                    <WarrantyBadge result={ok} />
                  </dd>
                </dl>
                <Link
                  className="link"
                  to={offerPath(row.offerId)}
                  aria-label={t('table.openOffer', { offer: title })}
                >
                  {c('actions.showDetails')}
                </Link>
              </>
            ) : (
              <p className="t-sm">
                <RowProblem row={row} scenario={scenario} />
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
