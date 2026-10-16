import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function RoomNotFound({ code }: { code: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">Room {code}</p>
        <h1 className="mt-3 text-4xl font-extrabold">No scoreboard here</h1>
        <p className="mt-3 text-muted-foreground">
          We couldn't find a scoreboard with that code. Double-check the code, or create a new one.
        </p>
        <Button asChild className="mt-8" size="lg">
          <Link to="/">Back to start</Link>
        </Button>
      </div>
    </main>
  );
}
