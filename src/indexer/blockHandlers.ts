import { ponder } from "ponder:registry";
import { refreshActivePoolsBlob } from "./shared/scheduledJobs";
import { configs } from "addresses";
import { ChainlinkOracleABI } from "@app/abis/ChainlinkOracleABI";
import { ethPrice } from "ponder.schema";
import { handlePendingTokenImages } from "./shared/process-pending-images";
import { refreshCheckpointBlob } from "./shared/entities/v4-entities/v4CheckpointBlob";

/**
* Block handlers that run periodically to ensure volume data and metrics are up-to-date
* These are triggered by the block configuration in ponder.config.ts
*/
ponder.on("MetricRefresher:block", async ({ event, context }) => {
  try {
    // Execute optimized combined refresh job
    await refreshActivePoolsBlob({
      context,
      timestamp: Number(event.block.timestamp),
    });
  } catch (error) {
    console.error(`Error in unichain refresh job: ${error}`);
  }
});

ponder.on("V4CheckpointsRefresher:block", async ({ event, context }) => {
  await refreshCheckpointBlob({
    context,
    timestamp: Number(event.block.timestamp),
  });
});

ponder.on("ChainlinkEthPriceFeed:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: configs[chain.name].oracle.chainlinkEth,
    functionName: "latestAnswer",
  });

  const price = latestAnswer;

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(ethPrice)
    .values({
      timestamp: adjustedTimestamp,
      price,
    })
    .onConflictDoNothing();
});

// TODO: add back
// ponder.on("PendingTokenImages:block", async ({ event, context }) => {
//   await handlePendingTokenImages({
//     context,
//     timestamp: Number(event.block.timestamp),
//   });
// });
