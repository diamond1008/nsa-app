-- +goose Up
-- Enable Row Level Security (RLS) on remaining public tables to satisfy Supabase security linting
-- and protect against unauthorized PostgREST anon access.
-- The Go API connecting via service role / postgres role has rolbypassrls=true.
ALTER TABLE public.goose_db_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_pipeline_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- +goose Down
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_proposals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_pipeline_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.goose_db_version DISABLE ROW LEVEL SECURITY;
