-- Atomic nutzungslog creation + boot_stats update
CREATE OR REPLACE FUNCTION create_nutzungslog_atomic(
  p_datum date,
  p_fahrer text,
  p_betriebsstunden numeric,
  p_treibstoff_liter numeric DEFAULT NULL,
  p_aktivitaeten jsonb DEFAULT '[]'::jsonb,
  p_notiz text DEFAULT NULL,
  p_teilnehmer jsonb DEFAULT '[]'::jsonb,
  p_neue_gesamtstunden numeric DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_teilnehmer text[];
BEGIN
  -- Convert jsonb array to text[]
  SELECT COALESCE(array_agg(elem::text), '{}')
  INTO v_teilnehmer
  FROM jsonb_array_elements_text(p_teilnehmer) AS elem;

  INSERT INTO nutzungslogs (datum, fahrer, betriebsstunden, treibstoff_liter, aktivitaeten, notiz, teilnehmer)
  VALUES (p_datum, p_fahrer, p_betriebsstunden, p_treibstoff_liter, p_aktivitaeten, p_notiz, v_teilnehmer)
  RETURNING id INTO v_id;

  IF p_neue_gesamtstunden IS NOT NULL THEN
    UPDATE boot_stats SET gesamtstunden = p_neue_gesamtstunden WHERE id = (SELECT id FROM boot_stats LIMIT 1);
  ELSE
    UPDATE boot_stats SET gesamtstunden = gesamtstunden + p_betriebsstunden WHERE id = (SELECT id FROM boot_stats LIMIT 1);
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic nutzungslog deletion + boot_stats adjustment
CREATE OR REPLACE FUNCTION delete_nutzungslog_atomic(p_id uuid) RETURNS void AS $$
DECLARE
  v_hours numeric;
BEGIN
  DELETE FROM nutzungslogs WHERE id = p_id RETURNING betriebsstunden INTO v_hours;
  IF v_hours IS NOT NULL THEN
    UPDATE boot_stats SET gesamtstunden = gesamtstunden - v_hours WHERE id = (SELECT id FROM boot_stats LIMIT 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon
GRANT EXECUTE ON FUNCTION create_nutzungslog_atomic TO anon;
GRANT EXECUTE ON FUNCTION delete_nutzungslog_atomic TO anon;
