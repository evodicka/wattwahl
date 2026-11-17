import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { PriceCase } from '../../domain';
import {
  priceCaseSet,
  requestCompute,
  selectActiveScenario,
  useAppDispatch,
  useAppSelector,
} from '../../state';
import {
  Button,
  EmptyState,
  Notice,
  SegmentedControl,
  Switch,
} from '../components';
import { useScenarioEditor } from '../forms/scenarioForm';
import { resultRows } from '../forms/resultRows';
import { ChartSuspense, CostBars } from '../charts/lazy';
import { useIsDesktop } from '../layout/useIsDesktop';
import { StatusLine } from '../shell/StatusLine';
import { AreaHead } from './AreaHead';
import styles from './ErgebnisPage.module.css';
import { OfferCards } from './ergebnis/OfferCards';
import { OfferDetail } from './ergebnis/OfferDetail';
import { PriceSlider } from './ergebnis/PriceSlider';
import { ResultTable } from './ergebnis/ResultTable';
import { useOfferLabel } from './ergebnis/parts';

// #/ergebnis: the comparison of all offers in the shown price case (S19). The
// detail view of one offer, #/ergebnis/:offerId, gets its content in S20 and
// S21; here it has its frame. Every result view names what it shows (the status line).
export function ErgebnisPage() {
  const { offerId } = useParams();
  const { t } = useTranslation('ergebnis');
  const { t: c } = useTranslation();
  const { t: k } = useTranslation('kandidaten');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const offerLabel = useOfferLabel();
  const scenario = useAppSelector(selectActiveScenario);
  const latest = useAppSelector((state) => state.result.latest);
  const status = useAppSelector((state) => state.result.status);
  const priceCase = useAppSelector((state) => state.ui.priceCase);
  const sliderPrices = useAppSelector((state) => state.ui.sliderPrices);
  const { set } = useScenarioEditor();

  if (!scenario) return <AreaHead title={t('title')} />;

  const available = latest?.scenarioId === scenario.id ? latest : null;
  // The slider case only exists while the slider is changed (S21).
  const shown: PriceCase =
    priceCase === 'slider' && !sliderPrices ? 'mid' : priceCase;
  const ownRows = available
    ? resultRows(scenario, available.results, shown)
    : [];
  // The results of a price just changed by the slider come a moment later: until
  // then the last table stays, dimmed, instead of a loading text.
  const rows =
    ownRows.length === 0 && shown === 'slider' && available
      ? resultRows(scenario, available.results, 'mid')
      : ownRows;
  const costRows = rows.flatMap((row) =>
    row.result.status === 'ok'
      ? [
          {
            id: row.offerId,
            label: t('table.offerTitle', {
              candidate: row.candidateName.trim(),
              offer: offerLabel(row),
            }),
            costs: row.result.costs,
            range: row.range,
          },
        ]
      : [],
  );
  const failed = status === 'error';
  const busy =
    status === 'computing' || status === 'stale' || available === null;

  const options: { value: PriceCase; label: string }[] = [
    { value: 'mid', label: c('priceCase.mid') },
    {
      value: 'evFavorable',
      label: c(
        desktop ? 'priceCase.evFavorable' : 'priceCase.evFavorableShort',
      ),
    },
    {
      value: 'evUnfavorable',
      label: c(
        desktop ? 'priceCase.evUnfavorable' : 'priceCase.evUnfavorableShort',
      ),
    },
    ...(sliderPrices
      ? [{ value: 'slider' as const, label: c('priceCase.slider') }]
      : []),
  ];

  // The switch is there while a lease tier exists, or while the lease offers
  // are hidden, so they always come back.
  const leaseTiers = scenario.candidates.reduce(
    (n, candidate) => n + candidate.leaseTiers.length,
    0,
  );
  // Not in a detail view: hiding the leases would take the open offer away.
  const showLeaseSwitch =
    !offerId && (leaseTiers > 0 || !scenario.includeLeaseOffers);

  const priceCaseName = options.find((o) => o.value === shown)?.label ?? '';

  // Only a computed offer has a detail view. Wait for a finished run before
  // deciding that an id does not exist: a new offer may still be coming.
  const selected = offerId
    ? rows.find((row) => row.offerId === offerId && row.total !== null)
    : undefined;
  if (offerId && available && status === 'idle' && !selected) {
    return <Navigate to="/ergebnis" replace />;
  }

  const head = (
    <div className={styles.head}>
      <div className={styles.headText}>
        <AreaHead title={t('title')} />
        <StatusLine />
      </div>
      <div className={styles.control}>
        <SegmentedControl
          label={c('priceCase.label')}
          value={shown}
          options={options}
          onChange={(value) => dispatch(priceCaseSet(value))}
          full={!desktop}
        />
        {showLeaseSwitch && (
          <Switch
            label={t('leaseSwitch.label')}
            hint={t('leaseSwitch.hint')}
            checked={scenario.includeLeaseOffers}
            onChange={(value) => set('includeLeaseOffers', value)}
            onText={c('yesNo.on')}
            offText={c('yesNo.off')}
          />
        )}
      </div>
    </div>
  );

  if (scenario.candidates.length === 0) {
    return (
      <>
        {head}
        <EmptyState
          title={t('empty.title')}
          actions={
            <>
              <Button onClick={() => void navigate('/fahrprofil')}>
                {t('empty.profile')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void navigate('/kandidaten')}
              >
                {k('empty.action')}
              </Button>
            </>
          }
        >
          {t('empty.body')}
        </EmptyState>
      </>
    );
  }

  if (offerId) {
    return (
      <>
        {head}
        <div className="stack-sm">
          <Link className="link" to="/ergebnis">
            {c('frame.back', { area: t('detail.backToResult') })}
          </Link>
          {selected && (
            <h2 className="h-title">
              {t('table.offerTitle', {
                candidate: selected.candidateName.trim(),
                offer: offerLabel(selected),
              })}
            </h2>
          )}
        </div>
        {selected && selected.result.status === 'ok' && (
          <OfferDetail
            row={{ ...selected, result: selected.result }}
            rows={rows}
            scenario={scenario}
            priceCaseName={priceCaseName}
            priceCase={shown}
          />
        )}
      </>
    );
  }

  return (
    <>
      {head}
      {rows.length === 0 ? (
        failed ? (
          <Notice
            tone="error"
            title={t('failedTitle')}
            actions={
              <Button onClick={() => void dispatch(requestCompute())}>
                {c('actions.retry')}
              </Button>
            }
          >
            {t('failedBody')}
          </Notice>
        ) : (
          <p className="t-sm muted" role="status">
            {t('computing')}
          </p>
        )
      ) : (
        <section className="stack" aria-labelledby="offers">
          <h2 className="h-title" id="offers">
            {desktop ? t('table.title') : t('offersHeading')}
          </h2>
          {failed && (
            <Notice tone="warn" title={t('outdatedTitle')}>
              {t('outdatedBody')}
            </Notice>
          )}
          {desktop ? (
            <ResultTable
              rows={rows}
              scenario={scenario}
              priceCaseName={priceCaseName}
              busy={busy}
            />
          ) : (
            <OfferCards rows={rows} scenario={scenario} />
          )}
          {!scenario.includeLeaseOffers && leaseTiers > 0 && (
            <p className="t-sm muted">
              {t('leaseHidden', { count: leaseTiers })}
            </p>
          )}
        </section>
      )}
      {rows.some((row) => row.total !== null) && (
        <section className="stack" aria-labelledby="costs">
          <h2 className="h-title" id="costs">
            {t('costs.title')}
          </h2>
          <p className="t-cap muted">
            {t('costs.subtitle', {
              months: scenario.parameters.comparisonMonths,
            })}
          </p>
          <ChartSuspense>
            <CostBars rows={costRows} />
          </ChartSuspense>
        </section>
      )}
      <PriceSlider scenario={scenario} />
    </>
  );
}
