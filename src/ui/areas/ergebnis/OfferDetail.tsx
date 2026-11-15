import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { OkOfferResult, PriceCase, Scenario } from '../../../domain';
import { formatEuro } from '../../../i18n';
import { Button, Notice, SelectField, Tile } from '../../components';
import {
  AssignmentGrid,
  ChartSuspense,
  ReserveHeatmap,
} from '../../charts/lazy';
import type { ResultRow } from '../../forms/resultRows';
import {
  SuitabilityBadge,
  offerPath,
  useOfferLabel,
  useRangeText,
} from './parts';
import { TraceSection } from './TraceSection';
import { WarrantySection } from './WarrantySection';

type Props = {
  /** The offer shown; its result is computed. */
  row: ResultRow & { result: OkOfferResult };
  /** Every row of the comparison, for the choice of the offer. */
  rows: ResultRow[];
  scenario: Scenario;
  priceCaseName: string;
  /** The price case shown, for the Rechenweg. */
  priceCase: PriceCase;
};

/**
 * The detail views of one offer (boards D6, M9): total cost, range reserve,
 * assignment plan and warranty. The Rechenweg follows in S21; the scenario
 * comparison lives under "Szenarien und Daten" and is linked from here.
 */
export function OfferDetail({
  row,
  rows,
  scenario,
  priceCaseName,
  priceCase,
}: Props) {
  const { t } = useTranslation('ergebnis');
  const navigate = useNavigate();
  const offerLabel = useOfferLabel();
  const rangeText = useRangeText();
  const candidate = scenario.candidates.find((c) => c.id === row.candidateId);
  const title = (r: ResultRow) =>
    t('table.offerTitle', {
      candidate: r.candidateName.trim(),
      offer: offerLabel(r),
    });
  const options = rows
    .filter((r) => r.total !== null)
    .map((r) => ({ value: r.offerId, label: title(r) }));

  return (
    <>
      <Tile
        label={
          <span className="spread">
            <span>{t('table.totalCase', { case: priceCaseName })}</span>
            <SuitabilityBadge row={row} />
          </span>
        }
        value={formatEuro(row.result.costs.total)}
      >
        {rangeText(row) && (
          <span className="t-cap muted">
            {t('table.rangeCard', { range: rangeText(row) })}
          </span>
        )}
      </Tile>

      <section className="stack">
        <div className="spread">
          <h3 className="h-title">{t('detail.reserve.title')}</h3>
          <SelectField
            label={t('detail.reserve.candidate')}
            value={row.offerId}
            options={options}
            onChange={(offerId) => void navigate(offerPath(offerId))}
          />
        </div>
        <ChartSuspense>
          <ReserveHeatmap result={row.result} scenario={scenario} />
        </ChartSuspense>
      </section>

      <section className="stack">
        <h3 className="h-title">{t('detail.plan.title')}</h3>
        <p className="t-sm muted">{t('detail.plan.subtitle')}</p>
        <ChartSuspense>
          <AssignmentGrid result={row.result} scenario={scenario} />
        </ChartSuspense>
      </section>

      {candidate && (
        <section className="stack">
          <h3 className="h-title">{t('detail.warranty.title')}</h3>
          <WarrantySection
            result={row.result}
            candidate={candidate}
            scenario={scenario}
          />
        </section>
      )}

      <section className="stack">
        <h3 className="h-title">{t('detail.trace.title')}</h3>
        <p className="t-sm muted">{t('detail.trace.intro')}</p>
        <TraceSection offerId={row.offerId} priceCase={priceCase} />
      </section>

      <section className="stack">
        <h3 className="h-title">{t('detail.compare.title')}</h3>
        <Notice
          tone="info"
          title={t('detail.compare.whereTitle')}
          actions={
            <Button onClick={() => void navigate('/szenarien')}>
              {t('detail.compare.action')}
            </Button>
          }
        >
          {t('detail.compare.whereBody')}
        </Notice>
      </section>
    </>
  );
}
