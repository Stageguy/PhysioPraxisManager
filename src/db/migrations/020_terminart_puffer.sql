-- Pause (Rüstzeit) nach einem Termin dieser Terminart in Minuten (W116a). NULL = Standard aus der Konfiguration
-- (praxis_einstellung termin_puffer_min). Die Pause steckt im belegten Block des Termins und ist nicht buchbar.
ALTER TABLE terminart ADD COLUMN puffer_min integer CHECK (puffer_min IS NULL OR (puffer_min >= 0 AND puffer_min <= 120));
