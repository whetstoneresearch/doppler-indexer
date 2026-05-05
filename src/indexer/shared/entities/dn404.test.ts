import { describe, expect, it } from "vitest";
import { readDN404TokenData } from "./dn404";

const tokenAddress = "0x1111111111111111111111111111111111111111";
const mirrorAddress = "0x2222222222222222222222222222222222222222";

describe("readDN404TokenData", () => {
  it("reads DN404 metadata and prefers mirror NFT supply", async () => {
    const context = {
      chain: { name: "baseSepolia" },
      client: {
        multicall: async () => [
          { status: "success", result: 1000000000000000000n },
          { status: "success", result: "ipfs://collection/" },
          { status: "success", result: mirrorAddress },
          { status: "success", result: 4n },
        ],
        readContract: async () => 7n,
      },
    };

    await expect(
      readDN404TokenData({
        tokenAddress,
        mirrorAddress,
        context: context as any,
      }),
    ).resolves.toEqual({
      tokenVariant: "doppler404",
      dn404Unit: 1000000000000000000n,
      dn404NftSupply: 7n,
      dn404BaseUri: "ipfs://collection/",
      dn404MirrorAddress: mirrorAddress,
      dn404ReadStatus: "ok",
    });
  });

  it("marks retry when reads fail", async () => {
    const context = {
      chain: { name: "baseSepolia" },
      client: {
        multicall: async () => {
          throw new Error("rpc failed");
        },
      },
    };

    await expect(
      readDN404TokenData({
        tokenAddress,
        mirrorAddress,
        context: context as any,
      }),
    ).resolves.toEqual({
      tokenVariant: "doppler404",
      dn404Unit: null,
      dn404NftSupply: null,
      dn404BaseUri: null,
      dn404MirrorAddress: mirrorAddress,
      dn404ReadStatus: "retry",
    });
  });
});
