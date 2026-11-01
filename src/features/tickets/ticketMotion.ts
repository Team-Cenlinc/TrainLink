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
  /** 出票口的唇边（只在出票时有）：票的前沿从它下面滑出来，送完淡出。 */
  lip: HTMLElement | null;
  /** 出票时裁切在票的上沿，票从这一条线下面送出来（裁切由调用方用样式控制）。 */
  feed: HTMLElement;
  /** 送纸动画作用在这一层。 */
  ticket: HTMLElement;
  /** 打孔的一震、撕开时的回弹作用在这一层，不和送纸的位移打架。 */
  jolt: HTMLElement;
  hole: HTMLElement;
  stub: HTMLElement | null;
  /** 没撕时票身下沿的白齿（撕线）；已经撕过的票没有。 */
  tearLine: HTMLElement | null;
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
 * 出票：票从上沿的出票口分四段送出（每段之间停一下，像步进电机一格一格进纸），
 * 送完后离开滚轮，往下掉一点、略歪一下再停稳。出票口只是一条与面板同色、往下渐隐的唇边：
 * 票的前沿（深色外框）从它下面慢慢显现，不会凭空冒出一道黑线；送完唇边淡出。共约 1.7 秒。
 */
export async function playPrint(p: TicketParts, reduce: boolean) {
  if (reduce) {
    await p.ticket.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }).finished;
    return;
  }
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
  p.lip?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 240,
    easing: "ease-out",
    fill: "forwards",
  });
  await p.jolt.animate(
    [
      { transform: "translateY(0) rotate(0)" },
      { transform: "translateY(10px) rotate(-0.7deg)", offset: 0.4 },
      { transform: "translateY(4px) rotate(0.25deg)", offset: 0.72 },
      { transform: "translateY(0) rotate(0)" },
    ],
    { duration: 560, easing: "ease-out" },
  ).finished;
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
 * 出站撕票根：像手捏着票根右端往下拽。裂口从右往左一段一段推进（每段之间停一下，是撕纸的阻力）；
 * 裂口左边还连着，右边已经撕开、垂下来：票根绕着裂口那一点转，角度越撕越大，撕到头时右端垂下约 40 px，
 * 中间露出一道楔形的缝。票根压在票身下面，绕裂口转时左段翘起的部分藏在票身后面，看起来仍连着。
 * 票身这边，裂口右边的白齿（撕线）换成撕开后的锯齿。撕到头时票根脱离，
 * 票身像绷紧的纸松开一样往上一弹；票根接着刚才的角度按重力加速、翻转着落出画面，
 * 它原来占的位置同时收起。共约 1.7 秒。
 */
export async function playTear(p: TicketParts, reduce: boolean) {
  const stub = p.stub;
  if (!stub) return;
  if (reduce) {
    p.teeth.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" });
    p.tearLine?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
    await stub.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" })
      .finished;
    return;
  }
  buzz([6, 60, 6, 60, 10]);

  // 裂口位置（占宽度的比例，1 = 右端）与票根转角，按时间进度排开；停顿的两段位置不变、角度微增（在使劲）。
  const steps = [
    { at: 0, front: 1, angle: 0 },
    { at: 0.22, front: 0.72, angle: 3 },
    { at: 0.32, front: 0.72, angle: 3.4 },
    { at: 0.58, front: 0.42, angle: 5.2 },
    { at: 0.68, front: 0.42, angle: 5.6 },
    { at: 1, front: 0, angle: 7 },
  ];
  const tearing = { duration: 700, easing: "ease-in", fill: "forwards" } as const;

  // 票身这边：裂口右边露出锯齿、左边留着白齿。用一张一半透明一半不透明、两倍宽的渐变遮罩，
  // 横向推它，透明与不透明的分界就落在裂口上（不用 clip-path：齿形已经用了它）。
  const reveal = (el: HTMLElement | null, hiddenFirst: boolean) => {
    if (!el) return;
    el.style.maskImage = `linear-gradient(to right, ${
      hiddenFirst ? "transparent 50%, #000 50%" : "#000 50%, transparent 50%"
    })`;
    el.style.maskSize = "200% 100%";
    el.animate(
      steps.map((s) => ({
        maskPosition: `${(1 - s.front) * 100}% 0`,
        opacity: 1,
        offset: s.at,
      })),
      tearing,
    );
  };
  reveal(p.teeth, true);
  reveal(p.tearLine, false);

  // 票根绕裂口那一点（顶边上，距左端 front × 宽度）转：先挪到那一点、转、再挪回来。
  const width = stub.offsetWidth;
  const pivot = (front: number, angle: number) =>
    `translateX(${front * width}px) rotate(${angle}deg) translateX(${-front * width}px)`;
  await stub.animate(
    steps.map((s) => ({ transform: pivot(s.front, s.angle), offset: s.at })),
    tearing,
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
  // 接着撕完时的角度（裂口已到左端，等于绕左上角转了 7°）往下掉。
  await stub.animate(
    [
      { transform: "translate(0, 0) rotate(7deg)", opacity: 1 },
      { transform: "translate(14px, 44px) rotate(12deg)", opacity: 1, offset: 0.25 },
      { transform: "translate(40px, 430px) rotate(28deg)", opacity: 1, offset: 0.9 },
      { transform: "translate(44px, 470px) rotate(30deg)", opacity: 0 },
    ],
    { duration: 950, easing: gravity, fill: "forwards" },
  ).finished;
}
