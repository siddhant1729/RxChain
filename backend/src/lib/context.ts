import type { AppConfig } from "../config";
import type { ChainService } from "../services/chain";
import type { DocumentStore } from "../services/documents";
import type { EventStore } from "../services/eventStore";
import type { EventIndexer } from "../services/indexer";

export interface AppContext {
  config: AppConfig;
  chain: ChainService;
  events: EventStore;
  documents: DocumentStore;
  indexer: EventIndexer;
}
