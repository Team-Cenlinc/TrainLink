/**
 * 仿真车票的三个实物动作：出票（出票机步进送纸）、进站打孔（检票钳）、出站撕票根（沿撕线撕开）。
 * 每个动作按「预备 → 作用 → 余波」分段，用浏览器自带的 Web Animations API 逐段播放：
 * 这些是有先后顺序的物理过程，需要逐段的缓动和准确的衔接时刻（例如压到底的那一刻才打穿）。
 * 只操作传进来的 DOM 元素，不涉及 React；状态什么时候改由调用方在回调里决定。
 *
 * 「减少动态效果」打开时不移动任何东西：票直接出现，孔与锯齿直接显现，票根淡出。
 */

export interface TicketParts {
  /** 定位容器：检票钳与纸屑相对它摆放。 */
  stage: HTMLElement;
  slot: HTMLElement;
  /** 出票时裁切在出票口那一行，票从这里送出来（裁切由调用方用样式控制）。 */
  feed: HTMLElement;
  /** 送纸动画作用在这一层。 */
  ticket: HTMLElement;
  /** 打孔的一震、撕开时的回弹作用在这一层，不和送纸的位移打架。 */
  jolt: HTMLElement;
  hole: HTMLElement;
  stub: HTMLElement | null;
  teeth: HTMLElement;
  jaw: HTMLElement;
  chad: HTMLElement;
}

/** 减速（物体进入、停稳）、重力（自由下落，越来越快）、带一点回弹（松开后复位）。 */
const easeOut = "cubic-bezier(0.2, 0, 0, 1)";
const gravity = "cubic-bezier(0.55, 0, 1, 0.45)";
const settle = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 支持振动的手机上，与画面同一时刻给一下触感。 */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 不支持就算了。
  }
}

/**
 * 出票：出票口从中间展开，票分四段送出（每段之间停一下，像步进电机一格一格进纸），
 * 送完后离开滚轮，往下掉一点、略歪一下再停稳；出票口淡出。共约 1.8 秒。
 */
export async function playPrint(p: TicketParts, reduce: boolean) {
  if (reduce) {
    await p.ticket.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }).finished;
    return;
  }
  p.slot.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
    duration: 160,
    easing: easeOut,
    fill: "forwards",
  });
  await wait(140);
  const at = (percent: number, offset: number, moving = false) => ({
    transform: `translateY(${percent}%)`,
    offset,
    ...(moving ? { easing: easeOut } : {}),
  });
  // 送完停在原位（fill），不会在动画结束时跳回出票口上方的初始位置。
  await p.ticket.animate(
    [
      at(-110, 0, true),
      at(-80, 0.17),
      at(-80, 0.25, true),
      at(-52, 0.42),
      at(-52, 0.5, true),
      at(-24, 0.67),
      at(-24, 0.75, true),
      at(0, 1),
    ],
    { duration: 1150, fill: "forwards" },
  ).finished;
  p.jolt.animate(
    [
      { transform: "translateY(0) rotate(0)" },
      { transform: "translateY(10px) rotate(-0.7deg)", offset: 0.4 },
      { transform: "translateY(4px) rotate(0.25deg)", offset: 0.72 },
      { transform: "translateY(0) rotate(0)" },
    ],
    { duration: 560, easing: "ease-out" },
  );
  await p.slot.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 260,
    delay: 380,
    fill: "forwards",
  }).finished;
}

/**
 * 进站打孔：检票钳从右边滑到孔位（预备），往下一压（作用）——压到底的一刻 onImpact，孔就打穿了，
 * 整张票被压得一沉再弹回；钳头停一下再抬起退出（余波）。打下来的纸屑先被弹开一点，
 * 再按重力加速、旋转着落出画面。共约 1 秒。
 */
export async function playPunch(p: TicketParts, reduce: boolean, onImpact: () => void) {
  if (reduce) {
    onImpact();
    return;
  }
  const stage = p.stage.getBoundingClientRect();
  const hole = p.hole.getBoundingClientRect();
  const x = hole.left - stage.left;
  const y = hole.top - stage.top;
  // 钳头比孔大，孔落在钳头中间的冲模上。
  Object.assign(p.jaw.style, { left: `${x - 15}px`, top: `${y - 10}px` });
  Object.assign(p.chad.style, { left: `${x}px`, top: `${y}px` });

  await p.jaw.animate(
    [
      { transform: "translate(170px, -8px)", opacity: 0 },
      { transform: "translate(110px, -8px)", opacity: 1, offset: 0.25 },
      { transform: "translate(0, -8px)", opacity: 1 },
    ],
    { duration: 280, easing: easeOut, fill: "forwards" },
  ).finished;
  await p.jaw.animate(
    [{ transform: "translate(0, -8px) scaleY(1)" }, { transform: "translate(0, 0) scaleY(0.84)" }],
    { duration: 90, easing: "cubic-bezier(0.5, 0, 1, 1)", fill: "forwards" },
  ).finished;

  onImpact();
  buzz(14);
  p.jolt.animate(
    [
      { transform: "translateY(0) scaleY(1)" },
      { transform: "translateY(4px) scaleY(0.992)" },
      { transform: "translateY(0) scaleY(1)" },
    ],
    { duration: 240, easing: settle },
  );
  p.chad.animate(
    [
      { transform: "translate(0, 0) rotate(0)", opacity: 1 },
      { transform: "translate(-4px, 6px) rotate(40deg)", opacity: 1, offset: 0.12 },
      { transform: "translate(18px, 330px) rotate(340deg)", opacity: 1, offset: 0.85 },
      { transform: "translate(20px, 380px) rotate(380deg)", opacity: 0 },
    ],
    { duration: 950, easing: gravity },
  );

  await wait(120);
  await p.jaw.animate(
    [
      { transform: "translate(0, 0) scaleY(0.84)", opacity: 1 },
      { transform: "translate(0, -10px) scaleY(1)", opacity: 1, offset: 0.3 },
      { transform: "translate(120px, -10px) scaleY(1)", opacity: 1, offset: 0.75 },
      { transform: "translate(180px, -10px) scaleY(1)", opacity: 0 },
    ],
    { duration: 380, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
  ).finished;
}

/**
 * 出站撕票根：裂口从右往左一段一段推进（每段之间停一下，是撕纸的阻力），
 * 票根以左上角为轴随之下垂，票身下沿的锯齿跟着露出；撕到头时票根脱离，
 * 票身像绷紧的纸松开一样往上一弹；票根按重力加速、翻转着落出画面，
 * 它原来占的位置同时收起。共约 1.5 秒。
 */
export async function playTear(p: TicketParts, reduce: boolean) {
  const stub = p.stub;
  if (!stub) return;
  if (reduce) {
    p.teeth.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" });
    await stub.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" })
      .finished;
    return;
  }
  buzz([6, 60, 6, 60, 10]);
  const torn = (inset: number, offset: number) => ({
    clipPath: `inset(0 0 0 ${inset}%)`,
    opacity: 1,
    offset,
  });
  p.teeth.animate(
    [torn(100, 0), torn(72, 0.22), torn(72, 0.32), torn(42, 0.58), torn(42, 0.68), torn(0, 1)],
    { duration: 560, easing: "ease-in", fill: "forwards" },
  );
  const sag = (deg: number, offset: number) => ({ transform: `rotate(${deg}deg)`, offset });
  await stub.animate(
    [sag(0, 0), sag(1, 0.22), sag(1.1, 0.32), sag(2, 0.58), sag(2.1, 0.68), sag(3, 1)],
    { duration: 560, easing: "ease-in", fill: "forwards" },
  ).finished;

  p.jolt.animate(
    [
      { transform: "translateY(0)" },
      { transform: "translateY(-6px)", offset: 0.35 },
      { transform: "translateY(0)" },
    ],
    { duration: 420, easing: settle },
  );
  // 票根离开后，它原来占的位置随之收起，下面的内容跟着滑上来；落完卸掉票根时不会再跳一下。
  stub.animate([{ marginBottom: "0px" }, { marginBottom: `${-stub.offsetHeight}px` }], {
    duration: 520,
    delay: 160,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards",
  });
  await stub.animate(
    [
      { transform: "translate(0, 0) rotate(3deg)", opacity: 1 },
      { transform: "translate(16px, 40px) rotate(9deg)", opacity: 1, offset: 0.25 },
      { transform: "translate(40px, 430px) rotate(26deg)", opacity: 1, offset: 0.9 },
      { transform: "translate(44px, 470px) rotate(28deg)", opacity: 0 },
    ],
    { duration: 950, easing: gravity, fill: "forwards" },
  ).finished;
}
