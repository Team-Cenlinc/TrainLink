import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import ChevronIcon from "@material-symbols/svg-400/outlined/chevron_right.svg?react";
import { shouldResume, useActiveRide } from "./rideStore.ts";
import { useRide } from "./useRide.ts";
import styles from "./RideBar.module.css";

/** 打开 App 后只自动回 GO 一次：之后在 App 里回到看板是用户自己点的，不再跳。 */
let resumed = false;

/**
 * 乘车中迷你条：正在跟一趟 GO 时，在标签栏上方显示此刻该做什么（「还有 2 站 · 3 分」），
 * 点一下回到 GO。GO 页面本身不显示。
 * 重新打开 App（系统把网页 App 关掉后，从主屏打开总是落在看板）时，还没到站就直接回到 GO。
 * 这趟的记录过了结束时刻自己消失（见 rideStore.ts）。
 */
export function RideBar() {
  const active = useActiveRide();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (resumed) return;
    resumed = true;
    // 还没到站才回 GO；到了就留在看板（迷你条还在，点了能回去）。
    if (location.pathname === "/" && shouldResume(active, Date.now())) navigate(active!.href);
    // 只在打开 App 的第一次渲染时看一次。
  }, []);

  if (!active || location.pathname === "/trip/go") return null;
  return <Bar href={active.href} />;
}

function Bar({ href }: { href: string }) {
  const { text, status } = useRide(new URLSearchParams(href.split("?")[1] ?? ""));
  // 显示时页面底部多让出迷你条的高度（global.css 的 data-ride-bar），最后一项不被盖住。
  useEffect(() => {
    document.documentElement.dataset.rideBar = "";
    return () => {
      delete document.documentElement.dataset.rideBar;
    };
  }, []);
  return (
    <Link to={href} className={styles.bar} aria-label={`乘车中：${text?.title ?? ""}，回到乘车 GO`}>
      <span
        className={`${styles.dot} ${status?.kind === "arrived" ? styles.done : ""}`}
        aria-hidden
      />
      <span className={styles.text}>
        <span className={styles.title}>{text?.title ?? "乘车中"}</span>
        {text && <span className={styles.detail}>{text.detail}</span>}
      </span>
      <span className={styles.go} aria-hidden>
        GO
      </span>
      <ChevronIcon className={styles.chevron} aria-hidden />
    </Link>
  );
}
