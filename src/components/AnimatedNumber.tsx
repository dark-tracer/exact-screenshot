import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/ranking";

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({ value, reduced, duration = 1200 }: { value: number; reduced: boolean; duration?: number }) {
  const [shown, setShown] = useState(value);
  const [fadeKey, setFadeKey] = useState(0);
  const from = useRef(value);
  const current = useRef(value);

  useEffect(() => {
    if (value === current.current) return;
    if (reduced) {
      current.current = value;
      setShown(value);
      setFadeKey((k) => k + 1);
      return;
    }
    from.current = current.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from.current + (value - from.current) * ease(t);
      current.current = t === 1 ? value : v;
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, duration]);

  return (
    <span key={fadeKey} className={reduced && fadeKey ? "fade-soft tabular" : "tabular"}>
      {formatNumber(shown)}
    </span>
  );
}
