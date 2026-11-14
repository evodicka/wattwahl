import { z } from 'zod';
import type { Candidate } from './schema';

// Offers have no UUID of their own (architecture 8.1): the id is derived from
// the candidate and, for a lease, from the UUID of its lease tier.

export const OfferSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('purchase'),
    offerId: z.string(),
    candidateId: z.string(),
  }),
  z.object({
    kind: z.literal('lease'),
    offerId: z.string(),
    candidateId: z.string(),
    leaseTierId: z.string(),
  }),
]);
export type Offer = z.infer<typeof OfferSchema>;

export const purchaseOfferId = (candidateId: string): string =>
  `${candidateId}:purchase`;

export const leaseOfferId = (
  candidateId: string,
  leaseTierId: string,
): string => `${candidateId}:lease:${leaseTierId}`;

/** Returns `null` for anything that is not an offer id. */
export function parseOfferId(offerId: string): Offer | null {
  const parts = offerId.split(':');
  const [candidateId, kind, leaseTierId] = parts;
  if (!candidateId) return null;
  if (parts.length === 2 && kind === 'purchase') {
    return { kind: 'purchase', offerId, candidateId };
  }
  if (parts.length === 3 && kind === 'lease' && leaseTierId) {
    return { kind: 'lease', offerId, candidateId, leaseTierId };
  }
  return null;
}

/** The purchase offer first, then one offer per lease tier in list order. */
export function listOffers(
  candidate: Pick<Candidate, 'id'> & {
    leaseTiers: readonly Pick<Candidate['leaseTiers'][number], 'id'>[];
  },
): Offer[] {
  return [
    {
      kind: 'purchase',
      offerId: purchaseOfferId(candidate.id),
      candidateId: candidate.id,
    },
    ...candidate.leaseTiers.map((tier): Offer => ({
      kind: 'lease',
      offerId: leaseOfferId(candidate.id, tier.id),
      candidateId: candidate.id,
      leaseTierId: tier.id,
    })),
  ];
}
