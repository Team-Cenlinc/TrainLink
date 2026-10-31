import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import BackIcon from "@material-symbols/svg-400/outlined/arrow_back.svg?react";
import styles from "./Page.module.css";

/**
 * 看板以外各页共用的外壳，与看板同一套结构：顶部纯色标题块（深色 action 色），
 * 下面一块圆角面板压在标题块上；面板里每组是「标题 + 白色卡片」（见 Group）。
 * 运行状态、行程等页面都用它，保证各页看起来是同一个 App。
 */
export function Page({
  title,
  back,
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
  /** 标题下面的内容（概况、起终点卡片等）。 */
  hero?: ReactNode;
  /** 面板内容限宽 760（单栏的列表页，例如行程）；大屏上列表不会拉得太长。 */
  narrow?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <header className={`${styles.hero} ${back ? styles.withBack : ""}`}>
        {back && (
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.back}
              aria-label="返回"
              onClick={() => navigate(-1)}
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
