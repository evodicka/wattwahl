import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormulaId, OkOfferResult, PriceCase } from '../../../domain';
import {
  DEBOUNCE_MS,
  closeTrace,
  openTrace,
  selectActiveScenario,
  useAppDispatch,
  useAppSelector,
} from '../../../state';
import { Button, FieldMarkers, Notice } from '../../components';
import { formatTraceInput, formatTraceValue } from '../../forms/traceFormat';
import {
  traceView,
  type TraceFamily,
  type TraceRow,
} from '../../forms/traceView';
import styles from './TraceSection.module.css';

/** The key of a formula in the language file: "F3.u" is "F3_u" (a dot would be a nested key). */
type FormulaKey<I extends string> = I extends `${infer A}.${infer B}`
  ? `${A}_${B}`
  : I;
const keyOf = <I extends FormulaId>(id: I): FormulaKey<I> =>
  id.replace('.', '_') as FormulaKey<I>;

const PAGE = 25;

type Props = {
  offerId: string;
  priceCase: PriceCase;
};

function Step({ row }: { row: TraceRow }) {
  const { t } = useTranslation('ergebnis');
  const { entry } = row;
  const key = keyOf(entry.formula);
  const inputs = Object.entries(entry.inputs)
    .map(([name, value]) => `${name} = ${formatTraceInput(value)}`)
    .join(', ');
  return (
    <li
      className={styles.step}
      data-formula={entry.formula}
      data-result-path={entry.resultPath}
    >
      <span>
        {t(`detail.trace.formula.${key}`)}{' '}
        <span className={styles.id}>
          {t('detail.trace.formulaId', { id: entry.formula })}
        </span>
        <FieldMarkers marks={{ assumption: row.assumption }} />
      </span>
      <span className={styles.value}>{formatTraceValue(entry)}</span>
      <span className={styles.formula}>
        {t(`detail.trace.formulaText.${key}`)}
      </span>
      <span className={styles.inputs}>
        {t('detail.trace.inputs')}: {inputs}
      </span>
    </li>
  );
}

function Group({ family, rows }: { family: TraceFamily; rows: TraceRow[] }) {
  const { t } = useTranslation('ergebnis');
  const [shown, setShown] = useState(PAGE);
  return (
    <details className={styles.group}>
      <summary>
        {t(`detail.trace.family.${family}`)}
        <span className={styles.count}>
          {t('detail.trace.stepCount', { count: rows.length })}
        </span>
      </summary>
      <ul className={styles.list}>
        {rows.slice(0, shown).map((row) => (
          <Step key={row.index} row={row} />
        ))}
      </ul>
      {rows.length > shown && (
        <Button
          className={styles.more}
          variant="quiet"
          onClick={() => setShown((n) => n + PAGE)}
        >
          {t('detail.trace.showMore', { count: rows.length - shown })}
        </Button>
      )}
    </details>
  );
}

/**
 * The Rechenweg of one offer (spec "Rechenweg", Q6): opened, the worker
 * computes it again with a trace, for this offer and price case only. First
 * the steps behind the numbers of the result, then every step by formula
 * family. The trace is dropped when the section closes or the view goes.
 */
export function TraceSection({ offerId, priceCase }: Props) {
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const trace = useAppSelector((state) => state.result.trace);
  // The Rechenweg is computed again when what it was computed from changes
  // while it is open: the slider's prices and the active scenario.
  const slider = useAppSelector((state) => state.ui.sliderPrices);
  const scenario = useAppSelector(selectActiveScenario);

  // Opening, another price case and a retry compute at once. A change of the
  // slider or of an input while it is open waits for a quiet moment, like every
  // other recomputation, so that dragging does not queue a step per pixel.
  const last = useRef<{ slider: unknown; scenario: unknown } | null>(null);
  useEffect(() => {
    if (!open) {
      last.current = null;
      return;
    }
    const inputsChanged =
      last.current !== null &&
      (last.current.slider !== slider || last.current.scenario !== scenario);
    last.current = { slider, scenario };
    const start = () => void dispatch(openTrace(offerId, priceCase));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (inputsChanged) timer = setTimeout(start, DEBOUNCE_MS);
    else start();
    return () => {
      clearTimeout(timer);
      dispatch(closeTrace());
    };
  }, [open, offerId, priceCase, attempt, slider, scenario, dispatch]);

  const current =
    trace && trace.offerId === offerId && trace.priceCase === priceCase
      ? trace
      : null;
  const result: OkOfferResult | null =
    current?.result?.status === 'ok' ? current.result : null;
  const view = useMemo(
    () => (result && current ? traceView(current.entries, result) : null),
    [result, current],
  );
  // An answer without a computed result: the offer cannot be computed now.
  const noResult = open && current?.result != null && result === null;

  return (
    <details
      className={styles.trace}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t('detail.trace.show')}</summary>
      <div className={styles.body}>
        {open && current?.error ? (
          <Notice
            tone="error"
            title={t('detail.trace.failedTitle')}
            actions={
              <Button onClick={() => setAttempt((n) => n + 1)}>
                {c('actions.retry')}
              </Button>
            }
          >
            {t('detail.trace.failedBody')}
          </Notice>
        ) : noResult ? (
          <Notice tone="warn" title={t('detail.trace.noResultTitle')}>
            {t('detail.trace.noResultBody')}
          </Notice>
        ) : open && !view ? (
          <p className="t-sm muted" role="status">
            {t('detail.trace.loading')}
          </p>
        ) : (
          view && (
            <>
              <section className="stack-sm">
                <h4 className="t-label">{t('detail.trace.numbers')}</h4>
                <p className="t-sm muted">{t('detail.trace.numbersHint')}</p>
                <ul className={styles.list}>
                  {view.numbers.map((row) => (
                    <Step key={row.index} row={row} />
                  ))}
                </ul>
              </section>
              <section className="stack-sm">
                <h4 className="t-label">{t('detail.trace.steps')}</h4>
                {view.groups.map((group) => (
                  <Group key={group.family} {...group} />
                ))}
              </section>
            </>
          )
        )}
      </div>
    </details>
  );
}
