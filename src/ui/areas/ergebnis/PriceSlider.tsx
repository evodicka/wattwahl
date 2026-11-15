import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scenario, SliderPrices } from '../../../domain';
import { formatDecimal } from '../../../i18n';
import {
  resetSlider,
  saveSliderAsScenario,
  setSliderPrice,
  sliderStart,
  useAppDispatch,
  useAppSelector,
} from '../../../state';
import { Button, Card, Notice } from '../../components';
import { sliderRanges, type SliderRange } from '../../forms/sliderRanges';
import styles from './PriceSlider.module.css';

type Field = keyof SliderPrices;

type SliderProps = {
  field: Field;
  label: string;
  unit: string;
  decimals: number;
  value: number;
  range: SliderRange;
  onChange: (field: Field, value: number) => void;
};

function Slider({
  field,
  label,
  unit,
  decimals,
  value,
  range,
  onChange,
}: SliderProps) {
  const { t } = useTranslation('ergebnis');
  const id = useId();
  const text = (n: number) =>
    `${formatDecimal(n, decimals)}${unit ? ` ${unit}` : ''}`;
  return (
    <div className={styles.slider}>
      <div className="spread">
        <label className="t-label" htmlFor={id}>
          {label}
        </label>
        <span className={styles.value}>{text(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-valuetext={text(value)}
        onChange={(event) => onChange(field, Number(event.target.value))}
      />
      <div className={styles.ends} aria-hidden="true">
        <span>{formatDecimal(range.min, decimals)}</span>
        <span>
          {t('slider.mid', { value: formatDecimal(range.mid, decimals) })}
        </span>
        <span>{formatDecimal(range.max, decimals)}</span>
      </div>
    </div>
  );
}

/**
 * The price slider (spec "Preis-Regler", boards D5, M8, T2, T4): petrol and
 * electricity price and both escalations. A change computes again at once for
 * the price case "Regler" and is kept only in the UI state until it is saved
 * as a scenario.
 */
export function PriceSlider({ scenario }: { scenario: Scenario }) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const headingId = useId();
  const slider = useAppSelector((state) => state.ui.sliderPrices);
  const start = sliderStart(scenario);
  const values = slider ?? start;
  const ranges = values ? sliderRanges(scenario, values) : null;

  const change = (field: Field, value: number) =>
    dispatch(setSliderPrice({ [field]: value }));

  return (
    <Card className="stack" aria-labelledby={headingId}>
      <h2 className="h-title" id={headingId}>
        {t('slider.title')}
      </h2>
      <p className="t-sm muted">{t('slider.intro')}</p>
      {values && ranges ? (
        <>
          <div className={styles.grid}>
            <Slider
              field="petrol"
              label={t('slider.petrol')}
              unit={t('slider.unit.petrol')}
              decimals={2}
              value={values.petrol}
              range={ranges.petrol}
              onChange={change}
            />
            <Slider
              field="electricity"
              label={t('slider.electricity')}
              unit={t('slider.unit.electricity')}
              decimals={2}
              value={values.electricity}
              range={ranges.electricity}
              onChange={change}
            />
            <Slider
              field="petrolEscalationPct"
              label={t('slider.petrolEscalation')}
              unit={c('units.percentPerYear')}
              decimals={1}
              value={values.petrolEscalationPct}
              range={ranges.petrolEscalationPct}
              onChange={change}
            />
            <Slider
              field="electricityEscalationPct"
              label={t('slider.electricityEscalation')}
              unit={c('units.percentPerYear')}
              decimals={1}
              value={values.electricityEscalationPct}
              range={ranges.electricityEscalationPct}
              onChange={change}
            />
          </div>
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={slider === null}
              onClick={() =>
                void dispatch(
                  saveSliderAsScenario(
                    t('slider.scenarioName', { name: scenario.name }),
                  ),
                )
              }
            >
              {t('slider.saveAsScenario')}
            </Button>
            <Button
              disabled={slider === null}
              onClick={() => dispatch(resetSlider())}
            >
              {t('slider.reset')}
            </Button>
            <span
              className={slider ? `t-sm ${styles.changed}` : 't-sm muted'}
              role="status"
            >
              {slider ? t('slider.changedUnsaved') : t('slider.unchanged')}
            </span>
          </div>
        </>
      ) : (
        <Notice tone="info" title={t('slider.title')}>
          {t('slider.missing')}
        </Notice>
      )}
    </Card>
  );
}
