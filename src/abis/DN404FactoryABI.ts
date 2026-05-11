export const DN404FactoryABI = [
  {
    type: "event",
    name: "DN404Created",
    inputs: [
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "collection", type: "address", indexed: true, internalType: "address" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "initialSupply", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;
