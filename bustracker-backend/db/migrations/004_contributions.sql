-- 004_contributions.sql : qui a ajouté quel arrêt / quelle ligne (contribution communautaire, comme Waze)

ALTER TABLE stops ADD COLUMN created_by INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE lines ADD COLUMN created_by INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE lines ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
