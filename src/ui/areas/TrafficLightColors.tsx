import { useTranslation } from 'react-i18next';
import { settingsUpdated, useAppDispatch, useAppSelector } from '../../state';
import { Button, TrafficLight } from '../components';
import { contrastProblem } from '../shell/contrast';

const LIGHTS = ['green', 'yellow', 'red'] as const;
type Light = (typeof LIGHTS)[number];

/** Start values of the colour pickers: the colours of the light theme. */
const THEME_COLORS: Record<Light, string> = {
  green: '#14693a',
  yellow: '#7a4d00',
  red: '#a2242a',
};

/**
 * The three traffic light colours (spec "Darstellungsregeln"). A colour whose
 * text misses WCAG AA on its tint shows a warning; it never blocks saving.
 */
export function TrafficLightColors() {
  const { t } = useTranslation('parameter');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const colors = useAppSelector(
    (state) => state.scenario.settings.trafficLightColors,
  );
  const current = colors ?? THEME_COLORS;
  const symbols = { green: 'green', yellow: 'yellow', red: 'red' } as const;

  return (
    <div className="stack-sm" role="group" aria-labelledby="tlc">
      <span className="t-label" id="tlc">
        {t('lightColors')}
      </span>
      <div className="row-wrap">
        {LIGHTS.map((light) => (
          <TrafficLight key={light} level={symbols[light]}>
            {c(`light.${light}`)}
          </TrafficLight>
        ))}
      </div>
      <div className="row-wrap">
        {LIGHTS.map((light) => {
          const problem = colors ? contrastProblem(colors[light]) : null;
          return (
            <label key={light} className="t-sm row">
              {t('lightColor', { light: c(`light.${light}`) })}
              <input
                type="color"
                value={current[light]}
                aria-describedby={problem ? `tlc-${light}` : undefined}
                onChange={(event) =>
                  dispatch(
                    settingsUpdated({
                      trafficLightColors: {
                        ...current,
                        [light]: event.target.value,
                      },
                    }),
                  )
                }
              />
            </label>
          );
        })}
        <Button
          variant="quiet"
          disabled={colors === null}
          onClick={() =>
            dispatch(settingsUpdated({ trafficLightColors: null }))
          }
        >
          {c('actions.reset')}
        </Button>
      </div>
      {LIGHTS.map((light) => {
        const problem = colors ? contrastProblem(colors[light]) : null;
        if (!problem) return null;
        return (
          <p
            key={light}
            className="t-sm"
            id={`tlc-${light}`}
            style={{ color: 'var(--warn-fg)' }}
          >
            <span aria-hidden="true">▲ </span>
            {t('contrastWarning', {
              light: c(`light.${light}`),
              scheme: t(
                problem.schemes === 'both'
                  ? 'schemeBoth'
                  : problem.schemes === 'light'
                    ? 'schemeLight'
                    : 'schemeDark',
              ),
              ratio: problem.ratio.toFixed(1).replace('.', ','),
            })}
          </p>
        );
      })}
      <span className="t-sm muted">{t('lightColorsHint')}</span>
    </div>
  );
}
