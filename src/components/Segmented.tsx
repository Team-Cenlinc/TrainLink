import type { CSSProperties } from "react";
import styles from "./Segmented.module.css";

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/**
 * 分段控制。这是一个「受控组件」：选中值由父组件通过 value 传入，
 * 点击时只调用 onChange，由父组件决定是否更新。
 *
 * 选中项下面的白底是轨道里的一块滑块，按选中项的序号横向平移（CSS 过渡，见样式）。
 * 不靠测量位置做布局动画：分段控制所在的面板自己也在移动时（看板切到「线路」会推上面板），
 * 滑块只会横向滑，不会跟着多出一段竖直位移而抖动。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const style = { "--count": options.length, "--index": index } as CSSProperties;
  return (
    <div className={styles.track} role="tablist" aria-label={label} style={style}>
      <span className={styles.thumb} aria-hidden />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`${styles.option} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
