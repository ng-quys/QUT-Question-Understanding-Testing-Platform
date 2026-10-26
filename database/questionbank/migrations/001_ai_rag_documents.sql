-- TARGET: ExamFlow Question Bank database only.
-- PREPARED migration: do not run against Production without explicit approval.
-- Additive document/RAG cache. It does not modify questions or question_embeddings.

BEGIN;

DO $$
DECLARE vector_type text;
BEGIN
    IF to_regclass('public.questions') IS NULL
       OR to_regclass('public.question_embeddings') IS NULL THEN
        RAISE EXCEPTION 'Wrong database: Question Bank baseline tables are missing';
    END IF;
    IF to_regtype('extensions.vector') IS NULL THEN
        RAISE EXCEPTION 'Question Bank requires extensions.vector';
    END IF;
    SELECT format_type(a.atttypid,a.atttypmod) INTO vector_type
    FROM pg_attribute a
    WHERE a.attrelid='public.question_embeddings'::regclass
      AND a.attname='embedding' AND NOT a.attisdropped;
    IF vector_type IS DISTINCT FROM 'extensions.vector(768)' THEN
        RAISE EXCEPTION 'Expected question_embeddings.embedding vector(768), found %', vector_type;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_source_documents (
    id uuid PRIMARY KEY,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    owner_user_id bigint NOT NULL,
    course_id bigint NOT NULL,
    original_name text NOT NULL CHECK (length(btrim(original_name)) BETWEEN 1 AND 255),
    mime_type text NOT NULL CHECK (mime_type IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    )),
    byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
    file_sha256 character(64) NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    storage_object_key text NOT NULL CHECK (length(btrim(storage_object_key)) BETWEEN 1 AND 1024),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','failed','deleted')),
    error_code text,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp,
    deleted_at timestamptz,
    CONSTRAINT ai_source_documents_revision_key UNIQUE (id,revision),
    CONSTRAINT ai_source_documents_storage_key UNIQUE (storage_object_key),
    CONSTRAINT ai_source_documents_deleted_state CHECK (
        (status='deleted' AND deleted_at IS NOT NULL)
        OR (status<>'deleted' AND deleted_at IS NULL)
    )
);

-- Cache reuse is deliberately scoped to the same uploader and course.
CREATE UNIQUE INDEX IF NOT EXISTS ai_source_documents_active_sha_uq
    ON public.ai_source_documents(owner_user_id,course_id,file_sha256)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ai_source_documents_library_idx
    ON public.ai_source_documents(owner_user_id,course_id,created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ai_document_indexes (
    id uuid PRIMARY KEY,
    document_id uuid NOT NULL,
    document_revision integer NOT NULL,
    extracted_text text,
    extracted_text_sha256 character(64)
        CHECK (extracted_text_sha256 IS NULL OR extracted_text_sha256 ~ '^[0-9a-f]{64}$'),
    extractor_version text NOT NULL CHECK (length(btrim(extractor_version)) BETWEEN 1 AND 100),
    embedding_model text NOT NULL CHECK (length(btrim(embedding_model)) BETWEEN 1 AND 200),
    embedding_model_digest text NOT NULL CHECK (length(btrim(embedding_model_digest)) BETWEEN 1 AND 200),
    embedding_dimensions integer NOT NULL CHECK (embedding_dimensions=768),
    chunker_version text NOT NULL CHECK (length(btrim(chunker_version)) BETWEEN 1 AND 100),
    chunk_size integer NOT NULL CHECK (chunk_size BETWEEN 100 AND 8000),
    chunk_overlap integer NOT NULL CHECK (chunk_overlap >= 0 AND chunk_overlap < chunk_size),
    config_hash character(64) NOT NULL CHECK (config_hash ~ '^[0-9a-f]{64}$'),
    chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
    status text NOT NULL DEFAULT 'extracting'
        CHECK (status IN ('extracting','indexing','ready','stale','failed')),
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp,
    ready_at timestamptz,
    CONSTRAINT ai_document_indexes_document_fk
        FOREIGN KEY (document_id,document_revision)
        REFERENCES public.ai_source_documents(id,revision) ON DELETE RESTRICT,
    CONSTRAINT ai_document_indexes_cache_key UNIQUE (document_id,document_revision,config_hash),
    CONSTRAINT ai_document_indexes_ready_state CHECK (
        status<>'ready' OR (
            extracted_text IS NOT NULL AND length(btrim(extracted_text)) >= 50
            AND extracted_text_sha256 IS NOT NULL
            AND chunk_count > 0 AND ready_at IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS ai_document_indexes_lookup_idx
    ON public.ai_document_indexes(document_id,document_revision,status,config_hash);

CREATE TABLE IF NOT EXISTS public.ai_document_chunks (
    index_id uuid NOT NULL REFERENCES public.ai_document_indexes(id) ON DELETE CASCADE,
    chunk_order integer NOT NULL CHECK (chunk_order >= 0),
    content text NOT NULL CHECK (length(btrim(content)) > 0),
    content_sha256 character(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    page_number integer CHECK (page_number IS NULL OR page_number > 0),
    start_offset integer CHECK (start_offset IS NULL OR start_offset >= 0),
    end_offset integer CHECK (end_offset IS NULL OR end_offset >= 0),
    embedding extensions.vector(768) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (index_id,chunk_order),
    CONSTRAINT ai_document_chunks_offsets CHECK (
        start_offset IS NULL OR end_offset IS NULL OR end_offset >= start_offset
    ),
    CONSTRAINT ai_document_chunks_vector_dims CHECK (extensions.vector_dims(embedding)=768)
);

CREATE OR REPLACE FUNCTION public.examflow_guard_ai_document_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.id,NEW.revision,NEW.owner_user_id,NEW.course_id,NEW.file_sha256,NEW.storage_object_key)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.revision,OLD.owner_user_id,OLD.course_id,OLD.file_sha256,OLD.storage_object_key) THEN
        RAISE EXCEPTION 'AI document identity and revision are immutable';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ai_source_documents_identity_guard ON public.ai_source_documents;
CREATE TRIGGER ai_source_documents_identity_guard
BEFORE UPDATE ON public.ai_source_documents
FOR EACH ROW EXECUTE FUNCTION public.examflow_guard_ai_document_identity();

CREATE OR REPLACE FUNCTION public.examflow_guard_ai_document_index()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allow_purge boolean := coalesce(current_setting('examflow.allow_ai_index_purge',true),'off')='on';
DECLARE document_deleted boolean;
BEGIN
    IF TG_OP='DELETE' THEN
        SELECT d.deleted_at IS NOT NULL INTO document_deleted
        FROM public.ai_source_documents d
        WHERE d.id=OLD.document_id AND d.revision=OLD.document_revision;
        IF OLD.ready_at IS NOT NULL AND (NOT allow_purge OR NOT coalesce(document_deleted,false)) THEN
            RAISE EXCEPTION 'Ready AI index purge requires a deleted document and explicit session flag';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.ready_at IS NOT NULL AND ROW(
        NEW.id,NEW.document_id,NEW.document_revision,NEW.extracted_text,
        NEW.extracted_text_sha256,NEW.extractor_version,NEW.embedding_model,
        NEW.embedding_model_digest,NEW.embedding_dimensions,NEW.chunker_version,
        NEW.chunk_size,NEW.chunk_overlap,NEW.config_hash,NEW.chunk_count,NEW.ready_at)
       IS DISTINCT FROM ROW(
        OLD.id,OLD.document_id,OLD.document_revision,OLD.extracted_text,
        OLD.extracted_text_sha256,OLD.extractor_version,OLD.embedding_model,
        OLD.embedding_model_digest,OLD.embedding_dimensions,OLD.chunker_version,
        OLD.chunk_size,OLD.chunk_overlap,OLD.config_hash,OLD.chunk_count,OLD.ready_at) THEN
        RAISE EXCEPTION 'Ready AI document index is immutable; create a new index revision';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ai_document_indexes_immutable_guard ON public.ai_document_indexes;
CREATE TRIGGER ai_document_indexes_immutable_guard
BEFORE UPDATE OR DELETE ON public.ai_document_indexes
FOR EACH ROW EXECUTE FUNCTION public.examflow_guard_ai_document_index();

CREATE OR REPLACE FUNCTION public.examflow_guard_ai_document_chunk()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_index uuid := CASE WHEN TG_OP='DELETE' THEN OLD.index_id ELSE NEW.index_id END;
DECLARE is_pinned boolean;
DECLARE allow_purge boolean := coalesce(current_setting('examflow.allow_ai_index_purge',true),'off')='on';
BEGIN
    SELECT ready_at IS NOT NULL INTO is_pinned
    FROM public.ai_document_indexes WHERE id=target_index;
    IF coalesce(is_pinned,false) AND NOT (TG_OP='DELETE' AND allow_purge) THEN
        RAISE EXCEPTION 'Chunks of a completed AI document index are immutable';
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ai_document_chunks_immutable_guard ON public.ai_document_chunks;
CREATE TRIGGER ai_document_chunks_immutable_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.ai_document_chunks
FOR EACH ROW EXECUTE FUNCTION public.examflow_guard_ai_document_chunk();

-- MVP intentionally has no IVFFlat/HNSW index. Searches are exact and always
-- restricted to at most five pinned index_id values.

COMMENT ON TABLE public.ai_source_documents IS
    'Private AI Generator source-document metadata; user/course IDs are external main-DB IDs.';
COMMENT ON TABLE public.ai_document_indexes IS
    'Immutable extraction/chunk/embedding revisions pinned by generation jobs.';
COMMENT ON TABLE public.ai_document_chunks IS
    'Exact-search pgvector chunks; separate from persistent question embeddings.';

DO $$
DECLARE missing integer;
BEGIN
    SELECT count(*) INTO missing
    FROM (VALUES
        ('ai_source_documents','owner_user_id'),
        ('ai_source_documents','file_sha256'),
        ('ai_document_indexes','config_hash'),
        ('ai_document_indexes','embedding_model_digest'),
        ('ai_document_chunks','embedding')
    ) expected(table_name,column_name)
    LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name=expected.table_name
     AND c.column_name=expected.column_name
    WHERE c.column_name IS NULL;
    IF missing <> 0 THEN
        RAISE EXCEPTION 'AI document migration post-check failed: % columns missing', missing;
    END IF;
END $$;

COMMIT;

-- Read-only verification after apply:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public' AND table_name IN
-- ('ai_source_documents','ai_document_indexes','ai_document_chunks') ORDER BY 1;
-- SELECT count(*) FROM public.ai_source_documents;
-- SELECT count(*) FROM public.ai_document_indexes;
-- SELECT count(*) FROM public.ai_document_chunks;

