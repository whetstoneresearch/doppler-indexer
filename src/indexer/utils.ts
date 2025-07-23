import { Context } from "ponder:registry";
import { Address, Hex } from "viem";
import { AirlockABI, UniswapV2PairABI } from "../abis";
import { SHARED_ADDRESSES } from "../config/const";

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