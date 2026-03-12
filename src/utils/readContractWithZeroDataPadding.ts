import {
  decodeFunctionResult,
  encodeFunctionData,
  getAbiItem,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hex,
  type ReadContractParameters,
  type ReadContractReturnType,
} from "viem";

type BlockOptions = {
  cache?: "immutable";
  blockNumber?: bigint;
};

type AbiParameterLike = {
  type: string;
  components?: readonly AbiParameterLike[];
};

type CallCapableClient = {
  call: (args: any) => Promise<{ data: Hex | undefined }>;
};

const ZERO_WORD_HEX_LENGTH = 64;
const ARRAY_TYPE_REGEX = /^(.*)\[(.*?)\]$/;

const getStaticWordCount = (parameter: AbiParameterLike): number | null => {
  const arrayMatch = parameter.type.match(ARRAY_TYPE_REGEX);
  if (arrayMatch) {
    const [, baseType, length] = arrayMatch;
    if (!baseType || length === undefined || length === "") return null;

    const childCount = getStaticWordCount({
      ...parameter,
      type: baseType,
    });

    return childCount === null ? null : Number(length) * childCount;
  }

  if (parameter.type === "tuple") {
    if (!parameter.components) return null;

    let total = 0;
    for (const component of parameter.components) {
      const componentCount = getStaticWordCount(component);
      if (componentCount === null) return null;
      total += componentCount;
    }

    return total;
  }

  if (parameter.type === "bytes" || parameter.type === "string") {
    return null;
  }

  return 1;
};

const getZeroPaddedResultData = <
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi, "pure" | "view">,
  const args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
>({
  abi,
  functionName,
  args,
}: {
  abi: abi;
  functionName: functionName;
  args?: args;
}): Hex | undefined => {
  const abiItem = getAbiItem({
    abi: abi as Abi,
    args: args as readonly unknown[] | undefined,
    name: functionName as string,
  }) as { type: string; outputs?: readonly AbiParameterLike[] } | undefined;
  if (!abiItem || abiItem.type !== "function" || !abiItem.outputs) {
    return undefined;
  }

  let totalWords = 0;
  for (const output of abiItem.outputs) {
    const wordCount = getStaticWordCount(output);
    if (wordCount === null) return undefined;
    totalWords += wordCount;
  }

  return `0x${"0".repeat(totalWords * ZERO_WORD_HEX_LENGTH)}` as Hex;
};

/**
 * Some RPC providers truncate all-zero static return values to `0x`.
 * Use a raw `eth_call` and pad the response back to the expected static size
 * before ABI decoding so initializer selection can distinguish zero state from a failed call.
 */
export const readContractWithZeroDataPadding = async <
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi, "pure" | "view">,
  const args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
>(
  client: CallCapableClient,
  parameters: Omit<
    ReadContractParameters<abi, functionName, args>,
    "blockTag"
  > &
    BlockOptions,
): Promise<ReadContractReturnType<abi, functionName, args>> => {
  const { abi, address, args, functionName, ...rest } = parameters;

  const calldata = encodeFunctionData({
    abi,
    args,
    functionName,
  } as any);

  const { data } = await client.call({
    ...rest,
    batch: false,
    data: calldata,
    to: address as Address,
  });

  const normalizedData =
    data && data !== "0x"
      ? data
      : getZeroPaddedResultData({
          abi,
          functionName,
          args: args as any,
        }) ??
        data ??
        "0x";

  return decodeFunctionResult({
    abi,
    args,
    functionName,
    data: normalizedData,
  } as any) as ReadContractReturnType<abi, functionName, args>;
};
