-- Every seat says whether it is the host watching rather than playing, which no
-- seat of a game in progress is.
update lobbies
set state = jsonb_set(
	state,
	'{players}',
	coalesce(
		(select jsonb_agg(seat || '{"observing": false}' order by index)
		 from jsonb_array_elements(state -> 'players') with ordinality as seats (seat, index)),
		'[]'
	)
);
