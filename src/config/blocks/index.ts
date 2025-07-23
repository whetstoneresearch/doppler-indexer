import baseBlocks from "./base";
import inkBlocks from "./ink";
import unichainBlocks from "./unichain";

export default {
  base: baseBlocks,
  ink: inkBlocks,
  unichain: unichainBlocks,
} as const;