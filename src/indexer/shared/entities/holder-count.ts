/**
 * Holder-count bookkeeping shared by the ERC20-style transfer handlers.
 *
 * `token.holderCount` is the authoritative count for an asset; `pool.holderCount`
 * mirrors it so explore queries can filter and sort on the pool row without a
 * join. The pool count must always be derived from the token count, never from
 * the pool's own previous value: a coin mints its supply (and gains its first
 * holders) before its pool row exists, so a self-relative pool counter starts
 * life behind and can never catch up.
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface HolderCountDeltaParams {
  senderAddress: string;
  recipientAddress: string;
  /** Sender balance before the transfer. */
  senderPreviousBalance: bigint;
  /** Sender balance after the transfer. */
  senderBalance: bigint;
  /** Recipient balance before the transfer. */
  recipientPreviousBalance: bigint;
  /** Recipient balance after the transfer. */
  recipientBalance: bigint;
}

/**
 * Holder count only moves when a wallet crosses 0 <-> positive. The zero address
 * is never a holder, so mints only ever add and burns only ever remove.
 */
export const computeHolderCountDelta = ({
  senderAddress,
  recipientAddress,
  senderPreviousBalance,
  senderBalance,
  recipientPreviousBalance,
  recipientBalance,
}: HolderCountDeltaParams): number => {
  const isMint = senderAddress.toLowerCase() === ZERO_ADDRESS;
  const isBurn = recipientAddress.toLowerCase() === ZERO_ADDRESS;

  let delta = 0;

  if (!isBurn && recipientPreviousBalance === 0n && recipientBalance > 0n) {
    delta += 1;
  }

  if (!isMint && senderPreviousBalance > 0n && senderBalance === 0n) {
    delta -= 1;
  }

  return delta;
};

/**
 * Applies a delta to the authoritative token count. Clamped at zero so a row
 * that starts out under-counted (rows written before this bookkeeping was
 * correct, pending a backfill) degrades to 0 rather than to a negative count
 * that would poison `order by holder_count`.
 */
export const nextHolderCount = (current: number, delta: number): number =>
  Math.max(0, current + delta);
