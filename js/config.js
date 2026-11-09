// Configuración pública (la clave "anon" de Supabase es pública por diseño; la seguridad la dan las políticas RLS).
window.TP_CONFIG = {
  supabaseUrl: "https://qszsfrntowvxtncvwwwf.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzenNmcm50b3d2eHRuY3Z3d3dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMTYzOTQsImV4cCI6MjEwOTc5MjM5NH0.dkH1pbaqI7kbzVP3Qubpx2PaCDE0as6s8ZMhp_MIa2g",
  googleLogin: false,          // ponlo a true cuando actives Google en Supabase → Authentication → Providers
  dataUrl: "data/questions.json",
};
