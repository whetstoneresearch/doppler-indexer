import { onIndexerEvent } from "./entrypoint";
import { RehypeDopplerHookInitializerABI } from "@app/abis";
import {
  setRehypeFeeBeneficiaries,
  transferRehypeFeeBeneficiary,
} from "./shared/entities/rehype/rehypeFeeBeneficiary";

// Fires during onInitialization, at a lower log index than the corresponding
// DopplerHookInitializer:Create in the same tx — the pool row does not exist
// yet, so this handler must not depend on the pool entity. Fee beneficiaries
// are not enumerable on-chain; this event is the only source of truth.
onIndexerEvent("RehypeDopplerHookInitializer:FeeBeneficiariesSet", async ({ event, context }) => {
  const { poolId, beneficiaries } = event.args;
  const hookAddress = event.log.address;

  const [asset] = await context.client.readContract({
    abi: RehypeDopplerHookInitializerABI,
    address: hookAddress,
    functionName: "getPoolInfo",
    args: [poolId],
  });

  await setRehypeFeeBeneficiaries({
    poolId,
    assetId: asset,
    initializer: hookAddress,
    beneficiaries,
    timestamp: event.block.timestamp,
    context,
  });
});

onIndexerEvent("RehypeDopplerHookInitializer:UpdateBeneficiary", async ({ event, context }) => {
  const { poolId, oldBeneficiary, newBeneficiary } = event.args;

  await transferRehypeFeeBeneficiary({
    poolId,
    oldBeneficiary,
    newBeneficiary,
    timestamp: event.block.timestamp,
    context,
  });
});
