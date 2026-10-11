-- The language of a knowledge item: 'en', 'fr', or NULL for every language. The messenger's Help
-- shows a customer the FAQ entries in their language plus the ones for every language.
ALTER TABLE knowledge_items ADD COLUMN locale TEXT;
