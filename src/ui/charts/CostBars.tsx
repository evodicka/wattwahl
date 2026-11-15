import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { Bar, Line } from '@visx/shape';
import { useTranslation } from 'react-i18next';
import { formatEuro } from '../../i18n';
import { DataTable } from '../components';
import styles from './CostBars.module.css';
import { useElementWidth } from './useElementWidth';

export type CostBarRow = {
  id: string;
  label: string;
  costs: {
    acquisition: number;
    electricity: number;
    petrol: number;
    maintenance: number;
    total: number;
  };
  /** Total from "E-Auto günstig" to "E-Auto ungünstig". */
  range: { min: number; max: number } | null;
};

const SEGMENTS = [
  ['acquisition', 'var(--chart-acquisition)'],
  ['electricity', 'var(--chart-electricity)'],
  ['petrol', 'var(--chart-petrol)'],
  ['maintenance', 'var(--chart-maintenance)'],
] as const;

const BAR_HEIGHT = 28;

/**
 * Stacked bars of the fleet cost per offer, in the order given, with a stroke
 * for the span of the price cases (spec "Kostenvergleich"). The same values
 * are in a table below, for screen readers and for reading off numbers.
 */
export default function CostBars({ rows }: { rows: CostBarRow[] }) {
  const { t } = useTranslation('ergebnis');
  const [trackRef, width] = useElementWidth<HTMLDivElement>();
  const largest = Math.max(
    0,
    ...rows.flatMap((row) => [row.costs.total, row.range?.max ?? 0]),
  );
  const scale = scaleLinear<number>({
    domain: [0, largest],
    range: [0, width],
    nice: true,
  });

  return (
    <div className={styles.chart}>
      <div className={styles.legend}>
        {SEGMENTS.map(([key, color]) => (
          <span key={key}>
            <b className={styles.swatch} style={{ background: color }} />
            {t(`costs.${key}`)}
          </span>
        ))}
        <span>
          <svg width="26" height="14" aria-hidden="true">
            <path
              d="M2 2v10M24 2v10M2 7h22"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </svg>
          {t('costs.range')}
        </span>
      </div>

      <div
        role="img"
        aria-label={t('costs.chartLabel')}
        className={styles.bars}
      >
        {rows.map((row, index) => {
          let x = 0;
          return (
            <div className={styles.line} key={row.id}>
              <span className={styles.label}>{row.label}</span>
              <div
                className={styles.track}
                ref={index === 0 ? trackRef : undefined}
              >
                <svg width={width} height={BAR_HEIGHT} aria-hidden="true">
                  <Group>
                    {SEGMENTS.map(([key, color]) => {
                      const segment = scale(row.costs[key]) - scale(0);
                      const bar = (
                        <Bar
                          key={key}
                          x={x}
                          y={0}
                          width={Math.max(0, segment)}
                          height={BAR_HEIGHT}
                          style={{
                            fill: color,
                            stroke: 'var(--surface-raised)',
                            strokeWidth: 2,
                          }}
                        />
                      );
                      x += segment;
                      return bar;
                    })}
                    {row.range && (
                      <>
                        <Line
                          from={{ x: scale(row.range.min), y: BAR_HEIGHT / 2 }}
                          to={{ x: scale(row.range.max), y: BAR_HEIGHT / 2 }}
                          style={{ stroke: 'var(--ink)', strokeWidth: 2 }}
                        />
                        {[row.range.min, row.range.max].map((end) => (
                          <Line
                            key={end}
                            from={{ x: scale(end), y: BAR_HEIGHT / 2 - 7 }}
                            to={{ x: scale(end), y: BAR_HEIGHT / 2 + 7 }}
                            style={{ stroke: 'var(--ink)', strokeWidth: 2 }}
                          />
                        ))}
                      </>
                    )}
                  </Group>
                </svg>
              </div>
              <span className={styles.value}>
                {formatEuro(row.costs.total)}
              </span>
            </div>
          );
        })}
        <div className={`${styles.line} ${styles.axis}`} aria-hidden="true">
          <svg width={width} height={24}>
            <AxisBottom
              scale={scale}
              numTicks={width < 400 ? 3 : 5}
              hideAxisLine
              hideTicks
              tickFormat={(value) =>
                Number(value) === 0 ? '0' : formatEuro(Number(value))
              }
              tickLabelProps={(_value, index) => ({
                fill: 'var(--ink-muted)',
                fontSize: 12,
                // The first label would be cut off at the left edge.
                textAnchor: index === 0 ? 'start' : 'middle',
                dy: '0.25em',
              })}
            />
          </svg>
        </div>
      </div>

      <details className={styles.alt}>
        <summary>{t('costs.asTable')}</summary>
        <DataTable caption={t('costs.title')}>
          <thead>
            <tr>
              <th scope="col">{t('table.offer')}</th>
              {SEGMENTS.map(([key]) => (
                <th scope="col" className="num" key={key}>
                  {t(`costs.${key}`)}
                </th>
              ))}
              <th scope="col" className="num">
                {t('costs.totalColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                {SEGMENTS.map(([key]) => (
                  <td className="num" key={key}>
                    {formatEuro(row.costs[key])}
                  </td>
                ))}
                <td className="num">
                  <b>{formatEuro(row.costs.total)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </details>
      <p className={`t-sm ${styles.note}`}>{t('costs.excluded')}</p>
    </div>
  );
}
