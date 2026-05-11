export const CLAIMABLE_FEES_DEFAULT_LIMIT = 100;
export const CLAIMABLE_FEES_MAX_LIMIT = 100;
export const CLAIMABLE_FEES_MAX_OFFSET = 10_000;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface PaginationParams {
  limit: number;
  offset: number;
}

function parseIntegerParam(value: string | undefined, defaultValue: number): number | null {
  if (value === undefined) {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

export function parseClaimableFeesPagination({
  limit,
  offset,
}: {
  limit: string | undefined;
  offset: string | undefined;
}): PaginationParams | null {
  const parsedLimit = parseIntegerParam(limit, CLAIMABLE_FEES_DEFAULT_LIMIT);
  const parsedOffset = parseIntegerParam(offset, 0);

  if (
    parsedLimit === null ||
    parsedOffset === null ||
    parsedLimit < 1 ||
    parsedLimit > CLAIMABLE_FEES_MAX_LIMIT ||
    parsedOffset < 0 ||
    parsedOffset > CLAIMABLE_FEES_MAX_OFFSET
  ) {
    return null;
  }

  return { limit: parsedLimit, offset: parsedOffset };
}

export function parseChainIdsParam(value: string | undefined): number[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  const segments = value.split(",");
  if (segments.length === 0 || segments.some((segment) => !/^\d+$/.test(segment))) {
    return null;
  }

  const chainIds = segments.map((segment) => Number(segment));
  if (chainIds.some((chainId) => !Number.isSafeInteger(chainId) || chainId > POSTGRES_INTEGER_MAX)) {
    return null;
  }

  return chainIds;
}

export function parseRequiredIntegerParam(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > POSTGRES_INTEGER_MAX) {
    return null;
  }

  return parsed;
}
