create table if not exists app_users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  google_tokens jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_by text not null references app_users(id),
  created_at timestamptz not null
);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references app_users(id) on delete cascade,
  role text not null check (role in ('owner', 'reviewer')),
  joined_at timestamptz not null,
  primary key (workspace_id, user_id)
);

create table if not exists user_preferences (
  id text primary key,
  user_id text not null unique references app_users(id) on delete cascade,
  base_currency text not null default 'USD',
  locale text not null default 'en-US',
  active_workspace_id text references workspaces(id) on delete set null,
  plan text not null default 'free' check (plan in ('free', 'team', 'business'))
);

create table if not exists document_records (
  id text primary key,
  user_id text not null references app_users(id),
  workspace_id text not null references workspaces(id),
  assignee_id text references app_users(id) on delete set null,
  updated_by text references app_users(id) on delete set null,
  updated_at timestamptz,
  file_name text not null,
  file_url text,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null,
  doc_type text not null,
  fields jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  status text not null,
  raw_text text,
  extraction_error text,
  demo_mode boolean
);

create index if not exists document_records_workspace_uploaded_idx
  on document_records (workspace_id, uploaded_at desc);

create table if not exists export_presets (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  name text not null,
  spreadsheet_id text not null,
  mapping jsonb not null default '{}'::jsonb,
  mode text not null check (mode in ('append', 'new_sheet')),
  sheet_name text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists activity_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  record_id text not null,
  record_name text not null,
  actor_id text not null references app_users(id),
  actor_name text not null,
  type text not null,
  summary text not null,
  changes jsonb,
  at timestamptz not null
);

create index if not exists activity_events_workspace_at_idx
  on activity_events (workspace_id, at desc);

create table if not exists usage_events (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  record_id text,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on usage_events (user_id, created_at desc);
