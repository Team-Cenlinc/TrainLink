import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import BackIcon from "@material-symbols/svg-400/outlined/arrow_back.svg?react";
import { useDocumentTitle } from "@/lib/useDocumentTitle.ts";
import { useLayout } from "@/lib/useLayout.ts";
import { useTopColor } from "@/lib/useTopColor.ts";
import styles from "./Page.module.css";

/**
 * 看板以外各页共用的外壳，与看板同一套结构：顶部纯色标题块（深色 action 色），
 * 下面一块圆角面板压在标题块上；面板里每组是「标题 + 白色卡片」（见 Group）。
 * 运行状态、行程等页面都用它，保证各页看起来是同一个 App。
 */
export function Page({
  title,
  back,
  backTo = "/",
  hero,
  narrow = false,
  children,
}: {
  /** 大标题：一级页面是页面名；二级页面是内容本身（例如「蒲塘桥港 → 南渡」）。 */
  title: ReactNode;
  /**
   * 二级页面的页面名（例如「行程方案」）：和返回按钮一起放在工具栏那一行，小字；
   * 大标题留给内容。省略时是一级页面，没有返回按钮。
   */
  back?: string;
  /**
   * 返回时没有上一页（从分享链接或主屏直接打开这一页）就去这里，不离开 App。默认看板。
   */
  backTo?: string;
  /** 标题下面的内容（概况、起终点卡片等）。 */
  hero?: ReactNode;
  /** 面板内容限宽 760（单栏的列表页，例如行程）；大屏上列表不会拉得太长。 */
  narrow?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const layout = useLayout();
  // 手机与平板：整页固定、在自己里面滚动（同看板），文档锁住（data-fixed-page，见 global.css）。
  // Safari 底部工具栏取贴底固定元素的颜色，这里是面板灰（见 Page.module.css）。
  // 桌面有侧边栏，保持普通的文档滚动。
  const fixed = layout !== "wide";
  // 标签页标题：大标题是文字时用它，否则（起终点、时刻等内容）用工具栏上的页面名。
  useDocumentTitle(typeof title === "string" ? title : back);
  // 状态栏与标题块同色（见 useTopColor）。
  useTopColor("var(--hero)");
  return (
    <div
      className={`${styles.page} ${fixed ? styles.fixed : ""} ${
        layout === "compact" ? "no-scrollbar" : ""
      }`}
      data-fixed-page={fixed || undefined}
    >
      <header className={`${styles.hero} ${back ? styles.withBack : ""}`}>
        {back && (
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.back}
              aria-label="返回"
              // React Router 在 history.state 里记着这是 App 里的第几页：第 0 页没有可退的。
              onClick={() =>
                (window.history.state as { idx?: number } | null)?.idx
                  ? navigate(-1)
                  : navigate(backTo, { replace: true })
              }
            >
              <BackIcon aria-hidden />
            </button>
            <span className={styles.pageName}>{back}</span>
          </div>
        )}
        <h1 className={`${styles.title} ${back ? styles.subTitle : ""}`}>{title}</h1>
        {hero}
      </header>
      <main className={styles.panel}>
        {narrow ? <div className={styles.narrow}>{children}</div> : children}
      </main>
    </div>
  );
}

/** 面板里的一组：标题（可带数量，按基线对齐）加一张白色卡片；卡片里每个子元素是一行。 */
export function Group({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  /** 标题右侧的小按钮或说明。 */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <h2 className={styles.heading}>
        <span className={styles.headingText}>{title}</span>
        {count !== undefined && <span className={`${styles.count} num`}>{count}</span>}
        {action && <span className={styles.action}>{action}</span>}
      </h2>
      <ul className={styles.card}>{children}</ul>
    </section>
  );
}

/** 面板里的提示文字（读取中、出错、没有结果）。 */
export function PanelMessage({ children }: { children: ReactNode }) {
  return <p className={styles.message}>{children}</p>;
}
