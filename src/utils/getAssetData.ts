import { Hex } from "viem";
import { Context } from "ponder:registry";
import { AirlockABI } from "@app/abis";
import { AssetData } from "@app/types/shared-types";
import { chainConfigs } from "@app/config";

export const getAssetData = async (
  assetTokenAddr: Hex,
  context: Context
): Promise<AssetData> => {
  const { chain } = context;
  const assetData = await context.client.readContract({
    abi: AirlockABI,
    address: chainConfigs[chain.name].addresses.shared.airlock,
    functionName: "getAssetData",
    args: [assetTokenAddr],
  });

  if (!assetData || assetData.length !== 10) {
    console.error(`Error reading asset data for ${assetTokenAddr}`);
  }

  return {
    numeraire: assetData[0].toLowerCase() as `0x${string}`,
    timelock: assetData[1].toLowerCase() as `0x${string}`,
    governance: assetData[2].toLowerCase() as `0x${string}`,
    liquidityMigrator: assetData[3].toLowerCase() as `0x${string}`,
    poolInitializer: assetData[4].toLowerCase() as `0x${string}`,
    pool: assetData[5].toLowerCase() as `0x${string}`,
    migrationPool: assetData[6].toLowerCase() as `0x${string}`,
    numTokensToSell: BigInt(assetData[7]),
    totalSupply: BigInt(assetData[8]),
    integrator: assetData[9].toLowerCase() as `0x${string}`,
  };
};