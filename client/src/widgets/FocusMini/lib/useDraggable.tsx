import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

type Position = { x: number; y: number };

export const useDraggable = () => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const clamp = (x: number, y: number) => {
    const node = nodeRef.current;
    const width = node?.offsetWidth ?? 0;
    const height = node?.offsetHeight ?? 0;

    return {
      x: Math.min(Math.max(0, x), window.innerWidth - width),
      y: Math.min(Math.max(0, y), window.innerHeight - height),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;

    const node = nodeRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    node.setPointerCapture(event.pointerId);
    isDraggingRef.current = true;
    setIsDragging(true);
    setPosition(clamp(rect.left, rect.top));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    setPosition(
      clamp(
        event.clientX - dragOffset.current.x,
        event.clientY - dragOffset.current.y,
      ),
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    nodeRef.current?.releasePointerCapture(event.pointerId);
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => {
        if (!current) return current;
        return clamp(current.x, current.y);
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const style: CSSProperties | undefined = position
    ? { left: position.x, top: position.y, right: "auto" }
    : undefined;

  return {
    nodeRef,
    isDragging,
    style,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
};
