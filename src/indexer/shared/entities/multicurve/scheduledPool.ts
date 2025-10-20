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
  
  let startingTime;
  startingTime = await client.readContract({
    abi: UniswapV4ScheduledMulticurveInitializerHookABI,
    address: chainConfigs[chain.name].addresses.v4.v4ScheduledMulticurveInitializerHook,
    functionName: "startingTimeOf",
    args: [poolId]
  });
  
  return await db.insert(scheduledPools).values({
    chainId,
    poolId,
    startingTime
  })
}
