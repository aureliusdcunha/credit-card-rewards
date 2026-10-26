CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  name TEXT NOT NULL,
  network TEXT,
  reward_currency TEXT NOT NULL DEFAULT 'Rewards',
  annual_fee REAL,
  annual_fee_waiver TEXT,
  description TEXT,
  official_url TEXT,
  review_status TEXT NOT NULL DEFAULT 'needs_review',
  source_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_sources (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT,
  source_date TEXT,
  fetched_at TEXT NOT NULL,
  excerpt TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review',
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
CREATE INDEX IF NOT EXISTS idx_card_sources_card_id ON card_sources(card_id);

CREATE TABLE IF NOT EXISTS card_rules (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  category TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  valid_from TEXT,
  valid_to TEXT,
  source_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (source_id) REFERENCES card_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_card_rules_lookup ON card_rules(card_id, status, category, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS card_exclusions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  category TEXT NOT NULL,
  exclusion_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  valid_from TEXT,
  valid_to TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (source_id) REFERENCES card_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_card_exclusions_lookup ON card_exclusions(card_id, status, category, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS card_benefits (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  benefit_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  valid_from TEXT,
  valid_to TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (source_id) REFERENCES card_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_card_benefits_lookup ON card_benefits(card_id, status, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS extraction_drafts (
  id TEXT PRIMARY KEY,
  card_id TEXT,
  source_url TEXT NOT NULL,
  source_title TEXT,
  source_excerpt TEXT,
  extracted_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_review',
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
CREATE INDEX IF NOT EXISTS idx_extraction_drafts_status ON extraction_drafts(status, created_at DESC);

INSERT OR IGNORE INTO cards
(id, issuer, name, network, reward_currency, annual_fee, annual_fee_waiver, description, official_url, review_status, source_date, status, updated_at)
VALUES
('axis-horizon', 'Axis Bank', 'Horizon Credit Card', 'Visa / Mastercard', 'EDGE Miles', NULL, NULL,
 'Travel-focused card. Rules are demonstration data and must be reviewed against the latest issuer terms.',
 'https://www.axisbank.com/docs/default-source/ld/terms-and-conditions-for-horizon-credit-card.pdf',
 'needs_review', 'Confirm latest revision of official terms', 'active', '2026-10-21T00:00:00.000Z'),
('hdfc-regalia-gold', 'HDFC Bank', 'Regalia Gold Credit Card', 'Visa / Mastercard', 'Reward Points', NULL, NULL,
 'Premium rewards card. Rules are demonstration data and must be reviewed against the latest issuer terms.',
 'https://www.hdfcbank.com/content/bbp/repositories/723fb80a-2dde-42a3-9793-7ae1be57c87f/?path=%2FPersonal%2FPay%2FCards%2FCredit+Card%2FCredit+Card+Landing+Page%2FCredit+Cards%2FSuper+Premium%2FRegalia+Gold+Credit+Card%2FWebpage-content-T-and-Cs.pdf',
 'needs_review', 'Confirm latest revision of official terms', 'active', '2026-10-21T00:00:00.000Z'),
('icici-sapphiro', 'ICICI Bank', 'Sapphiro Credit Card', 'Variant-dependent', 'Reward Points', NULL, NULL,
 'Catalogue placeholder. Complete extraction and verify the exact network and card variant before calculations.',
 'https://www.icicibank.com/personal-banking/cards/credit-card/sapphiro-card',
 'no_verified_rules', 'Product page only; reward terms not reviewed', 'active', '2026-10-21T00:00:00.000Z');

-- Deliberately tagged demo: the calculator can illustrate the UX but will label results provisional.
INSERT OR IGNORE INTO card_rules (id, card_id, category, rule_json, status, valid_from, valid_to, source_id, priority, created_at)
VALUES
('demo-ax-horizon-airline', 'axis-horizon', 'airline_direct', '{"category":"airline_direct","rate":5,"perAmount":100,"unit":"EDGE Miles","minTransaction":0,"rounding":"down","cap":null,"priority":20,"notes":"Illustrative rate from referenced terms; confirm current revision and MCC classification."}', 'demo', '2024-01-01', NULL, NULL, 20, '2026-10-21T00:00:00.000Z'),
('demo-ax-horizon-edge', 'axis-horizon', 'travel_edge', '{"category":"travel_edge","rate":5,"perAmount":100,"unit":"EDGE Miles","minTransaction":0,"rounding":"down","cap":null,"priority":20,"notes":"Illustrative rate from referenced terms; confirm current revision."}', 'demo', '2024-01-01', NULL, NULL, 20, '2026-10-21T00:00:00.000Z'),
('demo-ax-horizon-ota', 'axis-horizon', 'travel_agency', '{"category":"travel_agency","rate":2,"perAmount":100,"unit":"EDGE Miles","minTransaction":0,"rounding":"down","cap":null,"priority":10,"notes":"Illustrative travel agency rate; confirm transaction classification."}', 'demo', '2024-01-01', NULL, NULL, 10, '2026-10-21T00:00:00.000Z'),
('demo-ax-horizon-general', 'axis-horizon', 'general', '{"category":"general","rate":2,"perAmount":100,"unit":"EDGE Miles","minTransaction":0,"rounding":"down","cap":null,"priority":0,"notes":"Illustrative base rate; confirm current terms."}', 'demo', '2024-01-01', NULL, NULL, 0, '2026-10-21T00:00:00.000Z'),
('demo-hdfc-regalia-base', 'hdfc-regalia-gold', 'general', '{"category":"general","rate":4,"perAmount":150,"unit":"Reward Points","minTransaction":150,"rounding":"down","cap":null,"priority":0,"notes":"Illustrative base rate; verify eligible retail transactions, exclusions, rounding and current card terms."}', 'demo', '2024-01-01', NULL, NULL, 0, '2026-10-21T00:00:00.000Z');

INSERT OR IGNORE INTO card_exclusions (id, card_id, category, exclusion_json, status, valid_from, valid_to, source_id, created_at)
VALUES
('demo-ax-ex-transport', 'axis-horizon', 'transport_tolls', '{"category":"transport_tolls","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-utilities', 'axis-horizon', 'utilities', '{"category":"utilities","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-insurance', 'axis-horizon', 'insurance', '{"category":"insurance","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-education', 'axis-horizon', 'education', '{"category":"education","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-government', 'axis-horizon', 'government', '{"category":"government","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-wallet', 'axis-horizon', 'wallet', '{"category":"wallet","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-rent', 'axis-horizon', 'rent', '{"category":"rent","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z'),
('demo-ax-ex-fuel', 'axis-horizon', 'fuel', '{"category":"fuel","reason":"Excluded category in referenced terms; confirm current MCC mapping."}', 'demo', '2024-01-01', NULL, NULL, '2026-10-21T00:00:00.000Z');
