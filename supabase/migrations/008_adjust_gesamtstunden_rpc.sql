-- Atomic increment/decrement for gesamtstunden to prevent race conditions
CREATE OR REPLACE FUNCTION adjust_gesamtstunden(delta numeric)
RETURNS void AS $$
  UPDATE boot_stats
  SET gesamtstunden = gesamtstunden + delta,
      aktualisiert_am = now()
  WHERE id = (SELECT id FROM boot_stats LIMIT 1);
$$ LANGUAGE sql;
