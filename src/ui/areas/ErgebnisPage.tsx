import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { PriceCase } from '../../domain';
import {
  priceCaseSet,
  selectActiveScenario,
  useAppDispatch,
  useAppSelector,
} from '../../state';
import { Button, EmptyState, SegmentedControl } from '../components';
import { resultRows } from '../forms/resultRows';
import { useIsDesktop } from '../layout/useIsDesktop';
import { StatusLine } from '../shell/StatusLine';
import { AreaHead } from './AreaHead';
import styles from './ErgebnisPage.module.css';
import { OfferCards } from './ergebnis/OfferCards';
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

  if (!scenario) return <AreaHead title={t('title')} />;

  const available = latest?.scenarioId === scenario.id ? latest : null;
  // The slider case only exists while the slider is changed (S21).
  const shown: PriceCase =
    priceCase === 'slider' && !sliderPrices ? 'mid' : priceCase;
  const rows = available ? resultRows(scenario, available.results, shown) : [];
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

  const selected = offerId
    ? rows.find((row) => row.offerId === offerId)
    : undefined;
  if (offerId && available && rows.length > 0 && !selected) {
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
      </>
    );
  }

  return (
    <>
      {head}
      {rows.length === 0 ? (
        <p className="t-sm muted" role="status">
          {t('computing')}
        </p>
      ) : (
        <section className="stack" aria-labelledby="offers">
          <h2 className="h-title" id="offers">
            {desktop ? t('table.title') : t('offersHeading')}
          </h2>
          {desktop ? (
            <ResultTable
              rows={rows}
              scenario={scenario}
              priceCaseName={
                options.find((o) => o.value === shown)?.label ?? ''
              }
              busy={busy}
            />
          ) : (
            <OfferCards rows={rows} scenario={scenario} />
          )}
        </section>
      )}
    </>
  );
}
