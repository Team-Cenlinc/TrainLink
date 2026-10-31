import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, it } from "vitest";
import { dropExpiredQueries } from "./queryClient.ts";

const now = Date.UTC(2026, 9, 31, 12, 0);
const minute = 60_000;

/** 一份本地缓存，只放几个查询：queryKey 第一项与数据读到的时刻。 */
function persisted(queries: [string, number][]): PersistedClient {
  return {
    timestamp: now,
    buster: "",
    clientState: {
      mutations: [],
      queries: queries.map(([key, dataUpdatedAt]) => ({
        queryKey: [key],
        queryHash: JSON.stringify([key]),
        state: { dataUpdatedAt },
      })),
    },
  } as unknown as PersistedClient;
}

const keysOf = (client: PersistedClient) => client.clientState.queries.map((q) => q.queryKey[0]);

describe("dropExpiredQueries", () => {
  it("运营通告只恢复几分钟内的：旧的停运、班次取消可能早已结束", () => {
    const client = persisted([
      ["alerts", now - 3 * minute],
      ["alerts", now - 30 * minute],
    ]);

    expect(
      dropExpiredQueries(client, now).clientState.queries.map((q) => q.state.dataUpdatedAt),
    ).toEqual([now - 3 * minute]);
  });

  it("站牌只恢复 2 分钟内的；目录与 GTFS 索引一天内都可以用", () => {
    const client = persisted([
      ["board", now - 3 * minute],
      ["catalog", now - 6 * 60 * minute],
      ["gtfs", now - 6 * 60 * minute],
      ["catalog", now - 25 * 60 * minute],
    ]);

    expect(keysOf(dropExpiredQueries(client, now))).toEqual(["catalog", "gtfs"]);
  });

  it("列车位置与行程更新只恢复 2 分钟内的：先拿来显示，后台马上刷新", () => {
    const client = persisted([
      ["trains", now - 1 * minute],
      ["tripFeed", now - 1 * minute],
      ["trains", now - 3 * minute],
      ["tripFeed", now - 3 * minute],
    ]);

    expect(keysOf(dropExpiredQueries(client, now))).toEqual(["trains", "tripFeed"]);
  });
});
