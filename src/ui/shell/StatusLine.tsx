import { useTranslation } from 'react-i18next';
import { formatDate, formatTime } from '../../i18n';
import {
  selectActiveScenario,
  useAppSelector,
  type RootState,
} from '../../state';
import { TrafficLight } from '../components';
import styles from './StatusLine.module.css';

/** The comparison period the shown results were computed with, if any. */
const resultMonths = (state: RootState): number | null => {
  for (const byCase of Object.values(state.result.latest?.results ?? {})) {
    for (const result of Object.values(byCase)) return result.comparisonMonths;
  }
  return null;
};

/**
 * Scenario, price case, comparison period and time of the calculation
 * (briefing §2, every result view). It describes the results on screen, not
 * the input: while a new input is computed it still names what the old
 * numbers belong to (8.5). Without a result it names the active scenario.
 */
export function StatusLine() {
  const { t } = useTranslation();
  const latest = useAppSelector((state) => state.result.latest);
  const status = useAppSelector((state) => state.result.status);
  const computedAt = useAppSelector((state) => state.result.computedAt);
  const priceCase = useAppSelector((state) => state.ui.priceCase);
  const active = useAppSelector(selectActiveScenario);
  const shown = useAppSelector((state) =>
    latest ? state.scenario.byId[latest.scenarioId] : null,
  );
  const months =
    useAppSelector(resultMonths) ?? active?.parameters.comparisonMonths ?? null;
  const name = (latest ? shown?.name : active?.name) ?? null;

  const updating =
    status === 'computing' ||
    status === 'stale' ||
    (latest !== null && latest.scenarioId !== active?.id);

  const parts = [
    name !== null ? t('status.scenario', { name }) : null,
    t('status.priceCase', { name: t(`priceCase.${priceCase}`) }),
    months !== null ? t('status.period', { count: months }) : null,
    computedAt !== null
      ? t(updating ? 'status.lastResult' : 'status.asOf', {
          date: formatDate(computedAt),
          time: formatTime(computedAt),
        })
      : null,
  ].filter((part) => part !== null);

  return (
    <p className={styles.status}>
      {updating && (
        <TrafficLight level="none" symbol="↻">
          {t('status.updating')}
        </TrafficLight>
      )}
      <span>{parts.join(t('separator'))}</span>
    </p>
  );
}
