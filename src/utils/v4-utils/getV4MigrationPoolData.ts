import { Address } from "viem";
import { Context } from "ponder:registry";
import { V4MigratorABI, StateViewABI } from "@app/abis";
import { PoolKey, Slot0Data } from "@app/types/v4-types";
import { getPoolId } from "./getPoolId";
import { computeV4Price } from "./computeV4Price";
import { chainConfigs } from "@app/config";
import { getQuoteInfo, QuoteInfo } from "@app/utils/getQuoteInfo";
import { getAssetData } from "@app/utils/getAssetData";
import { zeroAddress } from "viem";

export interface V4MigrationPoolData {
  poolKey: PoolKey;
  poolId: `0x${string}`;
  slot0Data: Slot0Data;
  liquidity: bigint;
  price: bigint;
  isToken0: boolean;
  baseToken: Address;
  quoteToken: Address;
  quoteInfo: QuoteInfo;
  reserves0: bigint;
  reserves1: bigint;
}

export const getV4MigrationPoolData = async ({
  migratorAddress,
  assetAddress,
  numeraireAddress,
  timestamp,
  context,
}: {
  migratorAddress: Address;
  assetAddress: Address;
  numeraireAddress: Address;
  timestamp: bigint;
  context: Context;
}): Promise<V4MigrationPoolData> => {
  const { client, chain } = context;
  const { stateView } = chainConfigs[chain.name].addresses.v4;

  const token0 = assetAddress.toLowerCase() < numeraireAddress.toLowerCase()
    ? assetAddress
    : numeraireAddress;
  const token1 = assetAddress.toLowerCase() < numeraireAddress.toLowerCase()
    ? numeraireAddress
    : assetAddress;

  const assetData = await client.readContract({
    abi: V4MigratorABI,
    address: migratorAddress,
    functionName: "getAssetData",
    args: [token0, token1],
  });

  const poolKey: PoolKey = {
    currency0: assetData.poolKey.currency0,
    currency1: assetData.poolKey.currency1,
    fee: assetData.poolKey.fee,
    tickSpacing: assetData.poolKey.tickSpacing,
    hooks: assetData.poolKey.hooks,
  };

  const poolId = getPoolId(poolKey);

  const [slot0Result, liquidityResult] = await client.multicall({
    contracts: [
      {
        abi: StateViewABI,
        address: stateView,
        functionName: "getSlot0",
        args: [poolId],
      },
      {
        abi: StateViewABI,
        address: stateView,
        functionName: "getLiquidity",
        args: [poolId],
      },
    ],
  });

  const slot0Data: Slot0Data = {
    sqrtPrice: slot0Result.result?.[0] ?? 0n,
    tick: slot0Result.result?.[1] ?? 0,
    protocolFee: slot0Result.result?.[2] ?? 0,
    lpFee: slot0Result.result?.[3] ?? 0,
  };

  const liquidity = liquidityResult.result ?? 0n;

  const isToken0 = assetAddress.toLowerCase() === poolKey.currency0.toLowerCase();
  const baseToken = isToken0 ? poolKey.currency0 : poolKey.currency1;
  const quoteToken = isToken0 ? poolKey.currency1 : poolKey.currency0;

  const quoteInfo = await getQuoteInfo(quoteToken, timestamp, context);

  const price = computeV4Price({
    isToken0,
    currentTick: slot0Data.tick,
    baseTokenDecimals: 18, // DERC20 tokens are always 18 decimals
    quoteTokenDecimals: quoteInfo.quoteDecimals,
  });

  // Calculate reserves from sqrtPriceX96 and liquidity
  // For V4/V3 AMM pools:
  // reserve0 = liquidity * 2^96 / sqrtPriceX96
  // reserve1 = liquidity * sqrtPriceX96 / 2^96
  const Q96 = 2n ** 96n;
  const sqrtPrice = slot0Data.sqrtPrice;
  let reserves0 = 0n;
  let reserves1 = 0n;
  
  if (sqrtPrice > 0n) {
    reserves0 = (liquidity * Q96) / sqrtPrice;
    reserves1 = (liquidity * sqrtPrice) / Q96;
  }

  return {
    poolKey,
    poolId: poolId.toLowerCase() as `0x${string}`,
    slot0Data,
    liquidity,
    price,
    isToken0,
    baseToken,
    quoteToken,
    quoteInfo,
    reserves0,
    reserves1,
  };
};

export const isV4MigratorHook = (
  hookAddress: Address,
  chainName: string
): boolean => {
  const config = chainConfigs[chainName as keyof typeof chainConfigs];
  if (!config) {
    return false;
  }

  const v4MigratorHooks = config.addresses.v4.v4MigratorHook;
  const hookAddresses = Array.isArray(v4MigratorHooks)
    ? v4MigratorHooks
    : [v4MigratorHooks];

  return hookAddresses.some(
    (h) =>
      h.toLowerCase() !== zeroAddress.toLowerCase() &&
      h.toLowerCase() === hookAddress.toLowerCase()
  );
};

export const getV4MigratorForAsset = (
  liquidityMigrator: Address,
  chainName: string
): Address | null => {
  const config = chainConfigs[chainName as keyof typeof chainConfigs];
  if (!config) {
    return null;
  }

  const v4Migrators = config.addresses.v4.v4Migrator;
  const migratorAddresses = Array.isArray(v4Migrators)
    ? v4Migrators
    : [v4Migrators];

  const found = migratorAddresses.find(
    (m) =>
      m.toLowerCase() !== zeroAddress.toLowerCase() &&
      m.toLowerCase() === liquidityMigrator.toLowerCase()
  );

  return found ?? null;
};

