import styles from "./PlaceholderPage.module.css";

/** 尚未实现的标签页先显示大标题与一句说明，保证导航可以走通。 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>这一页正在制作中。</p>
    </main>
  );
}
