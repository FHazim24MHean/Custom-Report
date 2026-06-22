CREATE TABLE IF NOT EXISTS substations (
  id BIGSERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_name, name)
);

CREATE TABLE IF NOT EXISTS device_substation_mappings (
  project_name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  substation_id BIGINT NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_name, device_id)
);

CREATE INDEX IF NOT EXISTS idx_substations_project_name
  ON substations(project_name);

CREATE INDEX IF NOT EXISTS idx_device_substation_mappings_substation_id
  ON device_substation_mappings(substation_id);

CREATE TABLE IF NOT EXISTS main_intakes (
  id BIGSERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_name, name)
);

CREATE TABLE IF NOT EXISTS device_main_intake_mappings (
  project_name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  main_intake_id BIGINT NOT NULL REFERENCES main_intakes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_name, device_id)
);

CREATE INDEX IF NOT EXISTS idx_main_intakes_project_name
  ON main_intakes(project_name);

CREATE INDEX IF NOT EXISTS idx_device_main_intake_mappings_main_intake_id
  ON device_main_intake_mappings(main_intake_id);

CREATE TABLE IF NOT EXISTS device_labels (
  project_name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_name, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_labels_project_name
  ON device_labels(project_name);
