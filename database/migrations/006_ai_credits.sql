-- AI Credits: MAIN DB candidate. Execute only after explicit final user approval.
-- MAIN project: kbplrzkjnyphsbdmscgq; database postgres; schema public.
-- No backfill, seed, changes to existing columns, or provider/model changes.
-- Verify host, port and connection user/project before setting SESSION values:
--   examflow.migration_environment = 'main'
--   examflow.expected_database = 'postgres'
--   examflow.main_target_confirmation = 'kbplrzkjnyphsbdmscgq/postgres/public'
-- Settings are operator acknowledgements, not proof of server identity.
-- Deliberately fails on existing/partial installation. Do not run twice.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $migration_guard$
DECLARE
    expected_database TEXT :=
        current_setting('examflow.expected_database', TRUE);
BEGIN
    IF current_setting('examflow.migration_environment', TRUE)
            IS DISTINCT FROM 'main'
            OR current_setting('examflow.main_target_confirmation', TRUE)
                IS DISTINCT FROM 'kbplrzkjnyphsbdmscgq/postgres/public'
            OR current_schema() IS DISTINCT FROM 'public' THEN
        RAISE EXCEPTION 'Explicit approval for the verified ExamFlow MAIN project/database/schema is required';
    END IF;

    IF NULLIF(BTRIM(expected_database), '') IS NULL
            OR current_database() IS DISTINCT FROM expected_database THEN
        RAISE EXCEPTION 'Connected database does not match the acknowledged staging database';
    END IF;

    IF to_regclass('public.users') IS NULL
            OR to_regclass('public.ai_generation_requests') IS NULL THEN
        RAISE EXCEPTION 'Required baseline tables public.users and public.ai_generation_requests are missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            VALUES
                ('public.users', 'id', 'bigint'),
                ('public.ai_generation_requests', 'id', 'bigint'),
                ('public.ai_generation_requests', 'requested_by', 'bigint'),
                ('public.ai_generation_requests', 'requested_question_count', 'integer')
        ) AS expected(table_name, column_name, type_name)
        LEFT JOIN pg_attribute AS actual
            ON actual.attrelid = to_regclass(expected.table_name)
            AND actual.attname = expected.column_name
            AND actual.attnum > 0
            AND NOT actual.attisdropped
        WHERE actual.attname IS NULL
            OR actual.atttypid <> to_regtype(expected.type_name)
    ) THEN
        RAISE EXCEPTION 'Baseline PK/FK/count column types do not match the reviewed schema';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (VALUES ('public.users'), ('public.ai_generation_requests'))
            AS expected(table_name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS pk
            JOIN pg_attribute AS id_column
                ON id_column.attrelid = pk.conrelid
                AND id_column.attname = 'id'
                AND NOT id_column.attisdropped
            WHERE pk.conrelid = to_regclass(expected.table_name)
                AND pk.contype = 'p'
                AND pk.conkey = ARRAY[id_column.attnum]::SMALLINT[]
        )
    ) THEN
        RAISE EXCEPTION 'Baseline tables must have the reviewed single-column id primary keys';
    END IF;
END;
$migration_guard$;

CREATE TABLE public.ai_credit_accounts (
    user_id BIGINT PRIMARY KEY
        REFERENCES public.users(id) ON DELETE RESTRICT,
    extra_balance BIGINT NOT NULL DEFAULT 0,
    extra_reserved BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ai_credit_accounts_balance_ck CHECK (
        extra_balance >= 0
        AND extra_reserved >= 0
        AND extra_reserved <= extra_balance
    )
);

CREATE TABLE public.ai_credit_months (
    user_id BIGINT NOT NULL
        REFERENCES public.ai_credit_accounts(user_id) ON DELETE RESTRICT,
    month_start DATE NOT NULL,
    monthly_limit INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, month_start),
    CONSTRAINT ai_credit_months_first_day_ck CHECK (
        EXTRACT(DAY FROM month_start) = 1
    ),
    CONSTRAINT ai_credit_months_balance_ck CHECK (
        monthly_limit >= 0
        AND used >= 0
        AND reserved >= 0
        AND used::BIGINT + reserved::BIGINT <= monthly_limit
    )
);

-- The existing three legacy records receive neutral metadata only.
-- Existing status, timestamps, question counts and foreign keys are unchanged.
ALTER TABLE public.ai_generation_requests
    ADD COLUMN credit_state VARCHAR(24) NOT NULL DEFAULT 'legacy',
    ADD COLUMN credit_month DATE,
    ADD COLUMN idempotency_key UUID,
    ADD COLUMN payload_sha256 CHAR(64),
    ADD COLUMN credit_payload JSONB,
    ADD COLUMN credit_result JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN reserved_monthly INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN reserved_extra INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN accepted_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN charged_monthly INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN charged_extra INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN execution_token UUID,
    ADD COLUMN dispatched_at TIMESTAMPTZ,
    ADD COLUMN heartbeat_at TIMESTAMPTZ,
    ADD COLUMN lease_expires_at TIMESTAMPTZ,
    ADD COLUMN cancel_requested_at TIMESTAMPTZ,
    ADD COLUMN credit_created_at TIMESTAMPTZ,
    ADD COLUMN credit_completed_at TIMESTAMPTZ,
    ADD COLUMN credit_error_code TEXT;

ALTER TABLE public.ai_generation_requests
    ADD CONSTRAINT ai_request_credit_state_ck CHECK (
        credit_state IN (
            'legacy', 'reserved', 'running', 'cancel_requested',
            'unknown', 'succeeded', 'partial', 'failed', 'cancelled'
        )
    ),
    ADD CONSTRAINT ai_request_credit_month_fk
        FOREIGN KEY (requested_by, credit_month)
        REFERENCES public.ai_credit_months(user_id, month_start)
        ON DELETE RESTRICT,
    ADD CONSTRAINT ai_request_credit_owner_uq
        UNIQUE (id, requested_by, credit_month),
    ADD CONSTRAINT ai_request_execution_token_uq
        UNIQUE (execution_token),
    ADD CONSTRAINT ai_request_credit_fields_ck CHECK (
        credit_state = 'legacy'
        OR (
            requested_by IS NOT NULL
            AND credit_month IS NOT NULL
            AND idempotency_key IS NOT NULL
            AND payload_sha256 IS NOT NULL
            AND payload_sha256 ~ '^[0-9a-f]{64}$'
            AND credit_payload IS NOT NULL
            AND execution_token IS NOT NULL
            AND credit_created_at IS NOT NULL
        )
    ),
    ADD CONSTRAINT ai_request_credit_amounts_ck CHECK (
        credit_state = 'legacy'
        OR (
            reserved_monthly >= 0
            AND reserved_extra >= 0
            AND reserved_monthly::BIGINT + reserved_extra::BIGINT
                = requested_question_count
            AND accepted_count BETWEEN 0 AND requested_question_count
            AND charged_monthly BETWEEN 0 AND reserved_monthly
            AND charged_extra BETWEEN 0 AND reserved_extra
            AND charged_monthly::BIGINT + charged_extra::BIGINT
                <= accepted_count
            AND retry_count >= 0
            AND (credit_state <> 'reserved' OR accepted_count = 0)
        )
    ),
    ADD CONSTRAINT ai_request_credit_result_ck CHECK (
        CASE
            WHEN jsonb_typeof(credit_result) = 'array'
                THEN jsonb_array_length(credit_result) = accepted_count
            ELSE FALSE
        END
    ),
    ADD CONSTRAINT ai_request_credit_settlement_ck CHECK (
        credit_state = 'legacy'
        OR (
            credit_state IN (
                'reserved', 'running', 'cancel_requested', 'unknown'
            )
            AND charged_monthly = 0
            AND charged_extra = 0
            AND credit_completed_at IS NULL
        )
        OR (
            credit_state IN ('succeeded', 'partial', 'failed', 'cancelled')
            AND credit_completed_at IS NOT NULL
            AND charged_monthly = LEAST(accepted_count, reserved_monthly)
            AND charged_extra = accepted_count - charged_monthly
            AND (
                (credit_state = 'succeeded'
                    AND accepted_count = requested_question_count)
                OR (credit_state = 'partial'
                    AND accepted_count > 0
                    AND accepted_count < requested_question_count)
                OR (credit_state IN ('failed', 'cancelled')
                    AND accepted_count = 0)
            )
        )
    ),
    ADD CONSTRAINT ai_request_credit_status_ck CHECK (
        credit_state = 'legacy'
        OR (credit_state = 'reserved' AND status = 'pending')
        OR (
            credit_state IN ('running', 'cancel_requested', 'unknown')
            AND status = 'processing'
        )
        OR (
            credit_state IN ('succeeded', 'partial')
            AND status = 'completed'
        )
        OR (credit_state = 'failed' AND status = 'failed')
        OR (credit_state = 'cancelled' AND status = 'cancelled')
    );

CREATE UNIQUE INDEX uq_ai_request_idempotency
    ON public.ai_generation_requests(requested_by, idempotency_key)
    WHERE credit_state <> 'legacy';

CREATE UNIQUE INDEX uq_ai_request_active_teacher
    ON public.ai_generation_requests(requested_by)
    WHERE credit_state IN (
        'reserved', 'running', 'cancel_requested', 'unknown'
    );

CREATE INDEX idx_ai_request_credit_history
    ON public.ai_generation_requests(requested_by, id DESC)
    WHERE credit_state <> 'legacy';

CREATE INDEX idx_ai_request_credit_recovery
    ON public.ai_generation_requests(credit_state, lease_expires_at)
    WHERE credit_state IN (
        'reserved', 'running', 'cancel_requested', 'unknown'
    );

CREATE TABLE public.ai_credit_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES public.ai_credit_accounts(user_id) ON DELETE RESTRICT,
    month_start DATE,
    job_id BIGINT,
    actor_id BIGINT REFERENCES public.users(id) ON DELETE RESTRICT,
    -- One globally unique key per financial event, stable across retries.
    -- Reserve and finalization MUST use different operation keys.
    operation_key UUID NOT NULL,
    event_type VARCHAR(24) NOT NULL,
    monthly_limit_delta INTEGER NOT NULL DEFAULT 0,
    monthly_used_delta INTEGER NOT NULL DEFAULT 0,
    monthly_reserved_delta INTEGER NOT NULL DEFAULT 0,
    extra_balance_delta BIGINT NOT NULL DEFAULT 0,
    extra_reserved_delta BIGINT NOT NULL DEFAULT 0,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ai_credit_operation_key_uq UNIQUE (operation_key),

    FOREIGN KEY (user_id, month_start)
        REFERENCES public.ai_credit_months(user_id, month_start)
        ON DELETE RESTRICT,

    FOREIGN KEY (job_id, user_id, month_start)
        REFERENCES public.ai_generation_requests(
            id, requested_by, credit_month
        )
        ON DELETE RESTRICT,

    CONSTRAINT ai_credit_transaction_actor_reason_ck CHECK (
        actor_id IS NULL
        OR NULLIF(BTRIM(reason), '') IS NOT NULL
    ),

    CONSTRAINT ai_credit_transaction_event_ck CHECK (
        CASE event_type
            WHEN 'monthly_allocation' THEN
                month_start IS NOT NULL
                AND job_id IS NULL
                AND monthly_limit_delta >= 0
                AND monthly_used_delta = 0
                AND monthly_reserved_delta = 0
                AND extra_balance_delta = 0
                AND extra_reserved_delta = 0

            WHEN 'admin_grant' THEN
                month_start IS NULL
                AND job_id IS NULL
                AND actor_id IS NOT NULL
                AND NULLIF(BTRIM(reason), '') IS NOT NULL
                AND monthly_limit_delta = 0
                AND monthly_used_delta = 0
                AND monthly_reserved_delta = 0
                AND extra_balance_delta > 0
                AND extra_reserved_delta = 0

            WHEN 'reserve' THEN
                month_start IS NOT NULL
                AND job_id IS NOT NULL
                AND monthly_limit_delta = 0
                AND monthly_used_delta = 0
                AND extra_balance_delta = 0
                AND monthly_reserved_delta >= 0
                AND extra_reserved_delta >= 0
                AND (
                    monthly_reserved_delta > 0
                    OR extra_reserved_delta > 0
                )

            WHEN 'settle' THEN
                month_start IS NOT NULL
                AND job_id IS NOT NULL
                AND monthly_limit_delta = 0
                AND monthly_used_delta >= 0
                AND monthly_reserved_delta <= 0
                AND extra_balance_delta <= 0
                AND extra_reserved_delta <= 0
                AND monthly_used_delta::BIGINT
                    <= -monthly_reserved_delta::BIGINT
                AND extra_balance_delta >= extra_reserved_delta
                AND (
                    monthly_used_delta > 0
                    OR extra_balance_delta < 0
                )

            WHEN 'release' THEN
                month_start IS NOT NULL
                AND job_id IS NOT NULL
                AND monthly_limit_delta = 0
                AND monthly_used_delta = 0
                AND extra_balance_delta = 0
                AND monthly_reserved_delta <= 0
                AND extra_reserved_delta <= 0
                AND (
                    monthly_reserved_delta < 0
                    OR extra_reserved_delta < 0
                )

            ELSE FALSE
        END
    )
);

CREATE UNIQUE INDEX uq_ai_credit_monthly_allocation
    ON public.ai_credit_transactions(user_id, month_start)
    WHERE event_type = 'monthly_allocation';

CREATE UNIQUE INDEX uq_ai_credit_job_reserve
    ON public.ai_credit_transactions(job_id)
    WHERE event_type = 'reserve';

-- Even different operation keys cannot both settle and release the same job.
CREATE UNIQUE INDEX uq_ai_credit_job_finalization
    ON public.ai_credit_transactions(job_id)
    WHERE event_type IN ('settle', 'release');

CREATE INDEX idx_ai_credit_transactions_user_history
    ON public.ai_credit_transactions(user_id, created_at DESC, id DESC);

CREATE INDEX idx_ai_credit_transactions_admin_history
    ON public.ai_credit_transactions(created_at DESC, id DESC);

-- Application contract (not implemented by this schema):
-- Lock account, month, then job in a consistent order. Change balances, job
-- and ledger in ONE transaction. On operation_key conflict, compare the
-- original operation's full normalized payload and return its result, or
-- reject a mismatched retry. Never commit a balance update after swallowing
-- a duplicate ledger insert. The schema alone cannot enforce ledger sums
-- against balance rows, allowed state transitions, or administrator roles.

COMMIT;
