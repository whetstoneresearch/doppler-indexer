import { http, type Transport } from "viem";

/**
 * Creates a custom transport for Monad that falls back to a historical RPC
 * when the primary RPC doesn't support historical eth_call requests.
 * 
 * This is needed because Alchemy's Monad RPC doesn't support historical state queries,
 * but the official Monad Infrastructure RPC does (though it's rate limited).
 * 
 * @param primaryUrl - The primary RPC URL (e.g., Alchemy - fast but no historical calls)
 * @param fallbackUrl - The fallback RPC URL for historical calls (e.g., Monad Infrastructure)
 * @returns A viem transport that automatically falls back for historical calls
 */
export function monadFallbackTransport({
  primaryUrl,
  fallbackUrl,
}: {
  primaryUrl: string;
  fallbackUrl: string;
}): Transport {
  const primaryTransport = http(primaryUrl);
  const fallbackTransport = http(fallbackUrl);

  return ({ chain, retryCount, timeout }) => {
    const primary = primaryTransport({ chain, retryCount, timeout });
    // Use a higher retry count for fallback since it's more reliable for historical data
    const fallback = fallbackTransport({ 
      chain, 
      retryCount: Math.max(retryCount ?? 0, 9), 
      timeout 
    });

    return {
      config: primary.config,
      value: primary.value,
      request: async (request: any) => {
        const isHistoricalEthCall = 
          request.method === "eth_call" && 
          request.params?.[1] && 
          request.params[1] !== "latest" &&
          request.params[1] !== "pending";

        // For historical eth_call requests, try primary first, then fallback
        if (isHistoricalEthCall) {
          try {
            return await primary.request(request);
          } catch (error: any) {
            // Check if it's the "Block requested not found" error from Alchemy
            const isHistoricalBlockError = 
              error?.message?.includes("Block requested not found") ||
              error?.message?.includes("historical state that is not available") ||
              error?.details?.includes("Block requested not found") ||
              error?.details?.includes("historical state that is not available");

            if (isHistoricalBlockError) {
              // Fallback to the historical RPC
              console.log(
                `Falling back to historical RPC for eth_call at block ${request.params?.[1]}`
              );
              return await fallback.request(request);
            }

            // If it's a different error, throw it
            throw error;
          }
        }

        // For all other requests, use primary only
        return await primary.request(request);
      },
    };
  };
}
