-- Public help center: knowledge items published as web pages at /help/<locale>/<slug>.

-- Lowercase letters, digits and dashes, made from the title. Existing rows get theirs on first use
-- (the server fills NULL slugs in creation order, so the result is deterministic and unique).
ALTER TABLE knowledge_items ADD COLUMN slug TEXT;
-- Free-text section name; NULL lists it under "General".
ALTER TABLE knowledge_items ADD COLUMN category TEXT;
-- 1: shown in the help center. FAQ entries are already public in the messenger, so they start
-- published; articles were assistant-only until now, so they stay private until someone publishes them.
ALTER TABLE knowledge_items ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
-- Order inside its category, lowest first.
ALTER TABLE knowledge_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
-- Items sharing this value are translations of each other.
ALTER TABLE knowledge_items ADD COLUMN translation_group TEXT;

UPDATE knowledge_items SET published = 1 WHERE kind = 'faq';

-- One slug per language. Items for every language (locale NULL) must also not clash with any
-- language; the server checks that part.
CREATE UNIQUE INDEX knowledge_items_locale_slug ON knowledge_items (COALESCE(locale, ''), slug);
CREATE INDEX knowledge_items_translation_group ON knowledge_items (translation_group) WHERE translation_group IS NOT NULL;
