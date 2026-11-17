import { describe, expect, it } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { listOffers, listScenarioOffers } from './offerId';

describe('C4b: listScenarioOffers', () => {
  const scenario = exampleScenario();
  const candidate = scenario.candidates.find((c) => c.leaseTiers.length > 0);
  if (!candidate) throw new Error('the fixture needs a candidate with leases');

  it('lists all offers of the candidate while lease offers are included', () => {
    expect(
      listScenarioOffers({ ...scenario, includeLeaseOffers: true }, candidate),
    ).toEqual(listOffers(candidate));
  });

  it('lists only the purchase offer once lease offers are hidden', () => {
    const offers = listScenarioOffers(
      { ...scenario, includeLeaseOffers: false },
      candidate,
    );
    expect(offers).toEqual(listOffers(candidate).slice(0, 1));
    expect(offers.map((offer) => offer.kind)).toEqual(['purchase']);
  });
});
