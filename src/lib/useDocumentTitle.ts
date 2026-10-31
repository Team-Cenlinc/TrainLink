import { useEffect } from "react";

/** 浏览器标签页的标题：「页面名 · TrainLink」；没有页面名时只写 TrainLink。 */
export function useDocumentTitle(name?: string) {
  useEffect(() => {
    document.title = name ? `${name} · TrainLink` : "TrainLink";
  }, [name]);
}
