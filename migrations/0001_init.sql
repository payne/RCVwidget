CREATE TABLE elections (
  id           TEXT PRIMARY KEY,
  config_json  TEXT    NOT NULL,  -- canonical config: title, candidates, seats, dates, ...
  config_hash  TEXT    NOT NULL,  -- SHA-256 of config_json; the embed must match it
  home_origin  TEXT,              -- Origin of the page that first registered the election
  unlisted     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX elections_created ON elections (unlisted, created_at DESC);

CREATE TABLE ballots (
  election_id  TEXT    NOT NULL REFERENCES elections (id),
  voter_token  TEXT    NOT NULL,  -- random UUID kept in the voter's localStorage
  ranking_json TEXT    NOT NULL,  -- JSON array of candidate names, first choice first
  ip_hash      TEXT,              -- salted hash, used only for rate limiting
  origin       TEXT,              -- site the ballot was cast from
  cast_at      INTEGER NOT NULL,
  PRIMARY KEY (election_id, voter_token)
);
CREATE INDEX ballots_rate ON ballots (election_id, ip_hash, cast_at);
