// Conexión a Supabase (la clave "publishable" está pensada para usarse en el frontend)
const SUPABASE_URL = "https://dhnbcsbalwhlcxhmjnwf.supabase.co";
const SUPABASE_KEY = "sb_publishable_9gmS9sZpt89hNPsIrL4AnA_HWJZ3mS1";

// "supabase" viene de la librería cargada por CDN en el index.html
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
