import { describe, expect, it, vi } from "vitest";

vi.mock("ponder:schema", () => ({
  pool: {},
  token: {},
}));

vi.mock("ponder.schema", () => ({
  ethPrice: {},
  zoraUsdcPrice: {},
  fxhWethPrice: {},
  noiceWethPrice: {},
  monadUsdcPrice: {},
  usdcPrice: {},
  usdtPrice: {},
  eurcUsdcPrice: {},
  bankrWethPrice: {},
}));

vi.mock("ponder:registry", () => ({}));

vi.mock("./entities", () => ({
  updateAsset: vi.fn(),
  updatePool: vi.fn(),
  updatePoolDirect: vi.fn(),
}));

vi.mock("./entities/swap", () => ({
  insertSwapIfNotExists: vi.fn(),
}));

vi.mock("@app/utils/time-buckets", () => ({
  updateFifteenMinuteBucketUsd: vi.fn(),
}));

vi.mock("@app/config", () => ({
  chainConfigs: {},
}));

const { processSwapCalculations } = await import("./swap-optimizer");

describe("processSwapCalculations", () => {
  it("applies signed deltas to reserves for token0 asset buys", () => {
    const poolEntity = {
      isToken0: true,
      reserves0: 1_000n,
      reserves1: 500n,
      fee: 3_000,
    } as any;

    const swap = processSwapCalculations(
      poolEntity,
      {
        poolAddress: "0x0000000000000000000000000000000000000001",
        swapSender: "0x0000000000000000000000000000000000000002",
        amount0: -100n,
        amount1: 50n,
        sqrtPriceX96: 79228162514264337593543950336n,
        isCoinBuy: false,
        timestamp: 0n,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000003",
        transactionFrom: "0x0000000000000000000000000000000000000004",
        blockNumber: 0n,
        context: {} as any,
        tick: 0,
      },
      100000000n,
      18,
      8
    );

    expect(swap.nextReserves0).toBe(900n);
    expect(swap.nextReserves1).toBe(550n);
    expect(swap.amountIn).toBe(50n);
    expect(swap.amountOut).toBe(100n);
    expect(swap.swapType).toBe("buy");
  });

  it("applies signed deltas to reserves for token1 asset buys", () => {
    const poolEntity = {
      isToken0: false,
      reserves0: 700n,
      reserves1: 1_200n,
      fee: 3_000,
    } as any;

    const swap = processSwapCalculations(
      poolEntity,
      {
        poolAddress: "0x0000000000000000000000000000000000000001",
        swapSender: "0x0000000000000000000000000000000000000002",
        amount0: 40n,
        amount1: -80n,
        sqrtPriceX96: 79228162514264337593543950336n,
        isCoinBuy: false,
        timestamp: 0n,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000003",
        transactionFrom: "0x0000000000000000000000000000000000000004",
        blockNumber: 0n,
        context: {} as any,
        tick: 0,
      },
      100000000n,
      18,
      8
    );

    expect(swap.nextReserves0).toBe(740n);
    expect(swap.nextReserves1).toBe(1120n);
    expect(swap.amountIn).toBe(40n);
    expect(swap.amountOut).toBe(80n);
    expect(swap.swapType).toBe("buy");
  });
});
