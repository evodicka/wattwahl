import { useTranslation } from 'react-i18next';
import { settingsUpdated, useAppDispatch, useAppSelector } from '../../state';
import { Button, TrafficLight } from '../components';

const LIGHTS = ['green', 'yellow', 'red'] as const;
type Light = (typeof LIGHTS)[number];

/** Start values of the colour pickers: the colours of the light theme. */
const THEME_COLORS: Record<Light, string> = {
  green: '#14693a',
  yellow: '#7a4d00',
  red: '#a2242a',
};

/**
 * The three traffic light colours (spec "Darstellungsregeln"), chosen per
 * device.
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
          return (
            <label key={light} className="t-sm row">
              {t('lightColor', { light: c(`light.${light}`) })}
              <input
                type="color"
                value={current[light]}
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
      <span className="t-sm muted">{t('lightColorsHint')}</span>
    </div>
  );
}
