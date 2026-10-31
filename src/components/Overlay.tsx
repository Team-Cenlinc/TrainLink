import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import styles from "./Overlay.module.css";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /**
   * sheet：手机上从底部滑出的模态面板，背景压暗，可向下甩动关闭；
   * popover：大屏上从触发按钮处展开的卡片，不压暗，点卡片外任意处关闭。
   */
  variant: "sheet" | "popover";
  /** popover 的触发按钮位置：卡片出现在按钮下方，按钮在屏幕右半边时右对齐，否则左对齐。 */
  anchor?: DOMRect;
  /**
   * popover 相对按钮的位置：above-below 出现在按钮上方或下方（适合短内容）；
   * side 出现在按钮旁边，在窗口里垂直居中（适合列车详情这类长内容）。
   */
  placement?: "above-below" | "side";
  /**
   * 固定高度：面板不随内容变高变矮（手机上几乎占满屏幕，大屏最高 640）。
   * 用于有搜索框的面板：搜索结果变少时面板不缩，搜索框就不会跟着移动。
   */
  fill?: boolean;
  /** 面板标题元素的 id，供读屏朗读。 */
  labelledBy: string;
  children: ReactNode;
}

/**
 * 模态面板的外壳：车站信息、车站选择等都用它。
 * 打开时把焦点移到面板里带 data-autofocus 的元素（没有则第一个可聚焦元素），
 * 关闭后焦点回到打开它的按钮；Esc 关闭。
 * 通过 portal 渲染到 body：看板页面是 position: fixed，会形成自己的层叠上下文，
 * 面板留在里面就盖不过浮动标签栏。
 */
/** 打开着的面板数：面板可能叠开，最后一个关上时才解除页面主体的 inert。 */
let openOverlays = 0;

export function Overlay({
  open,
  onClose,
  variant,
  anchor,
  placement = "above-below",
  fill = false,
  labelledBy,
  children,
}: OverlayProps) {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const sheetTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", bounce: 0, duration: 0.4 } as const);
  const popoverTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.2, 0, 0, 1] as const };

  // 打开期间页面主体（#root）设为 inert：Tab 键与读屏软件都不会跑到面板后面去。
  // 跟着 open 走，一关上就解除，不等退出动画放完。
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    openOverlays++;
    root?.setAttribute("inert", "");
    return () => {
      if (--openOverlays === 0) root?.removeAttribute("inert");
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open &&
        (variant === "popover" ? (
          <>
            {/* 透明的点击层：点卡片外任意处关闭，不压暗背景。 */}
            <div key="dismiss" className={styles.dismiss} onClick={onClose} />
            <motion.section
              key="popover"
              className={`${styles.popover} ${fill ? styles.fill : ""}`}
              style={fixedHeight(
                placement === "side" && anchor ? sidePosition(anchor) : popoverPosition(anchor),
                fill,
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              initial={{ opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -6 }}
              transition={popoverTransition}
            >
              <FocusScope onClose={onClose}>{children}</FocusScope>
            </motion.section>
          </>
        ) : (
          <>
            <motion.div
              key="scrim"
              className={styles.scrim}
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={sheetTransition}
            />
            <motion.section
              key="sheet"
              className={`${styles.sheet} ${fill ? styles.fill : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={sheetTransition}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              // 列表在滚动时不触发拖动关闭：只在面板顶部的拖动条区域按下才开始拖动。
              dragListener={false}
              dragControls={dragControls}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) onClose();
              }}
            >
              <div
                className={styles.handle}
                onPointerDown={(event) => dragControls.start(event)}
                aria-hidden
              />
              <FocusScope onClose={onClose}>{children}</FocusScope>
            </motion.section>
          </>
        ))}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * popover 定位：按钮在上半屏时出现在按钮下方，在下半屏时出现在按钮上方（向上展开）；
 * 按钮在右半屏时右对齐，否则左对齐。缩放原点放在靠近按钮的那个角。
 */
function popoverPosition(anchor?: DOMRect): CSSProperties {
  if (!anchor) return { top: 72, right: 24, transformOrigin: "top right" };
  const below = anchor.top + anchor.height / 2 < window.innerHeight / 2;
  const right = anchor.left + anchor.width / 2 > window.innerWidth / 2;
  // 高度不超过按钮这一侧剩下的空间（留 16 px 边距），内容多时在卡片里滚动。
  const maxHeight = below ? window.innerHeight - anchor.bottom - 24 : anchor.top - 24;
  return {
    maxHeight,
    ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }),
    ...(right ? { right: window.innerWidth - anchor.right } : { left: anchor.left }),
    transformOrigin: `${below ? "top" : "bottom"} ${right ? "right" : "left"}`,
  };
}

/** fill 时把弹出卡片的高度定为可用高度（最高 640），不再随内容伸缩。 */
function fixedHeight(position: CSSProperties, fill: boolean): CSSProperties {
  if (!fill) return position;
  const max =
    typeof position.maxHeight === "number" ? `${position.maxHeight}px` : position.maxHeight;
  return { ...position, height: max ? `min(640px, ${max})` : "640px" };
}

/** 放在按钮旁边（按钮在右半边时放左侧），上下各留 16 px，内容不满一屏时垂直居中。 */
function sidePosition(anchor: DOMRect): CSSProperties {
  const right = anchor.left + anchor.width / 2 > window.innerWidth / 2;
  return {
    top: 16,
    bottom: 16,
    height: "fit-content",
    maxHeight: "calc(100dvh - 32px)",
    marginBlock: "auto",
    ...(right ? { right: window.innerWidth - anchor.left + 12 } : { left: anchor.right + 12 }),
    transformOrigin: `${right ? "right" : "left"} center`,
  };
}

/**
 * 只在面板打开期间存在：负责焦点进出与 Esc。
 * onClose 存在 ref 里：调用方每次渲染传一个新函数时，不会重新抢焦点。
 */
function FocusScope({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // 打开它的按钮：渲染时记下（这时焦点还没移进面板）。在副作用里记的话，
  // 严格模式模拟的卸载、重新挂载会把面板里的输入框当成「之前的焦点」。
  const previous = useRef(document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const target =
      ref.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      ref.current?.querySelector<HTMLElement>("button, a, input");
    target?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous.current?.focus();
    };
  }, []);
  return (
    <div ref={ref} className={styles.content}>
      {children}
    </div>
  );
}
