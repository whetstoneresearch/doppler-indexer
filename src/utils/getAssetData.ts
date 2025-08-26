import { Hex } from "viem";
import { Context } from "ponder:registry";
import { AirlockABI } from "@app/abis";
import { AssetData } from "@app/types/shared";
import { SHARED_ADDRESSES } from "@app/config/const";

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