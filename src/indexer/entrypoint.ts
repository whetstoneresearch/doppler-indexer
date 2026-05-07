import { ponder } from "ponder:registry";
import { getConfiguredIndexerSources } from "./entrypointConfig";

function getSourceName(eventName: string): string {
  const separatorIndex = eventName.indexOf(":");

  if (separatorIndex === -1) {
    return eventName;
  }

  return eventName.slice(0, separatorIndex);
}

function shouldRegister(eventName: string): boolean {
  const configuredSources = getConfiguredIndexerSources();

  if (configuredSources === null) {
    return true;
  }

  return configuredSources.has(getSourceName(eventName));
}

export const onIndexerEvent = ((eventName, handler) => {
  if (shouldRegister(String(eventName))) {
    return ponder.on(eventName as never, handler as never);
  }
}) as typeof ponder.on;
