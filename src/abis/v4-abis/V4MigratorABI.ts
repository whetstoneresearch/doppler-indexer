export const V4MigratorABILegacy = [
  {
    type: "function",
    name: "getAssetData",
    inputs: [
      { name: "token0", type: "address", internalType: "address" },
      { name: "token1", type: "address", internalType: "address" }
    ],
    outputs: [
      {
        name: "data",
        type: "tuple",
        internalType: "struct AssetData",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            internalType: "struct PoolKey",
            components: [
              { name: "currency0", type: "address", internalType: "Currency" },
              { name: "currency1", type: "address", internalType: "Currency" },
              { name: "fee", type: "uint24", internalType: "uint24" },
              { name: "tickSpacing", type: "int24", internalType: "int24" },
              { name: "hooks", type: "address", internalType: "IHooks" }
            ]
          },
          { name: "lockDuration", type: "uint32", internalType: "uint32" }
        ]
      }
    ],
    stateMutability: "view"
  },
] as const;

export const V4MigratorABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "airlock_",
        "type": "address"
      },
      {
        "internalType": "contract IPoolManager",
        "name": "poolManager_",
        "type": "address"
      },
      {
        "internalType": "contract PositionManager",
        "name": "positionManager_",
        "type": "address"
      },
      {
        "internalType": "contract StreamableFeesLocker",
        "name": "locker_",
        "type": "address"
      },
      {
        "internalType": "contract IHooks",
        "name": "migratorHook_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "InvalidProtocolOwnerBeneficiary",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint96",
        "name": "required",
        "type": "uint96"
      },
      {
        "internalType": "uint96",
        "name": "provided",
        "type": "uint96"
      }
    ],
    "name": "InvalidProtocolOwnerShares",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShares",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidTotalShares",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SenderNotAirlock",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TickOutOfRange",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "int24",
        "name": "tickSpacing",
        "type": "int24"
      }
    ],
    "name": "TickSpacingTooLarge",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "int24",
        "name": "tickSpacing",
        "type": "int24"
      }
    ],
    "name": "TickSpacingTooSmall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnorderedBeneficiaries",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroLiquidity",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint160",
        "name": "sqrtPriceX96",
        "type": "uint160"
      },
      {
        "indexed": false,
        "internalType": "int24",
        "name": "lowerTick",
        "type": "int24"
      },
      {
        "indexed": false,
        "internalType": "int24",
        "name": "upperTick",
        "type": "int24"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "liquidity",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "reserves0",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "reserves1",
        "type": "uint256"
      }
    ],
    "name": "Migrate",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "airlock",
    "outputs": [
      {
        "internalType": "contract Airlock",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token1",
        "type": "address"
      }
    ],
    "name": "getAssetData",
    "outputs": [
      {
        "components": [
          {
            "internalType": "Currency",
            "name": "currency0",
            "type": "address"
          },
          {
            "internalType": "Currency",
            "name": "currency1",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "int24",
            "name": "tickSpacing",
            "type": "int24"
          },
          {
            "internalType": "contract IHooks",
            "name": "hooks",
            "type": "address"
          }
        ],
        "internalType": "struct PoolKey",
        "name": "poolKey",
        "type": "tuple"
      },
      {
        "internalType": "uint32",
        "name": "lockDuration",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "numeraire",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "liquidityMigratorData",
        "type": "bytes"
      }
    ],
    "name": "initialize",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "locker",
    "outputs": [
      {
        "internalType": "contract StreamableFeesLocker",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint160",
        "name": "sqrtPriceX96",
        "type": "uint160"
      },
      {
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "migrate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "liquidity",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "migratorHook",
    "outputs": [
      {
        "internalType": "contract IHooks",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poolManager",
    "outputs": [
      {
        "internalType": "contract IPoolManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "positionManager",
    "outputs": [
      {
        "internalType": "contract PositionManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
] as const;