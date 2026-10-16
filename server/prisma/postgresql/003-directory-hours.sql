-- Shares semantics with domain.isOpen; exceptions replace the entire local date.
CREATE OR REPLACE FUNCTION agt_directory_is_open(weekly jsonb, exceptions jsonb, zone text, instant timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE local_now timestamp := instant AT TIME ZONE zone;
 day_key text := EXTRACT(DOW FROM local_now)::int::text;
 date_key text := to_char(local_now,'YYYY-MM-DD');
 clock text := to_char(local_now,'HH24:MI');
 today jsonb;
 previous jsonb;
BEGIN
 today := COALESCE(exceptions->date_key,weekly->day_key,'[]'::jsonb);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(today) i WHERE
   (i->>'end' > i->>'start' AND clock >= i->>'start' AND clock < i->>'end') OR
   (i->>'end' < i->>'start' AND clock >= i->>'start')) THEN RETURN true; END IF;
 IF exceptions ? date_key THEN RETURN false; END IF;
 previous := COALESCE(exceptions->to_char(local_now-interval '1 day','YYYY-MM-DD'),weekly->(EXTRACT(DOW FROM local_now-interval '1 day')::int::text),'[]'::jsonb);
 RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(previous) i WHERE i->>'end' < i->>'start' AND clock < i->>'end');
END $$;
