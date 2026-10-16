CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  pin_hash text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, code, title, created_at) ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contestants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  type text NOT NULL DEFAULT 'individual' CHECK (type IN ('individual','team')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contestants_room_name_uniq ON public.contestants (room_id, lower(name));
GRANT SELECT ON public.contestants TO anon, authenticated;
GRANT ALL ON public.contestants TO service_role;
ALTER TABLE public.contestants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read contestants" ON public.contestants FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, number)
);
GRANT SELECT ON public.rounds TO anon, authenticated;
GRANT ALL ON public.rounds TO service_role;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rounds" ON public.rounds FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  contestant_id uuid NOT NULL REFERENCES public.contestants(id) ON DELETE CASCADE,
  value bigint NOT NULL CHECK (value >= 0 AND value <= 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, contestant_id)
);
GRANT SELECT ON public.scores TO anon, authenticated;
GRANT ALL ON public.scores TO service_role;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read scores" ON public.scores FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.contestants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;