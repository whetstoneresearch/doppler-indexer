export const DopplerHookInitializerABI = [
  {
    type: "constructor",
    inputs: [
      { name: "airlock_", type: "address", internalType: "address" },
      {
        name: "poolManager_",
        type: "address",
        internalType: "contract IPoolManager",
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
    name: "delegateAuthority",
    inputs: [
      { name: "delegatedAuthority", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "exitLiquidity",
    inputs: [{ name: "asset", type: "address", internalType: "address" }],
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
    name: "getAuthority",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "authority", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBeneficiaries",
    inputs: [{ name: "asset", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct BeneficiaryData[]",
        components: [
          { name: "beneficiary", type: "address", internalType: "address" },
          { name: "shares", type: "uint96", internalType: "uint96" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPositions",
    inputs: [{ name: "asset", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct Position[]",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          { name: "liquidity", type: "uint128", internalType: "uint128" },
          { name: "salt", type: "bytes32", internalType: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getState",
    inputs: [{ name: "asset", type: "address", internalType: "address" }],
    outputs: [
      { name: "numeraire", type: "address", internalType: "address" },
      {
        name: "beneficiaries",
        type: "tuple[]",
        internalType: "struct BeneficiaryData[]",
        components: [
          { name: "beneficiary", type: "address", internalType: "address" },
          { name: "shares", type: "uint96", internalType: "uint96" },
        ],
      },
      {
        name: "adjustedCurves",
        type: "tuple[]",
        internalType: "struct Curve[]",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          { name: "weight", type: "uint256", internalType: "uint256" },
        ],
      },
      {
        name: "totalTokensOnBondingCurve",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "dopplerHook", type: "address", internalType: "address" },
      {
        name: "graduationDopplerHookCalldata",
        type: "bytes",
        internalType: "bytes",
      },
      { name: "status", type: "uint8", internalType: "enum PoolStatus" },
      {
        name: "poolKey",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          { name: "currency0", type: "address", internalType: "Currency" },
          { name: "currency1", type: "address", internalType: "Currency" },
          { name: "fee", type: "uint24", internalType: "uint24" },
          { name: "tickSpacing", type: "int24", internalType: "int24" },
          { name: "hooks", type: "address", internalType: "contract IHooks" },
        ],
      },
      { name: "farTick", type: "int24", internalType: "int24" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "graduate",
    inputs: [{ name: "asset", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "asset", type: "address", internalType: "address" },
      { name: "numeraire", type: "address", internalType: "address" },
      {
        name: "totalTokensOnBondingCurve",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "", type: "bytes32", internalType: "bytes32" },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isDopplerHookEnabled",
    inputs: [
      { name: "dopplerHook", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "flags", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
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
    type: "function",
    name: "setDopplerHook",
    inputs: [
      { name: "asset", type: "address", internalType: "address" },
      { name: "dopplerHook", type: "address", internalType: "address" },
      {
        name: "onInitializationCalldata",
        type: "bytes",
        internalType: "bytes",
      },
      { name: "onGraduationCalldata", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setDopplerHookState",
    inputs: [
      { name: "dopplerHooks", type: "address[]", internalType: "address[]" },
      { name: "flags", type: "uint256[]", internalType: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateDynamicLPFee",
    inputs: [
      { name: "asset", type: "address", internalType: "address" },
      { name: "lpFee", type: "uint24", internalType: "uint24" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
  {
    type: "event",
    name: "DelegateAuthority",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "authority",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Graduate",
    inputs: [
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Lock",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "beneficiaries",
        type: "tuple[]",
        indexed: false,
        internalType: "struct BeneficiaryData[]",
        components: [
          { name: "beneficiary", type: "address", internalType: "address" },
          { name: "shares", type: "uint96", internalType: "uint96" },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ModifyLiquidity",
    inputs: [
      {
        name: "key",
        type: "tuple",
        indexed: false,
        internalType: "struct PoolKey",
        components: [
          { name: "currency0", type: "address", internalType: "Currency" },
          { name: "currency1", type: "address", internalType: "Currency" },
          { name: "fee", type: "uint24", internalType: "uint24" },
          { name: "tickSpacing", type: "int24", internalType: "int24" },
          { name: "hooks", type: "address", internalType: "contract IHooks" },
        ],
      },
      {
        name: "params",
        type: "tuple",
        indexed: false,
        internalType: "struct IPoolManager.ModifyLiquidityParams",
        components: [
          { name: "tickLower", type: "int24", internalType: "int24" },
          { name: "tickUpper", type: "int24", internalType: "int24" },
          { name: "liquidityDelta", type: "int256", internalType: "int256" },
          { name: "salt", type: "bytes32", internalType: "bytes32" },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetDopplerHook",
    inputs: [
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "dopplerHook",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetDopplerHookState",
    inputs: [
      {
        name: "dopplerHook",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "flag",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Swap",
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "poolKey",
        type: "tuple",
        indexed: true,
        internalType: "struct PoolKey",
        components: [
          { name: "currency0", type: "address", internalType: "Currency" },
          { name: "currency1", type: "address", internalType: "Currency" },
          { name: "fee", type: "uint24", internalType: "uint24" },
          { name: "tickSpacing", type: "int24", internalType: "int24" },
          { name: "hooks", type: "address", internalType: "contract IHooks" },
        ],
      },
      {
        name: "poolId",
        type: "bytes32",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "params",
        type: "tuple",
        indexed: false,
        internalType: "struct IPoolManager.SwapParams",
        components: [
          { name: "zeroForOne", type: "bool", internalType: "bool" },
          { name: "amountSpecified", type: "int256", internalType: "int256" },
          {
            name: "sqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
        ],
      },
      {
        name: "amount0",
        type: "int128",
        indexed: false,
        internalType: "int128",
      },
      {
        name: "amount1",
        type: "int128",
        indexed: false,
        internalType: "int128",
      },
      {
        name: "hookData",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "ArrayLengthsMismatch", inputs: [] },
  {
    type: "error",
    name: "CannotMigrateInsufficientTick",
    inputs: [
      { name: "targetTick", type: "int24", internalType: "int24" },
      { name: "currentTick", type: "int24", internalType: "int24" },
    ],
  },
  { type: "error", name: "CannotMigratePoolNoProvidedDopplerHook", inputs: [] },
  { type: "error", name: "DopplerHookNotEnabled", inputs: [] },
  {
    type: "error",
    name: "LPFeeTooHigh",
    inputs: [
      { name: "maxFee", type: "uint24", internalType: "uint24" },
      { name: "fee", type: "uint256", internalType: "uint256" },
    ],
  },
  { type: "error", name: "OnlyInitializer", inputs: [] },
  { type: "error", name: "SenderNotAirlock", inputs: [] },
  { type: "error", name: "SenderNotAirlockOwner", inputs: [] },
  { type: "error", name: "SenderNotAuthorized", inputs: [] },
  { type: "error", name: "UnreachableFarTick", inputs: [] },
  {
    type: "error",
    name: "WrongPoolStatus",
    inputs: [
      { name: "expected", type: "uint8", internalType: "enum PoolStatus" },
      { name: "actual", type: "uint8", internalType: "enum PoolStatus" },
    ],
  },
] as const;
