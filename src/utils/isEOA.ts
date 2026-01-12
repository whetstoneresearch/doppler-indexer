import { Address, zeroAddress } from "viem";

// Use a minimal type for the client that only requires getCode
interface ClientWithGetCode {
  getCode: (params: { address: Address }) => Promise<string | undefined>;
}

export async function isEOA(client: ClientWithGetCode, address: Address): Promise<boolean> {
  // Zero address is native ETH, not an EOA
  if (address === zeroAddress) return false;

  try {
    const code = await client.getCode({ address });
    return !code || code === "0x";
  } catch (error) {
    // If getCode fails, something is wrong - treat as invalid
    console.warn(`[isEOA] getCode failed for ${address}, treating as EOA:`, error);
    return true;
  }
}
