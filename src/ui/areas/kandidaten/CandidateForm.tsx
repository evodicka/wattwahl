import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';
import {
  PARAMETER_DEFAULTS,
  type Candidate,
  type Scenario,
} from '../../../domain';
import { formatDecimal, formatKm, formatMonthYear } from '../../../i18n';
import {
  addLeaseTier,
  deleteCandidate,
  duplicateCandidate,
  MAX_LEASE_TIERS,
  removeLeaseTier,
  selectActiveScenario,
  setCandidateCondition,
  useAppDispatch,
  useAppSelector,
} from '../../../state';
import {
  Button,
  Card,
  ConfirmDialog,
  MonthYearField,
  Notice,
  SelectField,
  TextField,
} from '../../components';
import { PathNumber, useWarning } from '../../forms/PathFields';
import { useScenarioEditor } from '../../forms/scenarioForm';
import { useIsDesktop } from '../../layout/useIsDesktop';
import { AreaHead } from '../AreaHead';
import styles from './CandidateForm.module.css';

const ROADS = ['city', 'highway', 'combined'] as const;
const WEATHER = ['mild', 'cold'] as const;
const STEPS = ['general', 'battery', 'warranty', 'lease'] as const;
type Step = (typeof STEPS)[number];

type GroupProps = { candidate: Candidate; path: string; scenario: Scenario };

const defaultOf = (path: string): number | null => {
  const entry = PARAMETER_DEFAULTS.find((e) => e.path === path);
  return typeof entry?.value === 'number' ? entry.value : null;
};

function General({ candidate, path }: GroupProps) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const { set } = useScenarioEditor();
  const registrationWarning = useWarning(`${path}.firstRegistration`);
  const used = candidate.condition === 'used';
  return (
    <Card className="stack" aria-labelledby="g-general">
      <h2 className="group-title" id="g-general">
        {t('form.groups.general')}
      </h2>
      <div className="f2">
        <TextField
          label={t('form.name')}
          required
          value={candidate.name}
          onChange={(value) => set(`${path}.name`, value)}
        />
        <SelectField
          label={t('form.condition')}
          marks={{ required: true }}
          value={candidate.condition}
          options={[
            { value: 'new', label: t('form.conditionNew') },
            { value: 'used', label: t('form.conditionUsed') },
          ]}
          onChange={(value) =>
            dispatch(setCandidateCondition(candidate.id, value))
          }
        />
      </div>
      <TextField
        label={t('form.note')}
        value={candidate.note}
        onChange={(value) => set(`${path}.note`, value)}
      />
      {used ? (
        <div className="f3">
          <MonthYearField
            label={t('form.firstRegistration')}
            name={t('form.firstRegistration')}
            nullable
            marks={{ required: true }}
            value={candidate.firstRegistration}
            warning={registrationWarning}
            onCommit={(value) => set(`${path}.firstRegistration`, value)}
          />
          <PathNumber
            path={`${path}.mileageKm`}
            label={t('form.mileage')}
            name={t('form.mileage')}
            unit={c('units.km')}
            required
            rules={{ min: 0 }}
          />
          <PathNumber
            path={`${path}.sohKnownPct`}
            label={t('form.soh')}
            name={t('form.soh')}
            unit={c('units.percent')}
            hint={t('form.sohHint')}
            marked={false}
            rules={{ required: false, nullable: true, min: 50, max: 100 }}
          />
        </div>
      ) : (
        <p className="t-sm muted">{t('form.usedFieldsHint')}</p>
      )}
    </Card>
  );
}

function Price({ path, scenario }: GroupProps) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const depreciation = defaultOf('parameters.depreciationPctPerYear');
  const maintenance = scenario.parameters.evMaintenancePerKm;
  return (
    <Card className="stack" aria-labelledby="g-price">
      <h2 className="group-title" id="g-price">
        {t('form.groups.price')}
      </h2>
      <div className="f3">
        <PathNumber
          path={`${path}.purchasePrice`}
          label={t('form.purchasePrice')}
          name={t('form.purchasePrice')}
          unit={c('units.euro')}
          required
          rules={{ min: 0, minExclusive: true }}
        />
        <PathNumber
          path={`${path}.depreciationPctPerYear`}
          label={t('form.depreciation')}
          name={t('form.depreciation')}
          unit={c('units.percentPerYear')}
          marks={{ assumption: true }}
          placeholder={
            depreciation === null ? undefined : formatDecimal(depreciation, 0)
          }
          hint={t('form.depreciationHint', {
            value:
              depreciation === null
                ? ''
                : `${formatDecimal(depreciation, 0)} %`,
          })}
          rules={{ required: false, nullable: true, min: 0, max: 100 }}
        />
        <PathNumber
          path={`${path}.maintenancePerKm`}
          label={t('form.maintenance')}
          name={t('form.maintenance')}
          unit={c('units.euroPerKm')}
          decimals={2}
          marked={false}
          placeholder={
            maintenance === null ? undefined : formatDecimal(maintenance, 2)
          }
          hint={t('form.maintenanceHint')}
          rules={{ required: false, nullable: true, min: 0 }}
        />
      </div>
    </Card>
  );
}

function Battery({ path, scenario }: GroupProps) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const { parameters } = scenario;
  const temperature = (value: number) =>
    `${formatDecimal(value, 0)} ${c('units.celsius')}`;
  return (
    <>
      <Card className="stack" aria-labelledby="g-battery">
        <h2 className="group-title" id="g-battery">
          {t('form.groups.battery')}
        </h2>
        <div className="f2">
          <PathNumber
            path={`${path}.netCapacityKwh`}
            label={t('form.capacity')}
            name={t('form.capacity')}
            unit={c('units.kwh')}
            required
            rules={{ min: 0, minExclusive: true }}
          />
        </div>
      </Card>
      <Card className="stack" aria-labelledby="g-range">
        <h2 className="group-title" id="g-range">
          {t('form.groups.range')}
        </h2>
        <p className="t-sm muted">{t('form.rangeIntro')}</p>
        {ROADS.map((road) => (
          <div
            key={road}
            role="group"
            aria-labelledby={`range-${road}`}
            className={styles.rangeGroup}
          >
            <span className="t-label" id={`range-${road}`}>
              {c(`roadTypes.${road}`)}
              {road === 'combined' && (
                <span className="t-cap muted"> ({t('form.combinedHint')})</span>
              )}
            </span>
            <div className="f2">
              {WEATHER.map((weather) => (
                <PathNumber
                  key={weather}
                  path={`${path}.rangeKm.${road}.${weather}`}
                  warningPath={
                    weather === 'cold' ? `${path}.rangeKm.${road}` : '-'
                  }
                  label={t(weather === 'mild' ? 'form.mild' : 'form.cold', {
                    temp: temperature(
                      weather === 'mild'
                        ? parameters.tempMildC
                        : parameters.tempColdC,
                    ),
                  })}
                  name={`${c(`roadTypes.${road}`)} ${c(`weather.${weather}`)}`}
                  unit={c('units.km')}
                  required
                  rules={{ min: 0, minExclusive: true }}
                />
              ))}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

function Warranty({ candidate, path, scenario }: GroupProps) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const { set } = useScenarioEditor();
  const latest = useAppSelector((state) => state.result.latest);
  const result =
    latest?.scenarioId === scenario.id
      ? latest.results[`${candidate.id}:purchase`]?.mid
      : undefined;
  const ok = result?.status === 'ok' ? result : null;
  const cutoff = formatMonthYear(scenario.parameters.warrantyReferenceMonth);
  const remaining = (what: string, w: { years: number; km: number }) =>
    t('form.remainingLine', {
      what,
      years:
        w.years <= 0
          ? t('form.remainingExpired')
          : `${formatDecimal(w.years, 1)} ${c('units.years')}`,
      km: w.km <= 0 ? t('form.remainingExpired') : formatKm(w.km),
    });
  const group = (key: 'vehicleWarranty' | 'batteryWarranty') => (
    <Card className="stack" aria-labelledby={`g-${key}`}>
      <h2 className="group-title" id={`g-${key}`}>
        {t(`form.${key}`)}
      </h2>
      <div className="f2">
        <PathNumber
          path={`${path}.${key}.years`}
          label={t('form.warrantyYears')}
          name={`${t(`form.${key}`)} ${t('form.warrantyYears')}`}
          unit={c('units.years')}
          required
          marks={{}}
          rules={{ min: 0 }}
        />
        <PathNumber
          path={`${path}.${key}.km`}
          label={t('form.warrantyKm')}
          name={`${t(`form.${key}`)} ${t('form.warrantyKm')}`}
          unit={c('units.km')}
          required
          marks={{}}
          rules={{ min: 0 }}
        />
      </div>
    </Card>
  );
  return (
    <>
      <div id="g-warranty" className="stack">
        {candidate.warrantyNeedsReview && (
          <Notice
            tone="warn"
            title={t('card.checkWarrantyTitle')}
            actions={
              <Button onClick={() => set(`${path}.warrantyNeedsReview`, false)}>
                {t('card.warrantyOk')}
              </Button>
            }
          >
            {t('card.checkWarrantyBody')}
          </Notice>
        )}
        {group('vehicleWarranty')}
        {group('batteryWarranty')}
        {candidate.condition === 'used' &&
          candidate.firstRegistration === null && (
            <Notice tone="warn" title={t('card.missingFirstRegistration')} />
          )}
        {candidate.condition === 'used' && ok && (
          <Card className="stack-sm" aria-labelledby="g-remaining">
            <h2 className="h-heading" id="g-remaining">
              {t('form.remainingTitle', { cutoff })}
            </h2>
            <p className="t-sm t-num">
              {remaining(
                t('form.vehicleWarranty'),
                ok.warranty.remaining.vehicle,
              )}
            </p>
            <p className="t-sm t-num">
              {remaining(
                t('form.batteryWarranty'),
                ok.warranty.remaining.battery,
              )}
            </p>
          </Card>
        )}
        <Notice
          tone="info"
          title={
            ok?.warranty.budgetKmPerYear != null
              ? t('form.budgetInfoTitle', {
                  km: `${formatDecimal(ok.warranty.budgetKmPerYear, 0)} ${c('units.kmPerYear')}`,
                })
              : t('form.budgetNone')
          }
        >
          {t('form.warrantyHint')}
        </Notice>
      </div>
    </>
  );
}

function Lease({ candidate, path }: GroupProps) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const [removing, setRemoving] = useState<string | null>(null);
  const tiers = candidate.leaseTiers;
  const full = tiers.length >= MAX_LEASE_TIERS;
  const removingTier = tiers.find((tier) => tier.id === removing);
  return (
    <Card className="stack" aria-labelledby="g-lease">
      <div className="spread">
        <h2 className="h-heading" id="g-lease">
          {t('form.groups.lease')}
        </h2>
        <Button
          disabled={full}
          onClick={() => dispatch(addLeaseTier(candidate.id))}
          aria-describedby={full ? 'lease-full' : undefined}
        >
          {t('form.addLease')}
        </Button>
      </div>
      <p className="t-sm muted" id={full ? 'lease-full' : undefined}>
        {full ? t('form.noMoreTiers') : t('form.leaseIntro')}
      </p>
      {tiers.map((tier, index) => {
        const base = `${path}.leaseTiers.${index}`;
        const heading = t('form.leaseTier', {
          tier: formatKm(tier.tierKmPerYear),
        });
        const field = (
          key:
            | 'monthlyRate'
            | 'termMonths'
            | 'downPayment'
            | 'extraKmPrice'
            | 'underKmRefund',
          label: string,
          unit: string,
          rules: { min: number; minExclusive?: boolean; integer?: boolean },
          decimals = 0,
        ) => (
          <PathNumber
            path={`${base}.${key}`}
            label={label}
            name={`${heading}: ${label}`}
            unit={unit}
            decimals={decimals}
            required
            marks={{}}
            rules={rules}
          />
        );
        return (
          <div
            key={tier.id}
            role="group"
            aria-labelledby={`tier-${tier.id}`}
            className={styles.leasePanel}
          >
            <div className="spread">
              <span className="t-label" id={`tier-${tier.id}`}>
                {heading}
              </span>
              <Button
                variant="quiet"
                onClick={() => setRemoving(tier.id)}
                aria-label={`${c('actions.remove')}: ${heading}`}
              >
                {c('actions.remove')}
              </Button>
            </div>
            <div className="f3">
              {field(
                'monthlyRate',
                t('form.monthlyRate'),
                c('units.euro'),
                { min: 0, minExclusive: true },
                2,
              )}
              {field('termMonths', t('form.term'), c('units.months'), {
                min: 0,
                minExclusive: true,
                integer: true,
              })}
              {field(
                'downPayment',
                t('form.downPayment'),
                c('units.euro'),
                { min: 0 },
                2,
              )}
              {field(
                'extraKmPrice',
                t('form.extraKmPrice'),
                c('units.euroPerKm'),
                { min: 0 },
                2,
              )}
              {field(
                'underKmRefund',
                t('form.underKmRefund'),
                c('units.euroPerKm'),
                { min: 0 },
                2,
              )}
              <PathNumber
                path={`${base}.tierKmPerYear`}
                label={t('form.tier')}
                name={`${heading}: ${t('form.tier')}`}
                unit={c('units.kmPerYearShort')}
                required
                marks={{}}
                rules={{ min: 0, minExclusive: true, integer: true }}
                validate={(value) =>
                  value !== null &&
                  tiers.some(
                    (other, i) => i !== index && other.tierKmPerYear === value,
                  )
                    ? t('form.tierTaken')
                    : null
                }
              />
            </div>
          </div>
        );
      })}
      <ConfirmDialog
        open={removing !== null}
        danger
        title={c('dialog.deleteLeaseTitle', {
          tier: removingTier ? formatKm(removingTier.tierKmPerYear) : '',
        })}
        confirmLabel={c('actions.remove')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) dispatch(removeLeaseTier(candidate.id, removing));
          setRemoving(null);
        }}
      />
    </Card>
  );
}

/** The form of one candidate (boards D3, M3 to M6): all groups on a desktop, four steps on a phone. */
export function CandidateForm({ id }: { id: string }) {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const scenario = useAppSelector(selectActiveScenario);
  const [step, setStep] = useState<Step>('general');
  const [deleting, setDeleting] = useState(false);
  if (!scenario) return null;
  const index = scenario.candidates.findIndex(
    (candidate) => candidate.id === id,
  );
  const candidate = scenario.candidates[index];
  if (!candidate) return <Navigate to="/kandidaten" replace />;

  const path = `candidates.${index}`;
  const props: GroupProps = { candidate, path, scenario };
  const name = candidate.name.trim();
  const title = name ? t('form.editTitle', { name }) : t('form.newTitle');
  const current = STEPS.indexOf(step);

  const groups: Record<Step, React.ReactNode> = {
    general: (
      <>
        <General {...props} />
        <Price {...props} />
      </>
    ),
    battery: <Battery {...props} />,
    warranty: <Warranty {...props} />,
    lease: <Lease {...props} />,
  };

  const jump = (target: string) =>
    document.getElementById(target)?.scrollIntoView?.({ block: 'start' });

  return (
    <>
      <div className="stack-sm">
        <Link className="link" to="/kandidaten">
          {c('frame.back', { area: t('form.backToList') })}
        </Link>
        <div className="spread">
          <AreaHead title={title} />
          <div className="row">
            <Button
              onClick={() => {
                const copy = dispatch(
                  duplicateCandidate(
                    candidate.id,
                    t('card.copyName', { name: name || t('new') }),
                  ),
                );
                if (copy) void navigate(`/kandidaten/${copy}`);
              }}
            >
              {c('actions.duplicate')}
            </Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              {c('actions.delete')}
            </Button>
          </div>
        </div>
      </div>

      {desktop ? (
        <div className={styles.layout}>
          <div className="stack-lg">
            {/* Board D3 order; on a phone the price belongs to the first step. */}
            <General {...props} />
            <Battery {...props} />
            <Warranty {...props} />
            <Price {...props} />
            <Lease {...props} />
          </div>
          <nav aria-label={t('form.jumpMenu')} className={styles.jump}>
            <span className="t-label">{t('form.jumpTo')}</span>
            {(
              [
                ['g-general', t('form.groups.general')],
                ['g-battery', t('form.groups.battery')],
                ['g-range', t('form.groups.rangeShort')],
                ['g-warranty', t('form.groups.warranty')],
                ['g-price', t('form.groups.price')],
                ['g-lease', t('form.groups.lease')],
              ] as const
            ).map(([target, label]) => (
              <button
                key={target}
                type="button"
                className={styles.jumpLink}
                onClick={() => jump(target)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <>
          <div className="stack-sm">
            <div
              className={styles.steps}
              role="img"
              aria-label={t('form.step', {
                current: current + 1,
                total: STEPS.length,
              })}
            >
              {STEPS.map((key, i) => (
                <span
                  key={key}
                  className={i <= current ? styles.on : undefined}
                />
              ))}
            </div>
            <span className="t-sm">
              <b>
                {t('form.step', { current: current + 1, total: STEPS.length })}
              </b>
              {c('separator')}
              {t(`form.steps.${step}`)}
            </span>
          </div>
          <div className="stack">{groups[step]}</div>
          <div className={styles.actions}>
            <Button
              disabled={current === 0}
              onClick={() => setStep(STEPS[current - 1] ?? 'general')}
            >
              {c('actions.back')}
            </Button>
            {current < STEPS.length - 1 ? (
              <Button
                variant="primary"
                onClick={() => setStep(STEPS[current + 1] ?? 'lease')}
              >
                {c('actions.next')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void navigate('/kandidaten')}
              >
                {c('actions.done')}
              </Button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleting}
        danger
        title={c('dialog.deleteCandidateTitle', { name: name || t('new') })}
        confirmLabel={c('actions.delete')}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          dispatch(deleteCandidate(candidate.id));
          setDeleting(false);
          void navigate('/kandidaten');
        }}
      >
        {c('dialog.deleteCandidateBody')}
      </ConfirmDialog>
    </>
  );
}
