import { useEffect, useState } from "react";
import { remainingTime, type RoomTimer } from "./timer";

export function useCountdown(timer: RoomTimer | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!timer?.ends_at) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [timer?.ends_at]);
  const remaining = timer ? remainingTime(timer, now) : 0;
  return { remaining, expired: !!timer?.enabled && remaining === 0 };
}