-- Sprint 13: ErrorQuestion pgvector embedding for similar-question search.
-- The pgvector extension is enabled in 20260414023651_phase3_sprint10a_semantic_cache_daily_tasks.

ALTER TABLE "ErrorQuestion" ADD COLUMN "embedding" vector(1536);

-- ivfflat index intentionally deferred:
-- An empty/sparse table makes lists=100 ineffective. After production has
-- accumulated >1000 rows with non-NULL embedding, run manually:
--
--   CREATE INDEX CONCURRENTLY error_question_embedding_idx
--     ON "ErrorQuestion" USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);
--
-- Until then, brute-force ORDER BY embedding <=> $1 over the (small) row set
-- is fast enough (<100ms target).
