CREATE TABLE public.room_timers (
 room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 duration_seconds integer NOT NULL DEFAULT 30 CHECK (duration_seconds BETWEEN 1 AND 86400),
 remaining_ms integer NOT NULL DEFAULT 30000 CHECK (remaining_ms BETWEEN 0 AND 86400000),
 ends_at timestamptz,
 contestant_id uuid REFERENCES public.contestants(id) ON DELETE SET NULL,
 run_id uuid NOT NULL DEFAULT gen_random_uuid()
);
GRANT SELECT ON public.room_timers TO anon, authenticated;
GRANT ALL ON public.room_timers TO service_role;
ALTER TABLE public.room_timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read room timers" ON public.room_timers FOR SELECT TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_timers;