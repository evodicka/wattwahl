import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { DEFAULT_DEVICE_SETTINGS } from '../domain';
import {
  controlledWorker,
  fakeRepository,
  spawnSequence,
} from './__tests__/fakes';
import { uniqueName } from './names';
import {
  resetSlider,
  saveSliderAsScenario,
  scenarioFromSlider,
  setSliderPrice,
  shiftedRange,
  sliderStart,
} from './priceSlider';
import { activeScenarioSet, loaded } from './scenarioSlice';
import { selectActiveScenario, selectScenarios } from './selectors';
import { createAppStore } from './store';
import { priceCaseSet } from './uiSlice';

// S21: the price slider and "Als Szenario speichern".

function setup() {
  let counter = 0;
  const store = createAppStore({
    repository: fakeRepository(),
    spawnWorker: spawnSequence(controlledWorker()),
    now: () => new Date('2026-11-14T11:04:00Z'),
    randomId: () =>
      `70000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  });
  const scenario = exampleScenario();
  store.dispatch(
    loaded({
      scenarios: [scenario],
      readOnly: [],
      invalid: [],
      settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: scenario.id },
    }),
  );
  return { store, scenario };
}

describe('S21: unique names', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(uniqueName('Standard · Preis-Regler', ['Standard'])).toBe(
      'Standard · Preis-Regler',
    );
    expect(uniqueName('A', ['A'])).toBe('A (2)');
    expect(uniqueName('A', ['A', 'A (2)', 'a (3)'])).toBe('A (4)');
  });
});

describe('S21: the slider starts at the mid prices', () => {
  it('takes mid prices and escalations of the scenario', () => {
    expect(sliderStart(exampleScenario())).toEqual({
      petrol: 1.9,
      electricity: 0.3,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    });
  });

  it('has no start while a price is missing', () => {
    const scenario = exampleScenario();
    scenario.parameters.electricityPrice = { min: null, mid: null, max: null };
    expect(sliderStart(scenario)).toBeNull();
  });
});

describe('S21: a price range moves with the slider', () => {
  it('keeps the width: minimum and maximum shift by the same amount', () => {
    expect(shiftedRange({ min: 1.7, mid: 1.9, max: 2.1 }, 2.4)).toEqual({
      min: expect.closeTo(2.2, 10),
      mid: 2.4,
      max: expect.closeTo(2.6, 10),
    });
  });

  it('stops the minimum at 0', () => {
    expect(shiftedRange({ min: 0.25, mid: 0.3, max: 0.35 }, 0.1)).toEqual({
      min: expect.closeTo(0.05, 10),
      mid: 0.1,
      max: expect.closeTo(0.15, 10),
    });
    expect(shiftedRange({ min: 0.25, mid: 0.3, max: 0.35 }, 0.02).min).toBe(0);
  });

  it('never leaves the maximum below the mid', () => {
    expect(shiftedRange({ min: 1, mid: 2, max: 2 }, 3)).toEqual({
      min: 2,
      mid: 3,
      max: 3,
    });
  });
});

describe('S21: a slider belongs to its scenario', () => {
  const twoScenarios = () => {
    const { store, scenario } = setup();
    const other = {
      ...exampleScenario(),
      id: '90000000-0000-4000-8000-000000000001',
      name: 'Other',
    };
    store.dispatch(
      loaded({
        scenarios: [scenario, other],
        readOnly: [],
        invalid: [],
        settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: scenario.id },
      }),
    );
    return { store, other };
  };

  it('is dropped, and the price case with it, when another scenario becomes active', () => {
    const { store, other } = twoScenarios();
    store.dispatch(setSliderPrice({ petrol: 2.4 }));
    expect(store.getState().ui.priceCase).toBe('slider');
    store.dispatch(activeScenarioSet(other.id));
    expect(store.getState().ui.sliderPrices).toBeNull();
    expect(store.getState().ui.priceCase).toBe('mid');
  });

  it('is dropped when the stores are loaded again (an import)', () => {
    const { store, other } = twoScenarios();
    store.dispatch(setSliderPrice({ petrol: 2.4 }));
    store.dispatch(
      loaded({
        scenarios: [other],
        readOnly: [],
        invalid: [],
        settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: other.id },
      }),
    );
    expect(store.getState().ui.sliderPrices).toBeNull();
  });

  it('keeps the price case of the table when it is not the slider case', () => {
    const { store, other } = twoScenarios();
    store.dispatch(priceCaseSet('evFavorable'));
    store.dispatch(activeScenarioSet(other.id));
    expect(store.getState().ui.priceCase).toBe('evFavorable');
  });
});

describe('S21: a range keeps its width without float noise', () => {
  it('writes shifted values as plain decimals', () => {
    expect(shiftedRange({ min: 1.7, mid: 1.9, max: 2.1 }, 2.4)).toEqual({
      min: 2.2,
      mid: 2.4,
      max: 2.6,
    });
  });

  it('lets a bound that is not set follow the mid', () => {
    expect(shiftedRange({ min: null, mid: 1.9, max: null }, 2.4)).toEqual({
      min: 2.4,
      mid: 2.4,
      max: 2.4,
    });
  });

  it('keeps the minimum at or below the mid', () => {
    expect(
      shiftedRange({ min: 2.5, mid: 1.9, max: 3 }, 2.4).min,
    ).toBeLessThanOrEqual(2.4);
  });
});

describe('S21: the scenario made from the slider', () => {
  const slider = {
    petrol: 2.4,
    electricity: 0.45,
    petrolEscalationPct: 3,
    electricityEscalationPct: 2,
  };

  it('holds the shifted prices and the escalations and copies the rest, the Stichtag included', () => {
    const scenario = exampleScenario();
    scenario.parameters.warrantyReferenceMonth = { month: 5, year: 2025 };
    scenario.parameters.warrantyReferenceMonthSetByUser = true;
    let n = 0;
    const made = scenarioFromSlider(scenario, slider, {
      name: 'X',
      newId: () => `80000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    });
    expect(made.name).toBe('X');
    expect(made.iceVehicle.petrolPrice.mid).toBe(2.4);
    expect(made.parameters.electricityPrice.mid).toBe(0.45);
    expect(made.iceVehicle.petrolEscalationPct).toBe(3);
    expect(made.parameters.electricityEscalationPct).toBe(2);
    expect(made.parameters.warrantyReferenceMonth).toEqual({
      month: 5,
      year: 2025,
    });
    expect(made.parameters.warrantyReferenceMonthSetByUser).toBe(true);
    expect(made.workplaces).toBe(scenario.workplaces);
    // The original is untouched.
    expect(scenario.iceVehicle.petrolPrice.mid).toBe(1.9);
  });

  it('gives new ids to the scenario, its candidates and their lease tiers', () => {
    const scenario = exampleScenario();
    const made = scenarioFromSlider(scenario, slider, {
      name: 'X',
      newId: (() => {
        let n = 0;
        return () => `80000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      })(),
    });
    const ids = [
      made.id,
      ...made.candidates.flatMap((c) => [
        c.id,
        ...c.leaseTiers.map((t) => t.id),
      ]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const originalIds = [
      scenario.id,
      ...scenario.candidates.flatMap((c) => [
        c.id,
        ...c.leaseTiers.map((t) => t.id),
      ]),
    ];
    expect(ids.filter((id) => originalIds.includes(id))).toEqual([]);
    expect(made.candidates[0]?.name).toBe(scenario.candidates[0]?.name);
  });
});

describe('S21: the slider in the store', () => {
  it('a change starts from the mid prices, keeps the others and shows the slider case', () => {
    const { store } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.2 }));
    expect(store.getState().ui.sliderPrices).toEqual({
      petrol: 2.2,
      electricity: 0.3,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    });
    expect(store.getState().ui.priceCase).toBe('slider');
    store.dispatch(setSliderPrice({ electricity: 0.5 }));
    expect(store.getState().ui.sliderPrices).toMatchObject({
      petrol: 2.2,
      electricity: 0.5,
    });
  });

  it('does nothing while a price is missing', () => {
    const { store, scenario } = setup();
    const empty = {
      ...scenario,
      parameters: {
        ...scenario.parameters,
        electricityPrice: { min: null, mid: null, max: null },
      },
    };
    store.dispatch(
      loaded({
        scenarios: [empty],
        readOnly: [],
        invalid: [],
        settings: { ...DEFAULT_DEVICE_SETTINGS, activeScenarioId: empty.id },
      }),
    );
    store.dispatch(setSliderPrice({ petrol: 2.2 }));
    expect(store.getState().ui.sliderPrices).toBeNull();
  });

  it("moving every value back to the scenario's own puts the slider away: no change, no slider case", () => {
    const { store } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.2 }));
    expect(store.getState().ui.sliderPrices).not.toBeNull();
    store.dispatch(setSliderPrice({ petrol: 1.9 }));
    expect(store.getState().ui.sliderPrices).toBeNull();
    expect(store.getState().ui.priceCase).toBe('mid');
    // Nothing is left to save.
    expect(store.dispatch(saveSliderAsScenario('X'))).toBeNull();
    expect(selectScenarios(store.getState())).toHaveLength(1);
  });

  it('with two values changed, one moved back is still a change', () => {
    const { store } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.2 }));
    store.dispatch(setSliderPrice({ electricity: 0.4 }));
    store.dispatch(setSliderPrice({ petrol: 1.9 }));
    expect(store.getState().ui.sliderPrices).toEqual({
      petrol: 1.9,
      electricity: 0.4,
      petrolEscalationPct: 0,
      electricityEscalationPct: 0,
    });
  });

  it('a first move onto the own value changes nothing', () => {
    const { store } = setup();
    store.dispatch(setSliderPrice({ petrol: 1.9 }));
    expect(store.getState().ui.sliderPrices).toBeNull();
    expect(store.getState().ui.priceCase).toBe('mid');
  });

  it('a reset puts the slider away and the shown price case back to "Mittel"', () => {
    const { store } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.2 }));
    store.dispatch(resetSlider());
    expect(store.getState().ui.sliderPrices).toBeNull();
    expect(store.getState().ui.priceCase).toBe('mid');
  });

  it('the slider is not saved with the scenario', () => {
    const { store, scenario } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.2 }));
    expect(selectActiveScenario(store.getState())).toBe(scenario);
    expect(store.getState().scenario.dirty).toEqual([]);
  });

  it('"Als Szenario speichern" adds a scenario with the prices, makes it active and puts the slider away', () => {
    const { store, scenario } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.4, electricity: 0.45 }));
    const id = store.dispatch(saveSliderAsScenario('Example · Preis-Regler'));
    const scenarios = selectScenarios(store.getState());
    expect(scenarios.map((s) => s.name)).toEqual([
      'Example',
      'Example · Preis-Regler',
    ]);
    const saved = scenarios[1];
    expect(saved?.id).toBe(id);
    expect(saved?.iceVehicle.petrolPrice.mid).toBe(2.4);
    expect(saved?.parameters.electricityPrice.mid).toBe(0.45);
    expect(store.getState().scenario.activeId).toBe(id);
    expect(store.getState().ui.sliderPrices).toBeNull();
    expect(store.getState().ui.priceCase).toBe('mid');
    expect(store.getState().scenario.dirty).toEqual([id]);
    // The first scenario keeps its prices.
    expect(scenarios[0]?.iceVehicle.petrolPrice.mid).toBe(1.9);
    expect(scenarios[0]).toBe(scenario);
  });

  it('a second save gets a number in its name', () => {
    const { store } = setup();
    store.dispatch(setSliderPrice({ petrol: 2.4 }));
    store.dispatch(saveSliderAsScenario('Example · Preis-Regler'));
    store.dispatch(setSliderPrice({ petrol: 2.6 }));
    store.dispatch(saveSliderAsScenario('Example · Preis-Regler'));
    expect(selectScenarios(store.getState()).map((s) => s.name)).toEqual([
      'Example',
      'Example · Preis-Regler',
      'Example · Preis-Regler (2)',
    ]);
  });

  it('saves nothing without a slider', () => {
    const { store } = setup();
    expect(store.dispatch(saveSliderAsScenario('X'))).toBeNull();
    expect(selectScenarios(store.getState())).toHaveLength(1);
  });

  it('priceCaseSet is only needed for the cases of the table', () => {
    const { store } = setup();
    store.dispatch(priceCaseSet('evFavorable'));
    store.dispatch(resetSlider());
    expect(store.getState().ui.priceCase).toBe('evFavorable');
  });
});
