import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Candidate, Scenario } from '../../../domain';
import {
  MONTH_KEYS,
  formatDecimal,
  formatEuro,
  formatKm,
  formatPercent,
} from '../../../i18n';
import { Button, Card, Notice, TrafficLight } from '../../components';
import { candidateStatus, unsuitableText } from '../../forms/candidateStatus';
import type { CandidateStatus } from '../../forms/candidateStatus';
import { labelOfPath } from '../../forms/fieldLabels';

type Props = {
  candidate: Candidate;
  index: number;
  scenario: Scenario;
  status: ReturnType<typeof candidateStatus>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

const BADGE: Record<
  Exclude<CandidateStatus['kind'], 'pending'>,
  { level: 'green' | 'yellow' | 'red' | 'none'; key: string; symbol?: string }
> = {
  suitable: { level: 'green', key: 'light.suitable' },
  tight: { level: 'yellow', key: 'light.tight' },
  unsuitable: { level: 'red', key: 'light.unsuitable' },
  incomplete: { level: 'none', key: 'light.incomplete', symbol: '…' },
};

/** One candidate of the list (boards D2, M2): status, key figures and the actions. */
export function CandidateCard({
  candidate,
  index,
  scenario,
  status,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const titleId = `candidate-${candidate.id}`;
  const name = candidate.name.trim() || t('new');
  const used = candidate.condition === 'used';
  const meta = [
    used ? t('card.conditionUsed') : t('card.conditionNew'),
    ...(used && candidate.mileageKm !== null && candidate.mileageKm > 0
      ? [formatKm(candidate.mileageKm)]
      : []),
    ...(used && candidate.sohKnownPct !== null
      ? [`SoH ${formatPercent(candidate.sohKnownPct)}`]
      : []),
    ...(candidate.purchasePrice !== null
      ? [
          t('card.purchasePrice', {
            value: formatEuro(candidate.purchasePrice),
          }),
        ]
      : []),
    ...(candidate.netCapacityKwh !== null
      ? [
          t('card.capacity', {
            value: `${formatDecimal(candidate.netCapacityKwh, 0)} ${c('units.kwh')}`,
          }),
        ]
      : []),
  ].join(c('separator'));

  const badge = status.kind === 'pending' ? null : BADGE[status.kind];
  const best =
    status.kind === 'suitable' || status.kind === 'tight' ? status.best : null;
  const noVehicleWarranty =
    best !== null &&
    (best.warranty.remaining.vehicle.years <= 0 ||
      best.warranty.remaining.vehicle.km <= 0);
  const reserve = best?.minReserve ?? null;

  return (
    <Card
      muted={status.kind === 'unsuitable'}
      className="stack-sm"
      aria-labelledby={titleId}
    >
      <div className="spread">
        <h2 className="h-heading" id={titleId}>
          {name}
        </h2>
        {badge && (
          <TrafficLight level={badge.level} symbol={badge.symbol}>
            {c(badge.key as never)}
          </TrafficLight>
        )}
      </div>
      <p className="t-sm muted">{meta}</p>
      <div className="row-wrap">
        <span className="chip">{t('card.purchase')}</span>
        {candidate.leaseTiers.map((tier) => (
          <span className="chip" key={tier.id}>
            {t('card.lease', { tier: formatKm(tier.tierKmPerYear) })}
          </span>
        ))}
        {noVehicleWarranty && (
          <TrafficLight level="none">
            {t('card.vehicleNoWarranty')}
          </TrafficLight>
        )}
      </div>
      {reserve && (
        <p className="t-sm t-num">
          {t('card.minReserve')}{' '}
          <span className="t-label">
            {formatKm(reserve.reserveKm)} ({formatPercent(reserve.reservePct)})
          </span>
          {c('separator')}
          {t('card.reserveWhere', {
            way: reserve.way.toUpperCase(),
            month: c(`months.${MONTH_KEYS[reserve.month] ?? 'jan'}`),
          })}
        </p>
      )}
      {status.kind === 'incomplete' && (
        <Notice
          tone="warn"
          title={
            status.missing.length > 0
              ? t('card.missingTitle', { count: status.missing.length })
              : t('card.profileMissing')
          }
          actions={
            status.profileMissing && (
              <Link className="link" to="/fahrprofil">
                {t('card.toProfile')}
              </Link>
            )
          }
        >
          {status.missing.map((path) => labelOfPath(path, scenario)).join(', ')}
        </Notice>
      )}
      {status.kind === 'unsuitable' && (
        <p className="t-sm">{unsuitableText(status.reason)}</p>
      )}
      {candidate.warrantyNeedsReview && (
        <Notice tone="warn" title={t('card.checkWarrantyTitle')} />
      )}
      <div className="row-wrap" style={{ marginTop: 'var(--space-3)' }}>
        <Button
          variant={status.kind === 'incomplete' ? 'primary' : 'normal'}
          onClick={onEdit}
          aria-label={`${status.kind === 'incomplete' ? c('actions.complete') : c('actions.edit')}: ${name}`}
        >
          {status.kind === 'incomplete'
            ? c('actions.complete')
            : c('actions.edit')}
        </Button>
        <Button
          variant="quiet"
          onClick={onDuplicate}
          aria-label={`${c('actions.duplicate')}: ${name}`}
        >
          {c('actions.duplicate')}
        </Button>
        <Button
          variant="danger"
          onClick={onDelete}
          aria-label={`${c('actions.delete')}: ${name}`}
          data-index={index}
        >
          {c('actions.delete')}
        </Button>
      </div>
    </Card>
  );
}
