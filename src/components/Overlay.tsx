import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  const keyboard = useKeyboardInset(open && variant === "sheet");
  const popoverTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.2, 0, 0, 1] as const };

  // 打开期间页面主体（#root）设为 inert：Tab 键与读屏软件都不会跑到面板后面去；
  // 文档也锁住不滚动、不回弹（global.css 的 data-overlay-open），点输入框时背后的页面不被带着走。
  // 跟着 open 走，一关上就解除，不等退出动画放完。
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    openOverlays++;
    root?.setAttribute("inert", "");
    document.documentElement.dataset.overlayOpen = "";
    return () => {
      if (--openOverlays > 0) return;
      root?.removeAttribute("inert");
      delete document.documentElement.dataset.overlayOpen;
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
              style={keyboard}
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
 * 手机键盘占掉的高度与此刻可见区域的高度（visualViewport），交给底部面板的 CSS 变量。
 * iOS 弹出键盘时不缩小布局视口，而是把可见区域推上去：固定在底部的面板顶部（搜索框）
 * 被推出屏幕，结果列表又被键盘盖住。面板据此把底边抬到键盘上沿、高度收进可见区域。
 * 只在面板打开时监听；底边差不到 50 px（Safari 工具栏伸缩）或页面被双指放大时不算键盘。
 */
function useKeyboardInset(active: boolean): CSSProperties | undefined {
  const [inset, setInset] = useState<{ bottom: number; height: number }>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const update = () => {
      const bottom = window.innerHeight - viewport.height - viewport.offsetTop;
      const keyboardOpen = bottom > 50 && viewport.scale < 1.01;
      setInset(keyboardOpen ? { bottom, height: viewport.height } : undefined);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setInset(undefined);
    };
  }, [active]);
  return inset
    ? ({
        "--keyboard-bottom": `${inset.bottom}px`,
        "--visible-height": `${inset.height}px`,
      } as CSSProperties)
    : undefined;
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
/** iOS 与 iPadOS（iPadOS 13 起自称 Mac，靠触点数区分）。 */
const isIOS =
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/** 会弹出键盘的输入框。 */
const textTypes = new Set(["text", "search", "email", "number", "tel", "url", "password"]);

/**
 * 聚焦而不让 iOS 把整页往上推：iOS 弹出键盘时会平移整个可见区域，好让输入框露在键盘上面，
 * 页面、标签栏、面板一起被顶上去。它判断要不要平移时看的是输入框此刻的位置，
 * 所以先把输入框临时移到屏幕上方再聚焦，下一帧移回来（React Aria 的 usePreventScroll 同样做法）。
 */
function focusWithoutScroll(element: HTMLElement) {
  if (!isIOS) {
    element.focus({ preventScroll: true });
    return;
  }
  const transform = element.style.transform;
  element.style.transform = "translateY(-2000px)";
  element.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    element.style.transform = transform;
  });
}

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
    if (target) focusWithoutScroll(target);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    // iOS 上点面板里的输入框：拦下系统自己的聚焦（它会把整页推上去），改用 focusWithoutScroll。
    const onTouchEnd = (event: TouchEvent) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || !textTypes.has(field.type)) return;
      if (field === document.activeElement) return;
      event.preventDefault();
      focusWithoutScroll(field);
    };
    const scope = ref.current;
    window.addEventListener("keydown", onKey);
    if (isIOS) scope?.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      scope?.removeEventListener("touchend", onTouchEnd);
      previous.current?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div ref={ref} className={styles.content}>
      {children}
    </div>
  );
}
