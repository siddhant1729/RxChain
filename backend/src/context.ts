import type { AppConfig } from "./config";
import type { AppContext } from "./lib/context";
import { ChainService } from "./services/chain";
import { openDatabase } from "./services/db";
import { DocumentStore } from "./services/documents";
import { EventStore } from "./services/eventStore";
import { EventIndexer } from "./services/indexer";

/** Wires all services together. Call `close()` to release resources. */
export function createContext(config: AppConfig): AppContext & { close: () => void } {
  const db = openDatabase(config.databaseFile);
  const chain = new ChainService(config.rpcUrl, config.contractFile, config.indexerPollMs);
  chain.loadDeployment();
  const events = new EventStore(db);
  const documents = new DocumentStore(db, config.uploadsDir);
  const indexer = new EventIndexer(chain, events, config.indexerPollMs);
  return {
    config,
    chain,
    events,
    documents,
    indexer,
    close: () => {
      indexer.stop();
      chain.close();
      db.close();
    },
  };
}
