import baseContracts from "./base";
import inkContracts from "./ink";
import unichainContracts from "./unichain";

export default {
  base: baseContracts,
  ink: inkContracts,
  unichain: unichainContracts,
} as const;


