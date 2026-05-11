export interface IndexerEntrypointConfig {
  sources: Iterable<string>;
}

const INDEXER_SOURCES_ENV = "DOPPLER_INDEXER_SOURCES";

export function configureIndexerEntrypoint(config: IndexerEntrypointConfig): void {
  process.env[INDEXER_SOURCES_ENV] = Array.from(config.sources).join(",");
}

export function getConfiguredIndexerSources(): Set<string> | null {
  const configuredSources = process.env[INDEXER_SOURCES_ENV];

  if (configuredSources === undefined) {
    return null;
  }

  return new Set(configuredSources.split(",").filter(Boolean));
}
