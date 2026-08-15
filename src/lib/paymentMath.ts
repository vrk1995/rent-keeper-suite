export const TDS_RATE = 0.1;
export const GST_RATE = 0.18;

export interface SettlementBreakdown {
  /** The rent portion this settles, before GST/TDS — what counts against the amount due. */
  grossSettled: number;
  tdsAmount: number;
  gstAmount: number;
  /** Actual cash that changes hands: grossSettled + gstAmount - tdsAmount. */
  receivedAmount: number;
}

/** Forward: given the rent portion being cleared, compute its GST/TDS and the resulting
 *  cash. Used when the rent amount is already known exactly (e.g. "Full Amount"). */
export function settlementFromGross(
  grossSettled: number,
  tdsApplicable: boolean,
  gstApplicable: boolean
): SettlementBreakdown {
  const gross = Math.max(grossSettled, 0);
  const tdsAmount = tdsApplicable ? Math.round(gross * TDS_RATE) : 0;
  const gstAmount = gstApplicable ? Math.round(gross * GST_RATE) : 0;
  return { grossSettled: gross, tdsAmount, gstAmount, receivedAmount: gross + gstAmount - tdsAmount };
}

/** Reverse: given the actual cash received, find the rent portion it settles. This is
 *  what a partial payment actually needs — the person knows what hit their bank account,
 *  not some pre-GST/TDS figure. GST and TDS are each rounded independently from the gross
 *  rent amount, so the relationship isn't perfectly linear; this nudges the nearest
 *  whole-rupee guess until the forward calculation reproduces the received amount (or
 *  gets as close as rounding allows). */
export function settlementFromReceived(
  receivedAmount: number,
  tdsApplicable: boolean,
  gstApplicable: boolean
): SettlementBreakdown {
  if (receivedAmount <= 0) return { grossSettled: 0, tdsAmount: 0, gstAmount: 0, receivedAmount: 0 };
  const rateFactor = 1 + (gstApplicable ? GST_RATE : 0) - (tdsApplicable ? TDS_RATE : 0);
  const guess = Math.max(Math.round(receivedAmount / rateFactor), 1);

  let best = settlementFromGross(guess, tdsApplicable, gstApplicable);
  let bestDiff = Math.abs(best.receivedAmount - receivedAmount);
  for (let delta = -3; delta <= 3; delta++) {
    const candidateGross = guess + delta;
    if (candidateGross <= 0) continue;
    const candidate = settlementFromGross(candidateGross, tdsApplicable, gstApplicable);
    const diff = Math.abs(candidate.receivedAmount - receivedAmount);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  return best;
}
