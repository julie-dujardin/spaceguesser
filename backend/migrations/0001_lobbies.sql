-- Games in progress only: a row goes when its lobby closes.
create table lobbies (
	code text primary key,
	state jsonb not null,
	updated_at timestamptz not null default now()
);
