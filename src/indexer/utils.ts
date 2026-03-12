import { Context } from "ponder:registry";
import { Address, Hex } from "viem";
import { AirlockABI, UniswapV2PairABI } from "@app/abis";
import { SHARED_ADDRESSES } from "@app/config/const";

/**
 * Checks if an error is caused by RPC providers truncating zero-padded responses.
 * Some RPC providers return "0x" instead of properly padded "0x0000...0000"
 * for contract calls that return all zeros, breaking ABI decoding.
 */
export const isZeroDataDecodingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const checkError = (err: Error): boolean => {
    const message = err.message || "";
    const name = err.name || "";

    return (
      // viem's ContractFunctionZeroDataError when contract returns "0x"
      name.includes("ContractFunctionZeroDataError") ||
      name.includes("ContractFunctionExecutionError") ||
      message.includes("returned no data") ||
      // ABI decoding errors
      name.includes("AbiDecoding") ||
      message.includes("data size of") ||
      message.includes("is too small") ||
      message.includes("AbiDecodingDataSizeTooSmall") ||
      // Match errors like 'returned "0x"' or data being empty/truncated
      (message.includes('"0x"') && message.includes("returned"))
    );
  };

  // Check the error itself
  if (checkError(error)) return true;

  // Check the cause chain (viem wraps errors)
  let cause = (error as any).cause;
  while (cause instanceof Error) {
    if (checkError(cause)) return true;
    cause = (cause as any).cause;
  }

  return false;
};

export const getPairData = async ({
  address,
  context,
}: {
  address: Hex;
  context: Context;
}) => {
  const { client } = context;

  const reserves = await client.readContract({
    abi: UniswapV2PairABI,
    address: address,
    functionName: "getReserves",
  });

  const reserve0 = reserves[0];
  const reserve1 = reserves[1];

  return {
    reserve0,
    reserve1,
  };
};

export interface AssetData {
  numeraire: Address;
  timelock: Address;
  governance: Address;
  liquidityMigrator: Address;
  poolInitializer: Address;
  pool: Address;
  migrationPool: Address;
  numTokensToSell: bigint;
  totalSupply: bigint;
  integrator: Address;
}

export const getAssetData = async (
    assetTokenAddr: Hex,
    context: Context
  ): Promise<AssetData> => {
    const assetData = await context.client.readContract({
      abi: AirlockABI,
      address: SHARED_ADDRESSES.airlock,
      functionName: "getAssetData",
      args: [assetTokenAddr],
    });
  
    if (!assetData || assetData.length !== 10) {
      console.error(`Error reading asset data for ${assetTokenAddr}`);
    }
  
    return {
      numeraire: assetData[0],
      timelock: assetData[1],
      governance: assetData[2],
      liquidityMigrator: assetData[3],
      poolInitializer: assetData[4],
      pool: assetData[5],
      migrationPool: assetData[6],
      numTokensToSell: BigInt(assetData[7]),
      totalSupply: BigInt(assetData[8]),
      integrator: assetData[9],
    };
  };