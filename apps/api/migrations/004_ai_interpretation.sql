-- Fase 4: cuotas locales y sugerencias guardadas para revisión.
CREATE TABLE ai_attempts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 provider TEXT NOT NULL CHECK(provider IN ('openrouter','gemini','groq')),
 attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 result TEXT NOT NULL CHECK(result IN ('success','error')),
 contains_images INTEGER NOT NULL CHECK(contains_images IN (0,1))
);
CREATE INDEX idx_ai_attempts_daily ON ai_attempts(provider,attempted_at);
CREATE TABLE ai_interpretations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 request_hash TEXT UNIQUE NOT NULL,
 message_ids_json TEXT NOT NULL,
 suggestions_json TEXT NOT NULL,
 provider TEXT NOT NULL,
 model TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
