/**
 * 有支线的线路：从各班车的站序推出主干与支线。纯函数，不涉及 React。
 * 例如大都会线在 SPB 分成往 OFL、往 HHU 两支，最长的一班车只走其中一支，单取它会把另一支整个漏掉。
 */

/** 线路形状：一条主干（按站序），加上从主干某站分出的几段支线。 */
export interface LineShape {
  main: string[];
  branches: LineBranch[];
}

/**
 * 一段支线：从主干上的 junction 站分出，stops 由近及远（不含 junction）。
 * 绕行一段又并回主干时，rejoin 是并回的那一站（也在主干上）。
 */
export interface LineBranch {
  junction: string;
  stops: string[];
  rejoin?: string;
}

/**
 * 一条线路的几种停站方式（站码序列），由这条线上各班车的站序得出：
 * 往返两个方向算同一种；站全在另一种里的（快车、区间车）不另算。车多的排在前面。
 * 各种方式朝同一个方向：以车最多的那种为准，共有的站先后一致。
 */
export function linePatterns(trips: string[][]): string[][] {
  const counted = new Map<string, { stops: string[]; trips: number }>();
  for (const stops of trips) {
    if (stops.length < 2) continue;
    const forward = stops.join(",");
    const entry = counted.get(forward) ?? counted.get([...stops].reverse().join(","));
    if (entry) entry.trips++;
    else counted.set(forward, { stops, trips: 1 });
  }
  const all = [...counted.values()];
  const kept = all.filter(
    (p) =>
      !all.some(
        (other) =>
          other !== p &&
          other.stops.length > p.stops.length &&
          p.stops.every((code) => other.stops.includes(code)),
      ),
  );
  kept.sort((a, b) => b.trips - a.trips || b.stops.length - a.stops.length);

  const oriented: string[][] = [];
  for (const { stops } of kept) {
    oriented.push(reversedAgainst(stops, oriented) ? [...stops].reverse() : stops);
  }
  return oriented;
}

/** 与已经定好方向的几种方式比，这一种是不是反着的：看第一种与它共有两站以上的方式里，共有站的先后。 */
function reversedAgainst(stops: string[], oriented: string[][]): boolean {
  for (const reference of oriented) {
    const shared = stops.filter((code) => reference.includes(code));
    if (shared.length < 2) continue;
    return reference.indexOf(shared[0]!) > reference.indexOf(shared[1]!);
  }
  return false;
}

/**
 * 以某站为准的线路形状：主干是本站所在、车最多的那种停站方式（本站不在线上时取车最多的）；
 * 其余方式里主干没有的那几段，各自从相邻的主干站分出，成为支线。
 * 支线都在主干起点那头分出时整条线倒过来，让各支都往终点方向分开：
 * 往起点方向的车（线路图左列）都开往共用的那一头，往终点方向的车（右列）分往各支。
 * @param patterns linePatterns 的结果。
 */
export function lineShape(patterns: string[][], stationCode?: string): LineShape {
  const { shape, towardsStart } = shapeOf(patterns, stationCode);
  if (towardsStart > 0 && towardsStart === shape.branches.length) {
    return shapeOf(
      patterns.map((p) => [...p].reverse()),
      stationCode,
    ).shape;
  }
  return shape;
}

/** lineShape 的一次拼接，不调方向；towardsStart 是在主干起点那头分出（顺着站序在分岔站之前）的支线数。 */
function shapeOf(patterns: string[][], stationCode?: string) {
  const main =
    patterns.find((p) => stationCode !== undefined && p.includes(stationCode)) ?? patterns[0] ?? [];
  const covered = new Set(main);
  const branches: LineBranch[] = [];
  let towardsStart = 0;
  for (const pattern of patterns) {
    let start = -1;
    for (let i = 0; i <= pattern.length; i++) {
      const inside = i < pattern.length && !covered.has(pattern[i]!);
      if (inside && start < 0) start = i;
      if (inside || start < 0) continue;
      // pattern[start..i-1] 这一段主干没有：前面接着主干就从前面分出，否则从后面分出（倒过来由近及远）；
      // 两头都接着主干时是绕行一段又并回，记下并回的站。
      const run = pattern.slice(start, i);
      const before = pattern[start - 1];
      const after = pattern[i];
      const junction = before ?? after;
      if (junction !== undefined) {
        branches.push(
          before !== undefined && after !== undefined
            ? { junction, stops: run, rejoin: after }
            : { junction, stops: before !== undefined ? run : run.reverse() },
        );
        if (before === undefined) towardsStart++;
        run.forEach((code) => covered.add(code));
      }
      start = -1;
    }
  }
  return { shape: { main, branches }, towardsStart };
}

/** 全线车站：主干在前，各支线依次接在后面。 */
export function allStations(shape: LineShape): string[] {
  return [...shape.main, ...shape.branches.flatMap((b) => b.stops)];
}
