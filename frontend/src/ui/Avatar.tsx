import { MARS, MARS_ICON, glyph, type Profile } from '../game/players';

/** An emoji as it is shown, which for two of them is not as it is stored. */
export function Glyph({ emoji }: { emoji: string }) {
	return emoji === MARS ? <img src={MARS_ICON} alt="" /> : <>{glyph(emoji)}</>;
}

export function Avatar({ profile }: { profile: Profile }) {
	return (
		<span className="av" style={{ background: profile.color }} aria-hidden="true">
			<Glyph emoji={profile.emoji} />
		</span>
	);
}
