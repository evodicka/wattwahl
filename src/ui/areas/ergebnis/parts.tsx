import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { OfferResult, OkOfferResult, Scenario } from '../../../domain';
import {
  MONTH_KEYS,
  formatDecimal,
  formatEuro,
  formatKm,
  formatPercent,
} from '../../../i18n';
import { TrafficLight } from '../../components';
import { unsuitableText } from '../../forms/candidateStatus';
import { labelOfPath } from '../../forms/fieldLabels';
import {
  reserveLightOf,
  warrantyStatus,
  type ResultRow,
  type WarrantyStatus,
} from '../../forms/resultRows';

const SUITABILITY = {
  suitable: { level: 'green', key: 'light.suitable' },
  tight: { level: 'yellow', key: 'light.tight' },
  unsuitable: { level: 'red', key: 'light.unsuitable' },
  incomplete: { level: 'none', key: 'light.incomplete', symbol: '…' },
} as const;

/** The route of one offer's detail view; the id holds colons, so it is encoded. */
export const offerPath = (offerId: string) =>
  `/ergebnis/${encodeURIComponent(offerId)}`;

/** "Kauf" or "Leasing 15.000 km". */
export function useOfferLabel() {
  const { t } = useTranslation('ergebnis');
  return (row: Pick<ResultRow, 'leaseTierKm'>) =>
    row.leaseTierKm === null
      ? t('table.purchase')
      : t('table.lease', { tier: formatKm(row.leaseTierKm) });
}

export function SuitabilityBadge({ row }: { row: ResultRow }) {
  const { t: c } = useTranslation();
  const badge = SUITABILITY[row.suitability];
  return (
    <TrafficLight
      level={badge.level}
      symbol={'symbol' in badge ? badge.symbol : undefined}
    >
      {c(badge.key)}
    </TrafficLight>
  );
}

/** Light, km and percent of the smallest reserve with its way and month. */
export function ReserveCell({ result }: { result: OkOfferResult }) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const min = result.minReserve;
  if (!min) return <span className="muted">{t('table.noDrive')}</span>;
  const light = reserveLightOf(result) ?? 'none';
  return (
    <>
      <TrafficLight level={light}>
        {formatKm(min.reserveKm)}
        {c('separator')}
        {formatPercent(min.reservePct)}
      </TrafficLight>
      <br />
      <span className="t-cap muted">
        {t('table.reserveWhere', {
          way: min.way.toUpperCase(),
          month: c(`months.${MONTH_KEYS[min.month] ?? 'jan'}`),
        })}
      </span>
    </>
  );
}

export function WarrantyBadge({ result }: { result: OkOfferResult }) {
  const { t } = useTranslation('ergebnis');
  const status: WarrantyStatus = warrantyStatus(result);
  switch (status.kind) {
    case 'none':
      return <span className="muted">{t('table.noValue')}</span>;
    case 'noWarranty':
      return (
        <TrafficLight level="none">
          {t('warrantyStatus.noWarranty')}
        </TrafficLight>
      );
    case 'leaseLimit':
      return (
        <TrafficLight level="none">
          {t('warrantyStatus.leaseLimit')}
        </TrafficLight>
      );
    case 'exceeded':
      return (
        <TrafficLight level="red">{t('warrantyStatus.exceeded')}</TrafficLight>
      );
    case 'budgetActive':
      return (
        <TrafficLight level="yellow">
          {t('warrantyStatus.budgetActive', {
            cost: formatEuro(status.extraCost),
          })}
        </TrafficLight>
      );
    case 'inBudget':
      return (
        <TrafficLight level="green">
          {t('warrantyStatus.inBudget')}
        </TrafficLight>
      );
  }
}

/** The span from "E-Auto günstig" to "E-Auto ungünstig", e.g. "25.400 – 28.700 €". */
export function useRangeText() {
  const { t } = useTranslation('ergebnis');
  return (row: ResultRow): string | null =>
    row.range
      ? t('table.rangeValue', {
          min: formatDecimal(row.range.min, 0),
          max: formatEuro(row.range.max),
        })
      : null;
}

/** The text of a row without numbers: the missing fields or the reason (Z02, Z03). */
export function RowProblem({
  row,
  scenario,
}: {
  row: ResultRow;
  scenario: Scenario;
}) {
  const { t } = useTranslation('ergebnis');
  const result: OfferResult = row.result;
  if (result.status === 'unsuitable') {
    return <>{unsuitableText(result.reason, 'table')}</>;
  }
  if (result.status !== 'incomplete') return null;
  if (row.missing.length === 0) {
    return (
      <>
        {t('table.profileMissing')}{' '}
        <Link className="link" to="/fahrprofil">
          {t('empty.profile')}
        </Link>
      </>
    );
  }
  return (
    <>
      {t('table.missing', {
        count: row.missing.length,
        fields: row.missing
          .map((path) => labelOfPath(path, scenario))
          .join(', '),
      })}
    </>
  );
}

export const evKmText = (result: OkOfferResult) =>
  formatDecimal(result.evKmPerYear, 0);
export const evEndText = (result: OkOfferResult) =>
  formatKm(result.evOdometerEnd);
export const iceEndText = (result: OkOfferResult) =>
  formatKm(result.iceOdometerEnd);
