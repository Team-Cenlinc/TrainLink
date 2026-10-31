import { useQuery } from "@tanstack/react-query";
import { fetchGtfsFiles } from "@/lib/gtfs.ts";
import { buildTimetable } from "./timetable.ts";

/**
 * 行程规划的时刻表，由 GTFS 包里的车次、站点时刻与换乘生成。
 * 约 1.9 万条连接，不存进本地缓存（见 lib/queryClient.ts），每次打开从 GTFS 包重新生成，约 0.1 秒。
 */
export function useTimetable(serverId: string) {
  return useQuery({
    queryKey: ["timetable", serverId],
    queryFn: async ({ signal }) => {
      const files = await fetchGtfsFiles(
        serverId,
        ["trips.txt", "stop_times.txt", "transfers.txt"],
        signal,
      );
      return buildTimetable({
        trips: files["trips.txt"],
        stopTimes: files["stop_times.txt"],
        transfers: files["transfers.txt"],
      });
    },
    staleTime: 5 * 60_000,
  });
}
