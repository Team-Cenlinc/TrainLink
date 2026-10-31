import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import {
  removeOldestQuery,
  type PersistedClient,
  type PersistQueryClientOptions,
} from "@tanstack/react-query-persist-client";

/**
 * 全局查询缓存，以及把它存进 localStorage 的设置。
 *
 * TanStack Query 的缓存只在内存里：刷新页面后看板先空白、显示「正在读取站牌…」，
 * 数据回来再整块出现，看起来会闪一下。这里把目录、GTFS 索引和站牌存到本地，
 * 下次打开先显示上次的数据，同时在后台读新的（这些查询恢复后已过 staleTime，会立刻刷新）。
 * 列车位置与行程更新每 15 秒就变，旧数据没有参考价值，不保存。
 */

/** 本地缓存最多保留一天，再旧就当第一次打开。 */
const maxAge = 24 * 60 * 60_000;

/** 站牌只恢复 2 分钟内的：更旧的班次多半已经开走，显示出来反而误导。 */
const boardMaxAge = 2 * 60_000;

/** 要保存的查询，按 queryKey 第一项区分。 */
const persistedKeys = new Set(["catalog", "gtfs", "board"]);

export const queryClient = new QueryClient({
  defaultOptions: {
    // 失败时最多重试 2 次；gcTime 不能短于本地缓存的保留时长，否则恢复出来的数据会被立即回收。
    queries: { retry: 2, gcTime: maxAge },
  },
});

/** JSON 表示不了 Map（GTFS 索引全是 Map），存的时候转成带标记的数组，读的时候再还原。 */
function replacer(_key: string, value: unknown) {
  return value instanceof Map ? { __map: [...value] } : value;
}

function reviver(_key: string, value: unknown) {
  return value !== null && typeof value === "object" && "__map" in value
    ? new Map(value.__map as [unknown, unknown][])
    : value;
}

/** 隐私模式或禁用存储时访问 localStorage 会抛错，此时不做本地缓存。 */
function localStorageOrUndefined(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createAsyncStoragePersister({
    storage: localStorageOrUndefined(),
    key: "trainlink:query-cache",
    throttleTime: 2_000,
    serialize: (client) => JSON.stringify(client, replacer),
    deserialize: (text) => {
      const client = JSON.parse(text, reviver) as PersistedClient;
      const now = Date.now();
      client.clientState.queries = client.clientState.queries.filter(
        (query) => query.queryKey[0] !== "board" || now - query.state.dataUpdatedAt < boardMaxAge,
      );
      return client;
    },
    // 存储空间不够时先丢掉最旧的查询再试。
    retry: removeOldestQuery,
  }),
  maxAge,
  // 缓存的数据格式变了就改这个字符串，旧缓存会被整个丢弃。
  buster: "2",
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) && persistedKeys.has(String(query.queryKey[0])),
  },
};
