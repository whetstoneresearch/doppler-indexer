import { scheduledPools } from "ponder.schema";
import { Context } from "ponder:registry";
import { UniswapV4ScheduledMulticurveInitializerHookABI } from "@app/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerHookABI";
import { chainConfigs } from "@app/config";

export const insertScheduledPool = async ({  
  poolId,  
  context
}: {
  poolId: `0x${string}`,
  context: Context
}): Promise<typeof scheduledPools.$inferSelect> => {
  const { db, chain, client } = context;
  const chainId = chain.id;
  const hookAddresses = chainConfigs[chain.name].addresses.v4.v4ScheduledMulticurveInitializerHook;
  const addresses = Array.isArray(hookAddresses) ? hookAddresses : [hookAddresses];
  
  let startingTime;
  let lastError: unknown;
  for (const address of addresses) {
    try {
      const result = await client.readContract({
        abi: UniswapV4ScheduledMulticurveInitializerHookABI,
        address,
        functionName: "startingTimeOf",
        args: [poolId]
      });

      if (result > 0n) {
        startingTime = result;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (startingTime === undefined) {
    throw lastError ?? new Error(`Unable to read nonzero scheduled pool starting time for ${poolId}`);
  }
   
  return await db.insert(scheduledPools).values({
    chainId,
    poolId: poolId.toLowerCase() as `0x${string}`,
    startingTime
  })
}
