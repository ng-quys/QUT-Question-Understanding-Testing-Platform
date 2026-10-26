-- PROPOSAL ONLY: not executed. Requires explicit staging-only approval.
-- Run only inside the verified examflow-saved-documents-staging Question Bank
-- container, never via ai-service/.env or the Production deployment runner.
-- Minimal synthetic fixture, not a clone of the complete Production schema.
BEGIN;
DO $$
BEGIN
    IF current_database() <> 'examflow_rag_staging' THEN
        RAISE EXCEPTION 'Refusing non-staging database';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
        RAISE EXCEPTION 'Expected an empty public schema; inspect before bootstrap';
    END IF;
END $$;
CREATE SCHEMA extensions;
CREATE EXTENSION vector WITH SCHEMA extensions;
CREATE TABLE public.questions (
    id bigint PRIMARY KEY,
    course_id bigint NOT NULL,
    content text NOT NULL
);
CREATE TABLE public.question_embeddings (
    question_id bigint PRIMARY KEY REFERENCES public.questions(id),
    embedding extensions.vector(768) NOT NULL,
    model_name text NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE TABLE public.question_embedding_queue (
    question_id bigint PRIMARY KEY REFERENCES public.questions(id),
    queued_at timestamptz NOT NULL,
    attempts integer NOT NULL,
    next_retry_at timestamptz NOT NULL,
    last_error text
);
COMMIT;
