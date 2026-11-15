import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  ageInMonths,
  type Candidate,
  type OkOfferResult,
  type Scenario,
} from '../../../domain';
import {
  formatDecimal,
  formatInput,
  formatEuro,
  formatKm,
  formatMonthYear,
} from '../../../i18n';
import { Notice, Tile, TrafficLight } from '../../components';
import {
  normalWarranty,
  warrantyView,
  type WarrantyPart,
} from '../../forms/warrantyView';

type Props = {
  result: OkOfferResult;
  candidate: Candidate;
  scenario: Scenario;
};

const PARTS = ['vehicle', 'battery'] as const;

/**
 * Annual budget, planned EV kilometres, years to the km limit, and for a used
 * car the remaining warranty the app worked out (spec "Garantie-Budget"; states
 * Z13, Z17, Z20).
 */
export function WarrantySection({ result, candidate, scenario }: Props) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const view = warrantyView(result, {
    budgetAsTarget: scenario.parameters.warrantyBudgetAsTarget,
  });
  const years = (value: number) =>
    t('detail.warranty.yearsValue', { value: formatDecimal(value, 1) });
  const partName = (part: WarrantyPart) =>
    t(
      part === 'vehicle'
        ? 'detail.warranty.partVehicle'
        : 'detail.warranty.partBattery',
    );

  if (view.kind === 'noWarranty') {
    return (
      <div className="stack">
        <Tile
          label={t('detail.warranty.budget')}
          value={t('warrantyStatus.noWarranty')}
        >
          <span className="t-sm muted">
            {t('detail.warranty.noWarrantyBody')}
          </span>
        </Tile>
        {candidate.condition === 'used' && (
          <RemainingBox
            result={result}
            candidate={candidate}
            scenario={scenario}
          />
        )}
      </div>
    );
  }

  const exceededYears = view.yearsToLimit;
  return (
    <div className="stack">
      {!view.budget && result.kind === 'lease' && (
        <p className="t-sm muted">{t('detail.warranty.leaseNote')}</p>
      )}
      {view.targetOff && (
        <p className="t-sm muted">{t('detail.warranty.budgetOff')}</p>
      )}

      {view.exceeded && view.budget && (
        <Notice tone="warn" title={t('warrantyStatus.exceeded')}>
          {t('detail.warranty.exceededBody', {
            planned: formatKm(view.plannedKm),
            budget: formatKm(view.budget.kmPerYear),
            years:
              exceededYears === null
                ? t('table.noValue')
                : years(exceededYears),
            cost: formatEuro(view.extraCost),
          })}
        </Notice>
      )}

      <div className="tiles">
        {view.budget && (
          <Tile
            label={t('detail.warranty.budget')}
            value={t('detail.warranty.budgetValue', {
              km: formatKm(view.budget.kmPerYear),
            })}
          >
            <span className="t-sm muted">
              {t('detail.warranty.budgetFrom', {
                source: partName(view.budget.source),
                km: formatKm(view.budget.km),
                years: years(view.budget.years),
              })}
              {view.expired.includes('vehicle') && (
                <> {t('detail.warranty.vehicleExpiredNote')}</>
              )}
            </span>
          </Tile>
        )}
        <Tile
          label={t('detail.warranty.plannedKm')}
          value={formatKm(view.plannedKm)}
        >
          <span className="t-sm muted">
            {view.budget
              ? view.overBudget
                ? t('detail.warranty.plannedKmHintOver')
                : t('detail.warranty.plannedKmHint')
              : t('detail.warranty.plannedKmHintNoBudget')}
          </span>
        </Tile>

        <Tile
          label={t('detail.warranty.yearsToLimit')}
          value={
            view.yearsToLimit === null
              ? t('table.noValue')
              : years(view.yearsToLimit)
          }
        >
          <span className="row-wrap">
            {PARTS.filter((part) => !view.expired.includes(part)).map(
              (part) => (
                <TrafficLight key={part} level="green">
                  {t('detail.warranty.partRemainingYears', {
                    part: partName(part),
                    years: years(result.warranty.remaining[part].years),
                  })}
                </TrafficLight>
              ),
            )}
            {view.expired.includes('vehicle') && (
              <TrafficLight level="none">
                {t('detail.warranty.vehicleNoWarranty')}
              </TrafficLight>
            )}
          </span>
        </Tile>
      </div>

      {candidate.condition === 'used' && (
        <RemainingBox
          result={result}
          candidate={candidate}
          scenario={scenario}
        />
      )}

      <p className="t-sm">
        <span className="t-label">{t('detail.warranty.extraCost')}</span>{' '}
        {formatEuro(view.extraCost)}
        {view.budget && scenario.parameters.warrantyBudgetAsTarget && (
          <span className="muted">
            {c('separator')}
            {t('detail.warranty.budgetIsTarget')}
          </span>
        )}
      </p>
    </div>
  );
}

/** The remaining warranty at the Stichtag with the inputs it was computed from (Z20). */
function RemainingBox({ result, candidate, scenario }: Props) {
  const { t } = useTranslation('ergebnis');
  const { t: k } = useTranslation('kandidaten');
  const cutoff = scenario.parameters.warrantyReferenceMonth;
  const registration = candidate.firstRegistration;
  const years = (value: number) =>
    t('detail.warranty.yearsValue', { value: formatDecimal(value, 1) });
  return (
    <div className="stack-sm">
      <h4 className="t-label">
        {t('detail.warranty.remainingTitle', {
          cutoff: formatMonthYear(cutoff),
        })}
      </h4>
      {registration && (
        <p className="t-sm">
          {t('detail.warranty.remainingInputs', {
            firstRegistration: formatMonthYear(registration),
            km: formatKm(candidate.mileageKm ?? 0),
            years: years(ageInMonths(registration, cutoff) / 12),
          })}
        </p>
      )}
      {PARTS.map((part) => {
        const normal = normalWarranty(candidate, part);
        const left = result.warranty.remaining[part];
        const expired = left.years <= 0 || left.km <= 0;
        return (
          <p className="t-sm" key={part}>
            {t('detail.warranty.remainingLine', {
              part: t(
                part === 'vehicle'
                  ? 'detail.warranty.partVehicle'
                  : 'detail.warranty.partBattery',
              ),
              normal: t('detail.warranty.normal', {
                years: formatInput(normal.years ?? 0),
                km: formatKm(normal.km ?? 0),
              }),
              remaining: expired
                ? k('form.remainingExpired')
                : t('detail.warranty.remaining', {
                    years: years(left.years),
                    km: formatKm(left.km),
                  }),
            })}
          </p>
        );
      })}
      <Link className="link" to="/parameter">
        {t('detail.warranty.changeCutoff')}
      </Link>
    </div>
  );
}
