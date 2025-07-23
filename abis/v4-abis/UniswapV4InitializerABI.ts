export const UniswapV4InitializerABI = [
  {
    type: "constructor",
    inputs: [
      { name: "airlock_", type: "address", internalType: "address" },
      {
        name: "poolManager_",
        type: "address",
        internalType: "contract IPoolManager",
      },
      {
        name: "deployer_",
        type: "address",
        internalType: "contract DopplerDeployer",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "airlock",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deployer",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "contract DopplerDeployer" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "exitLiquidity",
    inputs: [{ name: "hook", type: "address", internalType: "address" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160", internalType: "uint160" },
      { name: "token0", type: "address", internalType: "address" },
      { name: "fees0", type: "uint128", internalType: "uint128" },
      { name: "balance0", type: "uint128", internalType: "uint128" },
      { name: "token1", type: "address", internalType: "address" },
      { name: "fees1", type: "uint128", internalType: "uint128" },
      { name: "balance1", type: "uint128", internalType: "uint128" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "asset", type: "address", internalType: "address" },
      { name: "numeraire", type: "address", internalType: "address" },
      { name: "numTokensToSell", type: "uint256", internalType: "uint256" },
      { name: "salt", type: "bytes32", internalType: "bytes32" },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "poolManager",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "contract IPoolManager" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Create",
    inputs: [
      {
        name: "poolOrHook",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "numeraire",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "InvalidTokenOrder", inputs: [] },
  { type: "error", name: "OnlyAirlock", inputs: [] },
] as const;
