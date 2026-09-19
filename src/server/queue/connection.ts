import IORedis from "ioredis";
import { getEnv } from "../env";

let connection: IORedis | undefined;

/** BullMQ requires this exact option on the shared ioredis connection. */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const FLOW_EXECUTION_QUEUE = "flow-execution";
