import type { Context } from "ponder:registry";
import type { token } from "ponder:schema";
import { DopplerDN404ABI, DopplerDN404MirrorABI } from "@app/abis";
import { getMulticallOptions } from "@app/core/utils";
import { Address, zeroAddress } from "viem";

export type DN404TokenData = Pick<
  typeof token.$inferInsert,
  | "tokenVariant"
  | "dn404Unit"
  | "dn404NftSupply"
  | "dn404BaseUri"
  | "dn404MirrorAddress"
  | "dn404ReadStatus"
>;

export const readDN404TokenData = async ({
  tokenAddress,
  mirrorAddress,
  context,
}: {
  tokenAddress: Address;
  mirrorAddress?: Address | null;
  context: Context;
}): Promise<DN404TokenData> => {
  const { chain, client } = context;
  const address = tokenAddress.toLowerCase() as `0x${string}`;
  const normalizedMirror = mirrorAddress && mirrorAddress !== zeroAddress
    ? mirrorAddress.toLowerCase() as `0x${string}`
    : null;

  try {
    const [unitResult, baseUriResult, mirrorResult, tokenNftSupplyResult] =
      await client.multicall({
        contracts: [
          { abi: DopplerDN404ABI, address, functionName: "unit" },
          { abi: DopplerDN404ABI, address, functionName: "baseURI" },
          { abi: DopplerDN404ABI, address, functionName: "mirrorERC721" },
          { abi: DopplerDN404ABI, address, functionName: "totalNFTSupply" },
        ],
        ...getMulticallOptions(chain),
      });

    const readMirror = mirrorResult?.status === "success"
      ? (mirrorResult.result.toLowerCase() as `0x${string}`)
      : null;
    const dn404MirrorAddress = normalizedMirror ?? readMirror;

    let dn404NftSupply = tokenNftSupplyResult?.status === "success"
      ? tokenNftSupplyResult.result
      : null;

    if (dn404MirrorAddress && dn404MirrorAddress !== zeroAddress) {
      const mirrorSupply = await client.readContract({
        abi: DopplerDN404MirrorABI,
        address: dn404MirrorAddress,
        functionName: "totalSupply",
      }).catch(() => null);

      if (mirrorSupply !== null) {
        dn404NftSupply = mirrorSupply;
      }
    }

    const hasRequiredReads =
      unitResult?.status === "success" &&
      baseUriResult?.status === "success" &&
      dn404MirrorAddress !== null &&
      dn404NftSupply !== null;

    return {
      tokenVariant: "doppler404",
      dn404Unit: unitResult?.status === "success" ? unitResult.result : null,
      dn404NftSupply,
      dn404BaseUri: baseUriResult?.status === "success" ? baseUriResult.result : null,
      dn404MirrorAddress,
      dn404ReadStatus: hasRequiredReads ? "ok" : "retry",
    };
  } catch {
    return {
      tokenVariant: "doppler404",
      dn404Unit: null,
      dn404NftSupply: null,
      dn404BaseUri: null,
      dn404MirrorAddress: normalizedMirror,
      dn404ReadStatus: "retry",
    };
  }
};
