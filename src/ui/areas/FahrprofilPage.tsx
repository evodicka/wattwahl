import { useTranslation } from 'react-i18next';
import type { Scenario, Weekday } from '../../domain';
import { formatKm } from '../../i18n';
import { Card, Switch, TextField, WeekdayToggle } from '../components';
import { PathNumber } from '../forms/PathFields';
import { useScenarioEditor } from '../forms/scenarioForm';
import { AreaHead } from './AreaHead';

const ROADS = ['city', 'rural', 'highway'] as const;

type Prices = { min: number | null; mid: number | null; max: number | null };

/** Minimum, mid and maximum must rise (spec "Bestandsfahrzeug"); the message sits on the field that breaks it. */
const priceOrderError = (
  price: Prices,
  field: 'min' | 'mid' | 'max',
  message: string,
): string | null => {
  const { min, mid, max } = price;
  if (field === 'mid' && min !== null && mid !== null && min > mid)
    return message;
  if (field === 'max' && mid !== null && max !== null && mid > max)
    return message;
  return null;
};

const sum = (road: Record<(typeof ROADS)[number], number | null>): number =>
  ROADS.reduce((total, key) => total + (road[key] ?? 0), 0);

function Vehicle({ scenario }: { scenario: Scenario }) {
  const { t } = useTranslation('fahrprofil');
  const { t: c } = useTranslation();
  const { set } = useScenarioEditor();
  const { iceVehicle } = scenario;
  const order = c('validation.minMidMax');
  return (
    <Card className="stack" aria-labelledby="bf">
      <h2 className="group-title" id="bf">
        {t('vehicle.title')}
      </h2>
      <TextField
        label={t('vehicle.name')}
        required
        value={iceVehicle.name}
        onChange={(value) => set('iceVehicle.name', value)}
      />
      {ROADS.map((road) => (
        <PathNumber
          key={road}
          path={`iceVehicle.consumptionLPer100Km.${road}`}
          label={t('vehicle.consumption', {
            roadType: c(`roadTypes.${road}`),
          })}
          name={t('vehicle.consumption', {
            roadType: c(`roadTypes.${road}`),
          })}
          unit={c('units.litrePer100km')}
          decimals={1}
          marked={false}
          rules={{ required: true, nullable: true, min: 0, minExclusive: true }}
        />
      ))}
      <PathNumber
        path="iceVehicle.mileageKm"
        label={t('vehicle.odometer')}
        name={t('vehicle.odometer')}
        unit={c('units.km')}
        hint={t('vehicle.odometerHint')}
        marked={false}
        rules={{ required: true, nullable: true, min: 0, integer: true }}
      />
      <PathNumber
        path="iceVehicle.maintenancePerKm"
        label={t('vehicle.maintenance')}
        name={t('vehicle.maintenance')}
        unit={c('units.euroPerKm')}
        decimals={2}
        rules={{ min: 0 }}
      />
      <div className="f3-prices">
        {(['min', 'mid', 'max'] as const).map((key) => (
          <PathNumber
            key={key}
            path={`iceVehicle.petrolPrice.${key}`}
            label={
              key === 'min'
                ? t('vehicle.petrolMin')
                : key === 'mid'
                  ? t('vehicle.petrolMid')
                  : t('vehicle.petrolMax')
            }
            name={t(
              key === 'min'
                ? 'vehicle.petrolMin'
                : key === 'mid'
                  ? 'vehicle.petrolMid'
                  : 'vehicle.petrolMax',
            )}
            unit={c('units.euroPerLitre')}
            decimals={2}
            rules={{ min: 0 }}
            error={priceOrderError(iceVehicle.petrolPrice, key, order)}
          />
        ))}
      </div>
      <PathNumber
        path="iceVehicle.petrolEscalationPct"
        label={t('vehicle.petrolEscalation')}
        name={t('vehicle.petrolEscalation')}
        unit={c('units.percentPerYear')}
        withDefault
        rules={{ min: -100 }}
      />
    </Card>
  );
}

function Workplace({
  scenario,
  which,
}: {
  scenario: Scenario;
  which: 'a' | 'b';
}) {
  const { t } = useTranslation('fahrprofil');
  const { t: c } = useTranslation();
  const { set } = useScenarioEditor();
  const workplace = scenario.workplaces[which];
  const base = `workplaces.${which}`;
  const oneWay = sum(workplace.commute);
  const title = which === 'a' ? t('workplace.titleA') : t('workplace.titleB');
  return (
    <Card className="stack" aria-labelledby={`w${which}`}>
      <div className="row">
        <span className="badge-letter" aria-hidden="true">
          {which.toUpperCase()}
        </span>
        <h2 className="h-heading" id={`w${which}`}>
          {title}
        </h2>
      </div>
      <TextField
        label={t('workplace.name')}
        required
        value={workplace.name}
        onChange={(value) => set(`${base}.name`, value)}
      />
      <div className="f3">
        {ROADS.map((road) => (
          <PathNumber
            key={road}
            path={`${base}.commute.${road}`}
            warningPath={`${base}.commute`}
            label={t('workplace.way', {
              roadType: c(`roadTypes.${road}`),
            })}
            name={`${title}: ${t('workplace.way', {
              roadType: c(`roadTypes.${road}`),
            })}`}
            unit={c('units.km')}
            marked={false}
            rules={{ required: true, nullable: true, min: 0 }}
          />
        ))}
      </div>
      <p className="t-sm">
        <span className="t-label">
          {t('workplace.oneWay', { km: formatKm(oneWay) })}
        </span>{' '}
        <span className="muted">
          · {t('workplace.roundTrip', { km: formatKm(oneWay * 2) })}
        </span>
      </p>
      <WeekdayToggle
        label={t('workplace.weekdays')}
        value={workplace.weekdays}
        onChange={(days: Weekday[]) => set(`${base}.weekdays`, days)}
      />
      <PathNumber
        path={`${base}.freeDaysPerYear`}
        label={t('workplace.freeDays')}
        name={`${title}: ${t('workplace.freeDays')}`}
        unit={c('units.days')}
        hint={t('workplace.freeDaysHint')}
        withDefault
        rules={{ min: 0 }}
      />
      <Switch
        label={t('workplace.freeCharging')}
        checked={workplace.chargesFreeAtWork}
        onChange={(checked) => set(`${base}.chargesFreeAtWork`, checked)}
        onText={c('yesNo.yes')}
        offText={c('yesNo.no')}
      />
    </Card>
  );
}

function Extra({ scenario }: { scenario: Scenario }) {
  const { t } = useTranslation('fahrprofil');
  const { t: c } = useTranslation();
  const perMonth = sum(scenario.extraMileage.kmPerMonth);
  return (
    <Card className="stack" aria-labelledby="zs">
      <h2 className="group-title" id="zs">
        {t('extra.title')}
      </h2>
      <p className="t-sm muted">{t('extra.intro')}</p>
      {ROADS.map((road) => (
        <PathNumber
          key={road}
          path={`extraMileage.kmPerMonth.${road}`}
          label={c(`roadTypes.${road}`)}
          name={`${t('extra.title')}: ${c(`roadTypes.${road}`)}`}
          unit={c('units.kmPerMonth')}
          marked={false}
          rules={{ required: true, nullable: true, min: 0 }}
        />
      ))}
      <p className="t-sm">
        <span className="t-label">
          {t('extra.sumPerMonth', { km: formatKm(perMonth) })}
        </span>{' '}
        <span className="muted">
          · {t('extra.sumPerYear', { km: formatKm(perMonth * 12) })}
        </span>
      </p>
    </Card>
  );
}

/** Bestandsfahrzeug, Arbeitsstätten A und B, Zusatzstrecke (boards D1, M1, T1, T3). */
export function FahrprofilPage() {
  const { t } = useTranslation('fahrprofil');
  const { scenario } = useScenarioEditor();
  return (
    <>
      <AreaHead title={t('title')} intro={t('intro')} />
      {scenario && (
        <div className="cols2">
          <div className="stack-lg">
            <Vehicle scenario={scenario} />
            <Extra scenario={scenario} />
          </div>
          <div className="stack-lg">
            <Workplace scenario={scenario} which="a" />
            <Workplace scenario={scenario} which="b" />
          </div>
        </div>
      )}
    </>
  );
}
