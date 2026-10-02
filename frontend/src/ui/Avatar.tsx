import type { Profile } from '../game/players';

export function Avatar({ profile }: { profile: Profile }) {
	return (
		<span className="av" style={{ background: profile.color }} aria-hidden="true">
			{profile.emoji}
		</span>
	);
}
