import { ponder } from "ponder:registry";
import { ChainlinkOracleABI } from "@app/abis/ChainlinkOracleABI";
import { ethPrice, zoraUsdcPrice, fxhWethPrice, noiceWethPrice, monadUsdcPrice, eurcUsdcPrice, usdcPrice, usdtPrice } from "ponder.schema";
import { UniswapV3PoolABI } from "@app/abis/v3-abis/UniswapV3PoolABI";
import { StateViewABI } from "@app/abis/v4-abis/StateViewABI";
import { PriceService } from "@app/core";
import { chainConfigs } from "@app/config";
import { parseUnits, zeroAddress, createPublicClient, http, numberToHex } from "viem";

ponder.on("BaseChainlinkEthPriceFeed:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: chainConfigs["base"].addresses.shared.chainlinkEthOracle,
    functionName: "latestAnswer",
  });

  const price = latestAnswer;

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(ethPrice)
    .values({
      timestamp: adjustedTimestamp,
      chainId: chain.id,
      price,
    })
    .onConflictDoNothing();
});

ponder.on("UnichainChainlinkEthPriceFeed:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: chainConfigs["unichain"].addresses.shared.chainlinkEthOracle,
    functionName: "latestAnswer",
  });

  const price = latestAnswer;

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(ethPrice)
    .values({
      timestamp: adjustedTimestamp,
      chainId: chain.id,
      price,
    })
    .onConflictDoNothing();
});

ponder.on("InkChainlinkEthPriceFeed:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: chainConfigs["ink"].addresses.shared.chainlinkEthOracle,
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
      chainId: chain.id,
    })
    .onConflictDoNothing();
});

ponder.on("MonadChainlinkEthPriceFeed:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: chainConfigs["monad"].addresses.shared.chainlinkEthOracle,
    functionName: "latestAnswer",
  });

  const price = latestAnswer;

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(ethPrice)
    .values({
      timestamp: adjustedTimestamp,
      chainId: chain.id,
      price,
    })
    .onConflictDoNothing();
});

ponder.on("ZoraUsdcPrice:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs[chain.name].addresses.zora.zoraTokenPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: true,
    decimals: 18,
    quoteDecimals: 6,
  });

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(zoraUsdcPrice)
    .values({
      timestamp: adjustedTimestamp,
      price,
      chainId: chain.id,
    })
    .onConflictDoNothing();
});

ponder.on(
  "BaseSepoliaChainlinkEthPriceFeed:block",
  async ({ event, context }) => {
    const { db, client, chain } = context;
    const { timestamp } = event.block;

    const latestAnswer = await client.readContract({
      abi: ChainlinkOracleABI,
      address: chainConfigs["baseSepolia"].addresses.shared.chainlinkEthOracle,
      functionName: "latestAnswer",
    });

    const price = latestAnswer / parseUnits("1", 10);

    const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
    const adjustedTimestamp = roundedTimestamp + 300n;

    await db
      .insert(ethPrice)
      .values({
        timestamp: adjustedTimestamp,
        chainId: chain.id,
        price,
      })
      .onConflictDoNothing();
  }
);

ponder.on("FxhWethPrice:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.fxHash.fxhWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(fxhWethPrice)
    .values({
      timestamp: adjustedTimestamp,
      price,
      chainId: chain.id,
    })
    .onConflictDoNothing();
});

ponder.on("NoiceWethPrice:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.noice.noiceWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(noiceWethPrice)
    .values({
      timestamp: adjustedTimestamp,
      price,
      chainId: chain.id,
    })
    .onConflictDoNothing();
});

ponder.on("MonadUsdcPrice:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp, number: blockNumber } = event.block;
  
  if (chainConfigs[chain.name].addresses.shared.monad.monUsdcPool === zeroAddress) {
    return;
  }
  
  let slot0: readonly [bigint, number, number, number, number, number, boolean];
  
  try {
    try {
      // Try Ponder's client first
      slot0 = await client.readContract({
        abi: UniswapV3PoolABI,
        address: chainConfigs[chain.name].addresses.shared.monad.monUsdcPool,
        functionName: "slot0",
      });
    } catch (error) {
      // Fallback to direct RPC call bypassing Ponder's client abstraction
      console.log(`MonadUsdcPrice: Ponder client failed at block ${blockNumber}, falling back to direct RPC. Error: ${error}`);
      
      const directClient = createPublicClient({
        transport: http(process.env.PONDER_RPC_URL_143),
      });
      
      slot0 = await directClient.readContract({
        abi: UniswapV3PoolABI,
        address: chainConfigs[chain.name].addresses.shared.monad.monUsdcPool,
        functionName: "slot0",
        blockNumber,
      });
    }
  } catch (error) {
    console.error(`MonadUsdcPrice: Failed at block ${blockNumber}, skipping. Error: ${error}`);
    return;
  }

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: true,
    decimals: 18,
    quoteDecimals: 6,
  });

  const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  const adjustedTimestamp = roundedTimestamp + 300n;

  await db
    .insert(monadUsdcPrice)
    .values({
      timestamp: adjustedTimestamp,
      price,
      chainId: chain.id,
    })
    .onConflictDoNothing();
});

ponder.on("EurcUsdcPrice:block", async ({ event, context }) => {
  const { db, client, chain } = context;
  const { timestamp } = event.block;
  
  if (chainConfigs[chain.name].addresses.shared.eurc) {
    if (chainConfigs[chain.name].addresses.shared.eurc!.eurcUsdcPool === zeroAddress) {
      return;
    }
    
    const slot0 = await client.readContract({
      abi: StateViewABI,
      address: chainConfigs[chain.name].addresses.v4.stateView,      
      functionName: "getSlot0",
      args: [chainConfigs[chain.name].addresses.shared.eurc!.eurcUsdcPool]
    });
  
    const sqrtPriceX96 = slot0[0] as bigint;
  
    const price = PriceService.computePriceFromSqrtPriceX96({
      sqrtPriceX96,
      isToken0: true,
      decimals: 6,
      quoteDecimals: 6,
    });
  
    const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
    const adjustedTimestamp = roundedTimestamp + 300n;
  
    await db
      .insert(eurcUsdcPrice)
      .values({
        timestamp: adjustedTimestamp,
        price,
        chainId: chain.id,
      })
      .onConflictDoNothing();
  } else {
    return;
  }
});

// ponder.on(
//   "BaseChainlinkUsdcPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["base"].addresses.shared.chainlinkUsdcOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdcPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "BaseSepoliaChainlinkUsdcPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["baseSepolia"].addresses.shared.chainlinkUsdcOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdcPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "InkChainlinkUsdcPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["ink"].addresses.shared.chainlinkUsdcOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdcPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "InkChainlinkUsdtPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["ink"].addresses.shared.chainlinkUsdtOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdtPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "UnichainChainlinkUsdcPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["unichain"].addresses.shared.chainlinkUsdcOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdcPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "UnichainChainlinkUsdtPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["unichain"].addresses.shared.chainlinkUsdtOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdtPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "MonadChainlinkUsdcPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["monad"].addresses.shared.chainlinkUsdcOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdcPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );

// ponder.on(
//   "MonadChainlinkUsdtPriceFeed:block",
//   async ({ event, context }) => {
//     const { db, client, chain } = context;
//     const { timestamp } = event.block;
//     const latestAnswer = await client.readContract({
//       abi: ChainlinkOracleABI,
//       address: chainConfigs["monad"].addresses.shared.chainlinkUsdtOracle,
//       functionName: "latestAnswer",
//     });
//     const price = latestAnswer / parseUnits("1", 10);
//     const roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);
//     const adjustedTimestamp = roundedTimestamp + 300n;
//     await db
//       .insert(usdtPrice)
//       .values({
//         timestamp: adjustedTimestamp,
//         chainId: chain.id,
//         price,
//       })
//       .onConflictDoNothing();
//   }
// );
