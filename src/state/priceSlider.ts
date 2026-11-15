import type { Candidate, Scenario, SliderPrices } from '../domain';
import { uniqueName } from './names';
import { activeScenarioSet, scenarioAdded } from './scenarioSlice';
import { selectActiveScenario, selectScenarios } from './selectors';
import type { AppThunk } from './types';
import { priceCaseSet, sliderPricesSet } from './uiSlice';

// The price slider (spec "Preis-Regler", 8.5): four prices the user tries out.
// They live in the UI state, never in a scenario, until "Als Szenario speichern".

/**
 * The slider's start values: the mid prices and the escalations of the
 * scenario. `null` while a price is missing: nothing to slide from.
 */
export function sliderStart(scenario: Scenario): SliderPrices | null {
  const petrol = scenario.iceVehicle.petrolPrice.mid;
  const electricity = scenario.parameters.electricityPrice.mid;
  if (petrol === null || electricity === null) return null;
  return {
    petrol,
    electricity,
    petrolEscalationPct: scenario.iceVehicle.petrolEscalationPct,
    electricityEscalationPct: scenario.parameters.electricityEscalationPct,
  };
}

/**
 * Moves a price range so that its mid is `value` and the range keeps its width:
 * minimum and maximum shift by the same amount. The minimum stops at 0, and the
 * maximum never lies below the mid.
 */
export function shiftedRange(
  range: { min: number | null; mid: number | null; max: number | null },
  value: number,
): { min: number; mid: number; max: number } {
  const delta = range.mid === null ? 0 : value - range.mid;
  // A bound that is not set follows the mid; shifted values lose float noise.
  const round = (n: number) => Number(n.toFixed(6));
  return {
    min:
      range.min === null
        ? value
        : Math.max(0, Math.min(value, round(range.min + delta))),
    mid: value,
    max: range.max === null ? value : Math.max(value, round(range.max + delta)),
  };
}

/**
 * The scenario that holds the slider's prices (spec "Preis-Regler"): petrol and
 * electricity ranges shifted to the slider's mids, escalations copied. The
 * Stichtag and every other value are copied unchanged. The copy gets new ids
 * for itself, its candidates and their lease tiers.
 */
export function scenarioFromSlider(
  scenario: Scenario,
  slider: SliderPrices,
  made: { name: string; newId: () => string },
): Scenario {
  const candidates = scenario.candidates.map((candidate): Candidate => ({
    ...candidate,
    id: made.newId(),
    leaseTiers: candidate.leaseTiers.map((tier) => ({
      ...tier,
      id: made.newId(),
    })),
  }));
  return {
    ...scenario,
    id: made.newId(),
    name: made.name,
    iceVehicle: {
      ...scenario.iceVehicle,
      petrolPrice: shiftedRange(scenario.iceVehicle.petrolPrice, slider.petrol),
      petrolEscalationPct: slider.petrolEscalationPct,
    },
    parameters: {
      ...scenario.parameters,
      electricityPrice: shiftedRange(
        scenario.parameters.electricityPrice,
        slider.electricity,
      ),
      electricityEscalationPct: slider.electricityEscalationPct,
    },
    candidates,
  };
}

const FIELDS = [
  'petrol',
  'electricity',
  'petrolEscalationPct',
  'electricityEscalationPct',
] as const;

/** The slider holds exactly the scenario's own values: nothing to try out or to save. */
export function isSliderUnchanged(
  scenario: Scenario,
  slider: SliderPrices,
): boolean {
  const start = sliderStart(scenario);
  return (
    start !== null &&
    FIELDS.every((field) => Math.abs(slider[field] - start[field]) < 1e-9)
  );
}

/**
 * Changes one slider value and shows the slider's price case. Moving every
 * value back to the scenario's own puts the slider away: it is no change.
 */
export function setSliderPrice(patch: Partial<SliderPrices>): AppThunk {
  return (dispatch, getState) => {
    const state = getState();
    const scenario = selectActiveScenario(state);
    const current =
      state.ui.sliderPrices ?? (scenario ? sliderStart(scenario) : null);
    if (!current) return;
    const next = { ...current, ...patch };
    if (scenario && isSliderUnchanged(scenario, next)) {
      dispatch(sliderPricesSet(null));
      return;
    }
    dispatch(sliderPricesSet(next));
    dispatch(priceCaseSet('slider'));
  };
}

/** Back to the scenario's own prices; the shown price case returns to "Mittel". */
export function resetSlider(): AppThunk {
  return (dispatch) => {
    dispatch(sliderPricesSet(null));
  };
}

/**
 * "Als Szenario speichern": makes a new scenario from the active one and the
 * slider, makes it the active scenario and puts the slider away. `baseName` is
 * the text of the UI; a name that is taken gets a number. Returns the new id.
 */
export function saveSliderAsScenario(
  baseName: string,
): AppThunk<string | null> {
  return (dispatch, getState, { randomId }) => {
    const state = getState();
    const scenario = selectActiveScenario(state);
    const slider = state.ui.sliderPrices;
    if (!scenario || !slider || isSliderUnchanged(scenario, slider))
      return null;
    const saved = scenarioFromSlider(scenario, slider, {
      name: uniqueName(
        baseName,
        selectScenarios(state).map((s) => s.name),
      ),
      newId: randomId,
    });
    dispatch(scenarioAdded(saved));
    dispatch(sliderPricesSet(null));
    dispatch(activeScenarioSet(saved.id));
    return saved.id;
  };
}
