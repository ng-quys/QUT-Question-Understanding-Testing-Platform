-- Shorten only previously auto-generated UUID room codes. Relations use room IDs.
BEGIN;
LOCK TABLE public.exam_rooms IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.exam_rooms old JOIN public.exam_rooms other
   ON lower(other.code)=lower('P'||CASE WHEN length(old.id::text)<3 THEN lpad(old.id::text,3,'0') ELSE old.id::text END)
   AND other.id<>old.id WHERE old.code ~* '^PH-[0-9a-f]{32}$'
 ) THEN RAISE EXCEPTION 'Short room code already exists; review before migration'; END IF;
END $$;
UPDATE public.exam_rooms SET code='P'||CASE WHEN length(id::text)<3 THEN lpad(id::text,3,'0') ELSE id::text END,updated_at=now()
WHERE code ~* '^PH-[0-9a-f]{32}$';
COMMIT;
