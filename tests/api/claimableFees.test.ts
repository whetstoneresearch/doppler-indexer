import { beforeEach, describe, expect, it, vi } from "vitest";

const dbExecute = vi.hoisted(() => vi.fn());

interface MockSql {
  text: string;
}

function stringifySqlValue(value: unknown): string {
  if (typeof value === "object" && value !== null && "text" in value) {
    return (value as MockSql).text;
  }

  return String(value);
}

function mockSql(strings: TemplateStringsArray, ...values: unknown[]): MockSql {
  return {
    text: strings.reduce((sqlText, chunk, index) => {
      const value = values[index];
      return `${sqlText}${chunk}${value === undefined ? "" : stringifySqlValue(value)}`;
    }, ""),
  };
}

function replaceBigInts(value: unknown, replacer: (value: bigint) => string): unknown {
  if (typeof value === "bigint") {
    return replacer(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => replaceBigInts(entry, replacer));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceBigInts(entry, replacer)])
    );
  }

  return value;
}

vi.mock("ponder", () => ({
  client: () => async (_c: unknown, next: () => Promise<void>) => next(),
  graphql: () => async (_c: unknown, next: () => Promise<void>) => next(),
  replaceBigInts,
  sql: mockSql,
}));

vi.mock("ponder:api", () => ({
  db: {
    execute: dbExecute,
  },
}));

vi.mock("ponder:schema", () => ({
  default: {},
}));

const { default: app } = await import("../../src/api/index");

describe("GET /fees/claimable/:beneficiary", () => {
  beforeEach(() => {
    dbExecute.mockReset();
    dbExecute.mockResolvedValue([]);
  });

  it("returns claimable rows and stringifies bigint fields", async () => {
    dbExecute.mockResolvedValue([
      {
        pool_id: `0x${"1".repeat(64)}`,
        chain_id: 8453,
        beneficiary: `0x${"2".repeat(40)}`,
        token0_fees: 1n,
        token1_fees: 2n,
        total_fees_usd: 3n,
        shares: 0n,
        initializer: null,
      },
    ]);

    const response = await app.request(`/fees/claimable/0x${"2".repeat(40)}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        pool_id: `0x${"1".repeat(64)}`,
        chain_id: 8453,
        beneficiary: `0x${"2".repeat(40)}`,
        token0_fees: "1",
        token1_fees: "2",
        total_fees_usd: "3",
        shares: "0",
        initializer: null,
      },
    ]);
  });

  it("anchors the query on filtered claimable fees before resolving recipient metadata", async () => {
    await app.request(`/fees/claimable/0x${"3".repeat(40)}`);

    const query = dbExecute.mock.calls[0]?.[0] as MockSql;
    expect(query.text).toContain("WITH claimable_fees AS");
    expect(query.text).toContain("FROM cumulated_fees cf");
    expect(query.text).toContain("WHERE cf.beneficiary =");
    expect(query.text).toContain("candidate_pools AS");
    expect(query.text).toContain("JOIN candidate_pools cp");
    expect(query.text).toContain("normalized_status AS");
    expect(query.text).toContain("legacy_recipients AS");
    expect(query.text).toContain("LEFT JOIN recipient_rows rr");
    expect(query.text).not.toContain("claimable_parties AS");
  });

  it("applies pool and chain filters to the claimable fees anchor", async () => {
    const poolId = `0x${"4".repeat(64)}`;

    await app.request(`/fees/claimable/0x${"5".repeat(40)}?pool_id=${poolId}&chain_ids=8453,84532&limit=25&offset=5`);

    const query = dbExecute.mock.calls[0]?.[0] as MockSql;
    expect(query.text).toContain("AND cf.pool_id =");
    expect(query.text).toContain("AND cf.chain_id = ANY");
    expect(query.text).toContain("LIMIT 25");
    expect(query.text).toContain("OFFSET 5");
  });

  it("filters recipient branches to the requested beneficiary", async () => {
    await app.request(`/fees/claimable/0x${"7".repeat(40)}`);

    const query = dbExecute.mock.calls[0]?.[0] as MockSql;
    expect(query.text).toContain("AND fr.beneficiary =");
    expect(query.text).toContain("AND (recipient.value->>'beneficiary')::text =");
    expect(query.text).toContain("COALESCE(rr.shares, 0) AS shares");
  });

  it("keeps claimable rows when token metadata is missing", async () => {
    await app.request(`/fees/claimable/0x${"8".repeat(40)}`);

    const query = dbExecute.mock.calls[0]?.[0] as MockSql;
    expect(query.text).toContain("LEFT JOIN token t");
  });

  it("rejects invalid claimable-fee inputs", async () => {
    const invalidBeneficiary = await app.request("/fees/claimable/not-an-address");
    const invalidPool = await app.request(`/fees/claimable/0x${"6".repeat(40)}?pool_id=bad`);
    const invalidChains = await app.request(`/fees/claimable/0x${"6".repeat(40)}?chain_ids=8453,abc`);
    const invalidPagination = await app.request(`/fees/claimable/0x${"6".repeat(40)}?limit=101`);

    expect(invalidBeneficiary.status).toBe(400);
    expect(invalidPool.status).toBe(400);
    expect(invalidChains.status).toBe(400);
    expect(invalidPagination.status).toBe(400);
    expect(dbExecute).not.toHaveBeenCalled();
  });
});
