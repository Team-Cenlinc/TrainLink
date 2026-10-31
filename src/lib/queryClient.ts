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
 * 数据回来再整块出现，看起来会闪一下。这里把目录、GTFS 索引、站牌、运营通告、
 * 列车位置与行程更新存到本地，下次打开先显示上次的数据，同时在后台读新的
 * （这些查询恢复后已过 staleTime，会立刻刷新）。
 */

/** 本地缓存最多保留一天，再旧就当第一次打开。 */
const maxAge = 24 * 60 * 60_000;

/**
 * 各查询恢复时允许的数据年龄，按 queryKey 第一项；没列出的（目录、GTFS 索引）用 maxAge。
 * 整份缓存的 maxAge 只看最后一次保存的时刻，App 开着时一直在保存，所以每个查询还要单独看
 * 数据是什么时候读到的。
 * - 站牌：更旧的班次多半已经开走，显示出来反而误导；
 * - 运营通告：每分钟刷新，几分钟前的停运、班次取消可能已经结束，不能挂在看板上；
 * - 列车位置与行程更新：每 15 秒就变，只认刚读到的，让运行状态页一打开就有晚点信息可看。
 */
const queryMaxAge: Record<string, number> = {
  board: 2 * 60_000,
  trains: 2 * 60_000,
  tripFeed: 2 * 60_000,
  alerts: 5 * 60_000,
};

/** 去掉本地缓存里超过允许年龄的查询。 */
export function dropExpiredQueries(client: PersistedClient, now: number): PersistedClient {
  client.clientState.queries = client.clientState.queries.filter(
    (query) => now - query.state.dataUpdatedAt < (queryMaxAge[String(query.queryKey[0])] ?? maxAge),
  );
  return client;
}

/** 要保存的查询，按 queryKey 第一项区分。 */
const persistedKeys = new Set(["catalog", "gtfs", "board", "alerts", "trains", "tripFeed"]);

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

/** 本地缓存在 localStorage 里的 key。 */
const cacheKey = "trainlink:query-cache";

/** 清除数据缓存（设置页「清除本地数据」）：删掉本地存的那份，内存里的查询全部重置并重新读取。 */
export async function clearQueryCache() {
  try {
    localStorage.removeItem(cacheKey);
  } catch {
    // 存储不可用时本来就没有本地缓存。
  }
  await queryClient.resetQueries();
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createAsyncStoragePersister({
    storage: localStorageOrUndefined(),
    key: cacheKey,
    throttleTime: 2_000,
    serialize: (client) => JSON.stringify(client, replacer),
    deserialize: (text) =>
      dropExpiredQueries(JSON.parse(text, reviver) as PersistedClient, Date.now()),
    // 存储空间不够时先丢掉最旧的查询再试。
    retry: removeOldestQuery,
  }),
  maxAge,
  // 缓存的数据格式变了就改这个字符串，旧缓存会被整个丢弃。
  // 3：通告涉及的线路从 lineCodes 改为带运营方的 lines。
  buster: "3",
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) && persistedKeys.has(String(query.queryKey[0])),
  },
};
