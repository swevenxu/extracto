create or replace function public.consume_document_quota(
  p_user_id text,
  p_period_start timestamptz,
  p_limit integer,
  p_event_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_period_start::text, 0));

  select count(*)::integer into current_count
  from public.usage_events
  where user_id = p_user_id and created_at >= p_period_start;

  if current_count >= p_limit then
    return current_count;
  end if;

  insert into public.usage_events (id, user_id, created_at)
  values (p_event_id, p_user_id, now());

  return current_count + 1;
end;
$$;
