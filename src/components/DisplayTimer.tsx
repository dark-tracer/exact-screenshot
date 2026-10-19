import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime, type RoomTimer } from "@/lib/timer";
import { useCountdown } from "@/lib/use-countdown";

export function DisplayTimer({ timer, name }: { timer: RoomTimer; name?: string | undefined }) {
  const { remaining, expired } = useCountdown(timer);
  const audio = useRef<AudioContext | null>(null);
  const sounded = useRef<string | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  // Browsers require a gesture on this display before allowing sound.
  async function enableSound() {
    try {
      if (!audio.current) audio.current = new AudioContext();
      await audio.current.resume();
      setSoundReady(audio.current.state === "running");
    } catch { setSoundReady(false); }
  }
  useEffect(() => {
    const unlock = () => { void enableSound(); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void audio.current?.close();
    };
  }, []);
  useEffect(() => {
    const context = audio.current;
    if (!expired || !timer.contestant_id || !context || !soundReady || context.state !== "running" || sounded.current === timer.run_id) return;
    sounded.current = timer.run_id;
    const start = context.currentTime;
    // A bright, decaying bell with several metallic harmonics.
    for (const [frequency, volume] of [[880, 0.5], [1760, 0.24], [2640, 0.12]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 2.5);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + 2.6);
    }
  }, [expired, soundReady, timer.run_id, timer.contestant_id]);
  return <section className="display-timer relative flex h-[17vh] shrink-0 items-center justify-between gap-4 border-y border-border" aria-label="Participant timer">
    <div className="min-w-0 flex-1">
      <p className="truncate font-display text-xl font-semibold text-muted-foreground">{name ?? "Participant timer"}</p>
      {expired ? <p role="alert" className="timer-expired font-display font-extrabold leading-none text-destructive">TIME IS UP</p> :
        <p role="timer" className="timer-countdown font-display font-extrabold leading-none text-primary tabular">{formatTime(remaining)} <span className="text-base font-semibold text-muted-foreground">{timer.ends_at ? "" : timer.contestant_id ? "Paused" : "Ready"}</span></p>}
    </div>
    <Button variant="ghost" size={soundReady ? "icon" : "sm"} aria-label={soundReady ? "Sound enabled" : "Enable sound"} title={soundReady ? "Sound enabled" : "Enable expiry ding"} onClick={enableSound}>
      {soundReady ? <Volume2 /> : <><VolumeX /> Enable sound</>}
    </Button>
  </section>;
}