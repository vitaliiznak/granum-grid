import { useEffect, useRef, useState } from 'react';
/** Sample frame delivery only while navigation changes. No perpetual idle RAF. */
export function useFrameRate(position: number, enabled = true) {
  const [fps, setFps] = useState<number | null>(null);
  const deadline = useRef(0),
    frame = useRef(0),
    start = useRef(0),
    count = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    deadline.current = performance.now() + 180;
    if (frame.current) return;
    start.current = performance.now();
    count.current = 0;
    const tick = (now: number) => {
      count.current++;
      if (now - start.current >= 250 || now >= deadline.current) {
        if (count.current >= 5)
          setFps(Math.round((count.current * 1000) / Math.max(1, now - start.current)));
        start.current = now;
        count.current = 0;
      }
      if (now >= deadline.current) {
        frame.current = 0;
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [position, enabled]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );
  return enabled ? fps : null;
}
