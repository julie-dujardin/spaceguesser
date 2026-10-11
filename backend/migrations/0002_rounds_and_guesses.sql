-- What a lobby's task holds stays in its row. What is only read now and then is
-- beside it, as the text it is relayed as: a game's rounds, and each guess.
alter table lobbies add column rounds json not null default '[]';

create table guesses (
	code text not null references lobbies on delete cascade,
	round integer not null,
	player text not null,
	result json not null,
	primary key (code, round, player)
);

-- The games in progress, whose rows held all of it.
insert into guesses (code, round, player, result)
select lobbies.code, round.index - 1, guess.key, guess.value::json
from lobbies,
	jsonb_array_elements(state -> 'results') with ordinality as round (guesses, index),
	jsonb_each(round.guesses) as guess
where state ? 'results';

update lobbies
set rounds = (state -> 'rounds')::json,
	state = state - 'rounds' - 'results' || jsonb_build_object(
		'total', jsonb_array_length(state -> 'rounds'),
		'guessed', coalesce(
			(select jsonb_agg(player) from jsonb_object_keys(state -> 'results' -> (state ->> 'round')::int) as player),
			'[]'
		)
	)
where state ? 'results';
