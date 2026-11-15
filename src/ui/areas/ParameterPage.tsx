import { useTranslation } from 'react-i18next';
import { DEFAULT_DEVICE_SETTINGS } from '../../domain';
import { settingsUpdated, useAppDispatch, useAppSelector } from '../../state';
import {
  Card,
  FieldMarkers,
  MonthYearField,
  NumberField,
  Notice,
  SelectField,
  Switch,
} from '../components';
import { getAt } from '../forms/paths';
import { PathNumber, useWarning } from '../forms/PathFields';
import {
  parameterMarks,
  resetWarrantyReferenceMonth,
  setWarrantyReferenceMonth,
  useScenarioEditor,
} from '../forms/scenarioForm';
import { TrafficLightColors } from './TrafficLightColors';
import { AreaHead } from './AreaHead';

const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const PERCENT = { min: 0, max: 100 } as const;

export function ParameterPage() {
  const { t } = useTranslation('parameter');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const { scenario, set } = useScenarioEditor();
  const settings = useAppSelector((state) => state.scenario.settings);
  const cutoffWarning = useWarning('parameters.warrantyReferenceMonth');
  if (!scenario) return <AreaHead title={t('title')} intro={t('intro')} />;
  const { parameters } = scenario;

  const pct = c('units.percent');
  const bothOrderError = (lower: number, upper: number, text: string) =>
    lower >= upper ? text : null;

  const missing = [
    ['parameters.electricityPrice.min', t('electricityMin')],
    ['parameters.electricityPrice.mid', t('electricityMid')],
    ['parameters.electricityPrice.max', t('electricityMax')],
    ['parameters.evMaintenancePerKm', t('evMaintenance')],
  ].filter(([path]) => getAt(scenario, path ?? '') === null);

  const electricity = parameters.electricityPrice;
  const orderError = (field: 'mid' | 'max') =>
    field === 'mid'
      ? electricity.min !== null &&
        electricity.mid !== null &&
        electricity.min > electricity.mid
        ? c('validation.minMidMax')
        : null
      : electricity.mid !== null &&
          electricity.max !== null &&
          electricity.mid > electricity.max
        ? c('validation.minMidMax')
        : null;

  return (
    <>
      <AreaHead title={t('title')} intro={t('intro')} />
      {missing.length > 0 && (
        <Notice tone="warn" title={t('missingTitle')}>
          {t('missingBody', {
            fields: missing.map(([, label]) => label).join(', '),
          })}
        </Notice>
      )}
      <div className="cols2" key={scenario.id}>
        <div className="stack-lg">
          <Card className="stack" aria-labelledby="s1">
            <h2 className="group-title" id="s1">
              {t('groups.comparison')}
            </h2>
            <div className="f2">
              <PathNumber
                path="parameters.comparisonMonths"
                label={t('comparisonMonths')}
                name={t('comparisonMonths')}
                unit={c('units.months')}
                hint={t('comparisonMonthsHint')}
                withDefault
                rules={{ min: 1, max: 1200, integer: true }}
              />
              <PathNumber
                path="parameters.workWeeksPerYear"
                label={t('workWeeks')}
                name={t('workWeeks')}
                unit={c('units.weeks')}
                withDefault
                rules={{ min: 0, minExclusive: true, max: 53 }}
              />
              <PathNumber
                path="parameters.chargeLowerPct"
                label={t('chargeLower')}
                name={t('chargeLower')}
                unit={pct}
                withDefault
                rules={PERCENT}
                error={bothOrderError(
                  parameters.chargeLowerPct,
                  parameters.chargeUpperPct,
                  c('validation.chargeOrder'),
                )}
              />
              <PathNumber
                path="parameters.chargeUpperPct"
                label={t('chargeUpper')}
                name={t('chargeUpper')}
                unit={pct}
                hint={t('chargeUpperHint')}
                withDefault
                rules={PERCENT}
              />
              <PathNumber
                path="parameters.safetyBufferPct"
                label={t('safetyBuffer')}
                name={t('safetyBuffer')}
                unit={pct}
                withDefault
                rules={PERCENT}
              />
              <PathNumber
                path="parameters.chargingEfficiencyPct"
                label={t('chargingEfficiency')}
                name={t('chargingEfficiency')}
                unit={pct}
                withDefault
                rules={{ min: 0, minExclusive: true, max: 100 }}
              />
            </div>
          </Card>

          <Card className="stack" aria-labelledby="s2">
            <h2 className="group-title" id="s2">
              {t('groups.battery')}
            </h2>
            <div className="f2">
              <PathNumber
                path="parameters.sohMinPct"
                label={t('sohMin')}
                name={t('sohMin')}
                unit={pct}
                withDefault
                rules={PERCENT}
              />
              <PathNumber
                path="parameters.kmToSohMin"
                label={t('kmToSohMin')}
                name={t('kmToSohMin')}
                unit={c('units.km')}
                withDefault
                rules={{ min: 0, minExclusive: true }}
              />
            </div>
            <SelectField
              label={t('sohReference')}
              value={parameters.sohReference}
              options={[
                { value: 'end', label: t('sohReferenceEnd') },
                { value: 'start', label: t('sohReferenceStart') },
              ]}
              onChange={(value) => set('parameters.sohReference', value)}
            />
          </Card>

          <Card className="stack" aria-labelledby="s2g">
            <h2 className="group-title" id="s2g">
              {t('groups.warranty')}
            </h2>
            <MonthYearField
              label={t('warrantyCutoff')}
              name={t('warrantyCutoff')}
              value={parameters.warrantyReferenceMonth}
              marks={parameterMarks(
                scenario,
                'parameters.warrantyReferenceMonth',
              )}
              hint={t('warrantyCutoffHint')}
              warning={cutoffWarning}
              onCommit={(month) =>
                month && dispatch(setWarrantyReferenceMonth(month))
              }
              onReset={
                parameters.warrantyReferenceMonthSetByUser
                  ? () => dispatch(resetWarrantyReferenceMonth())
                  : null
              }
            />
          </Card>

          <Card className="stack" aria-labelledby="s3">
            <h2 className="group-title" id="s3">
              {t('groups.temperature')}
            </h2>
            <div className="f2">
              <PathNumber
                path="parameters.tempColdC"
                label={t('tempCold')}
                name={t('tempCold')}
                unit={c('units.celsius')}
                withDefault
                rules={{}}
                error={
                  parameters.tempColdC >= parameters.tempMildC
                    ? c('validation.tempOrder')
                    : null
                }
              />
              <PathNumber
                path="parameters.tempMildC"
                label={t('tempMild')}
                name={t('tempMild')}
                unit={c('units.celsius')}
                withDefault
                rules={{}}
              />
              <PathNumber
                path="parameters.coldReserveK"
                label={t('coldReserve')}
                name={t('coldReserve')}
                unit={c('units.kelvin')}
                withDefault
                rules={{ min: 0 }}
              />
              <PathNumber
                path="parameters.highwayDiscountPct"
                label={t('highwayDiscount')}
                name={t('highwayDiscount')}
                unit={pct}
                withDefault
                rules={PERCENT}
              />
            </div>
            <div className="stack-sm" role="group" aria-labelledby="mt">
              <span className="t-label" id="mt">
                {t('monthlyTemps')}
                <FieldMarkers marks={{ assumption: true }} />
              </span>
              <span className="t-sm muted">{t('monthlyTempsHint')}</span>
              <div className="monthly-temps">
                {MONTHS.map((month) => (
                  <PathNumber
                    key={month}
                    path={`parameters.monthlyTempC.${month}`}
                    label={c(
                      `monthsShort.${(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const)[month] ?? 'jan'}`,
                    )}
                    name={`${t('monthlyTemps')} ${month + 1}`}
                    unit={c('units.celsius')}
                    marked={false}
                    rules={{}}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="stack-lg">
          <Card className="stack" aria-labelledby="s4">
            <h2 className="group-title" id="s4">
              {t('groups.prices')}
            </h2>
            <div className="f3-prices">
              <PathNumber
                path="parameters.electricityPrice.min"
                label={t('electricityMin')}
                name={t('electricityMin')}
                unit={c('units.euroPerKwh')}
                decimals={2}
                rules={{ min: 0 }}
              />
              <PathNumber
                path="parameters.electricityPrice.mid"
                label={t('electricityMid')}
                name={c('field.inGroup', {
                  group: t('electricityMin'),
                  field: t('electricityMid'),
                })}
                unit={c('units.euroPerKwh')}
                decimals={2}
                rules={{ min: 0 }}
                error={orderError('mid')}
              />
              <PathNumber
                path="parameters.electricityPrice.max"
                label={t('electricityMax')}
                name={c('field.inGroup', {
                  group: t('electricityMin'),
                  field: t('electricityMax'),
                })}
                unit={c('units.euroPerKwh')}
                decimals={2}
                rules={{ min: 0 }}
                error={orderError('max')}
              />
            </div>
            <span className="t-sm muted">{t('electricityHint')}</span>
            <div className="f2">
              <PathNumber
                path="parameters.electricityEscalationPct"
                label={t('electricityEscalation')}
                name={t('electricityEscalation')}
                unit={c('units.percentPerYear')}
                withDefault
                rules={{ min: -100 }}
              />
              <PathNumber
                path="iceVehicle.petrolEscalationPct"
                label={t('petrolEscalation')}
                name={t('petrolEscalation')}
                unit={c('units.percentPerYear')}
                hint={t('petrolEscalationHint')}
                withDefault
                rules={{ min: -100 }}
              />
              <PathNumber
                path="parameters.evMaintenancePerKm"
                label={t('evMaintenance')}
                name={t('evMaintenance')}
                unit={c('units.euroPerKm')}
                decimals={2}
                rules={{ min: 0 }}
              />
              <PathNumber
                path="parameters.depreciationPctPerYear"
                label={t('depreciation')}
                name={t('depreciation')}
                unit={c('units.percentPerYear')}
                hint={t('perCandidateHint')}
                withDefault
                rules={PERCENT}
              />
            </div>
          </Card>

          <Card className="stack" aria-labelledby="s5">
            <h2 className="group-title" id="s5">
              {t('groups.workdays')}
            </h2>
            <SelectField
              label={t('extraMode')}
              value={parameters.extraMileageMode}
              options={[
                { value: 'optimized', label: t('extraModeFree') },
                { value: 'fixed', label: t('extraModeFixed') },
              ]}
              onChange={(value) => set('parameters.extraMileageMode', value)}
            />
            {parameters.extraMileageMode === 'fixed' && (
              <PathNumber
                path="parameters.extraMileageFixedEvSharePct"
                label={t('extraFixedShare')}
                name={t('extraFixedShare')}
                unit={pct}
                marked={false}
                rules={{ required: true, nullable: true, ...PERCENT }}
              />
            )}
            <PathNumber
              path="parameters.extraMileageStepPct"
              label={t('extraStep')}
              name={t('extraStep')}
              unit={pct}
              withDefault
              rules={{ min: 0, minExclusive: true, max: 100 }}
            />
          </Card>

          <Card className="stack" aria-labelledby="s6">
            <h2 className="group-title" id="s6">
              {t('groups.optimizer')}
            </h2>
            <Switch
              label={t('strictMode')}
              hint={t('strictModeHint')}
              checked={parameters.strictMode}
              onChange={(v) => set('parameters.strictMode', v)}
              onText={c('yesNo.on')}
              offText={c('yesNo.off')}
            />
            <Switch
              label={t('budgetAsTarget')}
              hint={t('budgetAsTargetHint')}
              checked={parameters.warrantyBudgetAsTarget}
              onChange={(v) => set('parameters.warrantyBudgetAsTarget', v)}
              onText={c('yesNo.on')}
              offText={c('yesNo.off')}
            />
            <PathNumber
              path="parameters.kmGridPerYear"
              label={t('kmGrid')}
              name={t('kmGrid')}
              unit={c('units.kmPerYear')}
              withDefault
              rules={{ min: 0, minExclusive: true }}
            />
          </Card>

          <Card className="stack" aria-labelledby="s7">
            <h2 className="group-title" id="s7">
              {t('groups.display')}
            </h2>
            <PathNumber
              path="parameters.trafficLightGreenFromPct"
              label={t('greenFrom')}
              name={t('greenFrom')}
              unit={pct}
              hint={t('greenFromHint')}
              withDefault
              rules={PERCENT}
            />
            <TrafficLightColors />
            <NumberField
              label={t('exportReminder')}
              name={t('exportReminder')}
              unit={c('units.days')}
              value={settings.exportReminderDays}
              rules={{ required: true, nullable: false, min: 1, integer: true }}
              marks={{
                changed:
                  settings.exportReminderDays !==
                  DEFAULT_DEVICE_SETTINGS.exportReminderDays,
              }}
              hint={t('exportReminderHint')}
              onCommit={(value) =>
                value !== null &&
                dispatch(settingsUpdated({ exportReminderDays: value }))
              }
              onReset={
                settings.exportReminderDays !==
                DEFAULT_DEVICE_SETTINGS.exportReminderDays
                  ? () =>
                      dispatch(
                        settingsUpdated({
                          exportReminderDays:
                            DEFAULT_DEVICE_SETTINGS.exportReminderDays,
                        }),
                      )
                  : null
              }
            />
          </Card>
        </div>
      </div>
    </>
  );
}
