import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

serve(async () => {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all reservierungen
  const { data: reservierungen, error: fetchError } = await supabase
    .from("reservierungen")
    .select("*")
    .order("datum", { ascending: false });

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 400 });
  }

  const months = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];

  // Insert into changelog
  interface Reservierung {
    datum: string;
    fahrer: string;
    notiz: string | null;
    erstellt_am: string;
  }

  const entries = (reservierungen as Reservierung[]).map((res) => {
    const date = new Date(res.datum);
    const day = String(date.getDate()).padStart(2, "0");
    const month = months[date.getMonth()];

    return {
      titel: `Reservierung: ${res.fahrer} am ${day}. ${month}`,
      kategorie: "daten",
      datum: res.datum,
      beschreibung: res.notiz,
      erstellt_am: res.erstellt_am,
    };
  });

  const { error: insertError } = await supabase.from("changelog").insert(entries);

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 400 });
  }

  return new Response(
    JSON.stringify({ success: true, count: entries.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
