import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { Scenario } from '../../../domain';
import { formatEuro } from '../../../i18n';
import { DataTable, rowClass } from '../../components';
import type { ResultRow } from '../../forms/resultRows';
import styles from './ResultTable.module.css';
import {
  ReserveCell,
  RowProblem,
  SuitabilityBadge,
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
  /** Name of the shown price case, for the cost column. */
  priceCaseName: string;
  busy: boolean;
};

/**
 * The comparison of all offers (board D5, T4): suitable ones by cost, then the
 * unsuitable and incomplete ones greyed out with their reason. A click on a
 * row, or the link in its first cell, opens the detail view.
 */
export function ResultTable({ rows, scenario, priceCaseName, busy }: Props) {
  const { t } = useTranslation('ergebnis');
  const navigate = useNavigate();
  const offerLabel = useOfferLabel();
  const rangeText = useRangeText();
  return (
    <DataTable caption={t('table.caption')} busy={busy}>
      <thead>
        <tr>
          <th scope="col">{t('table.candidate')}</th>
          <th scope="col">{t('table.offer')}</th>
          <th scope="col">{t('table.suitability')}</th>
          <th scope="col" className="num">
            {t('table.totalCase', { case: priceCaseName })}
            <br />
            <span className="t-cap">{t('table.range')}</span>
          </th>
          <th scope="col">
            {t('table.minReserve')}
            <br />
            <span className="t-cap">{t('table.minReserveWhere')}</span>
          </th>
          <th scope="col" className="num">
            {t('table.evKm')}
          </th>
          <th scope="col" className="num">
            {t('table.evEnd')}
          </th>
          <th scope="col" className="num">
            {t('table.iceEnd')}
          </th>
          <th scope="col">{t('table.warranty')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const ok = row.result.status === 'ok' ? row.result : null;
          const name = row.candidateName.trim();
          return (
            <tr
              key={row.offerId}
              className={rowClass({
                muted: ok === null,
                clickable: ok !== null,
              })}
              onClick={
                ok
                  ? (event) => {
                      // A link or button in the row does its own thing.
                      if ((event.target as HTMLElement).closest('a, button'))
                        return;
                      void navigate(offerPath(row.offerId));
                    }
                  : undefined
              }
            >
              <td>
                {ok ? (
                  <Link className={styles.name} to={offerPath(row.offerId)}>
                    {name}
                  </Link>
                ) : (
                  <span className={styles.name}>{name}</span>
                )}
              </td>
              <td>{offerLabel(row)}</td>
              <td>
                <SuitabilityBadge row={row} />
              </td>
              <td className="num">
                {row.total === null ? (
                  t('table.noTotal')
                ) : (
                  <>
                    <b>{formatEuro(row.total)}</b>
                    {rangeText(row) && (
                      <>
                        <br />
                        <span className="t-cap muted">{rangeText(row)}</span>
                      </>
                    )}
                  </>
                )}
              </td>
              {ok ? (
                <>
                  <td className="t-num">
                    <ReserveCell result={ok} />
                  </td>
                  <td className="num">{evKmText(ok)}</td>
                  <td className="num">{evEndText(ok)}</td>
                  <td className="num">{iceEndText(ok)}</td>
                  <td>
                    <WarrantyBadge result={ok} />
                  </td>
                </>
              ) : (
                <td colSpan={5}>
                  <RowProblem row={row} scenario={scenario} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
