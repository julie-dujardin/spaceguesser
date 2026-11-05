import { useEffect } from 'react';
import { ABOUT, CONTACT, HOSTS, UPDATED, aboutPath, type AboutPage } from '../game/about';
import { REPO, SITE } from '../game/links';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { TURNSTILE } from './useProof';

const CREDITS = 'https://spacemap.co/credits';
const TURNSTILE_TERMS = 'https://www.cloudflare.com/turnstile-privacy-policy/';

const LABELS: Record<AboutPage, () => string> = {
	about: m.about_about,
	privacy: m.about_privacy,
	terms: m.about_terms
};

export function aboutLabel(page: AboutPage): string {
	return LABELS[page]();
}

/** A link out, written as where it goes. */
function Out({ href }: { href: string }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{href.replace(/^https:\/\//, '')}
		</a>
	);
}

function Contact() {
	return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

/** The README's own words, so it is English in every locale. */
function Game() {
	return (
		<div lang="en" dir="ltr">
			<p className="lede">
				You're standing somewhere in the solar system. Look around to figure out where you are, and
				place your guess on the map. This is like GeoGuessr, but the playing area is the entire
				solar system.
			</p>
			<p>
				This game is built on top of <a href={`${SITE}/view`}>14k ground panoramas</a>, most
				provided by NASA: their Mars rovers can generally navigate to a point autonomously, but
				rarely choose their targets. These panoramas are used by scientists to identify interesting
				locations, or when manual control is needed.
			</p>
			<p>
				Playing with just Mars would be boring. About half of rounds will be played on orbital views
				provided by the <a href="https://spacemap.co">SpaceMap SDK</a>, which can render all mapped
				worlds in the solar system.
			</p>
			<p>
				Game modes: Start with the tutorial, then go for the daily challenge or quick play. Play
				with your friends by starting a multiplayer lobby and sharing the code.
			</p>
			<p>
				No accounts needed, all data stays local during solo play. In multiplayer, all data is
				deleted after the end of the game.
			</p>
		</div>
	);
}

function Privacy() {
	return (
		<>
			<p className="lede">{m.privacy_lede()}</p>

			<h2>{m.privacy_solo_title()}</h2>
			<p>{m.privacy_solo()}</p>

			<h2>{m.privacy_friends_title()}</h2>
			<p>{m.privacy_friends_sent()}</p>
			{TURNSTILE && (
				<p>
					{m.privacy_friends_check()} <Out href={TURNSTILE_TERMS} />
				</p>
			)}
			<p>{m.privacy_friends_kept()}</p>
			<p>{m.privacy_friends_name()}</p>

			<h2>{m.privacy_device_title()}</h2>
			<p>{m.privacy_device()}</p>

			<h2>{m.privacy_traffic_title()}</h2>
			<p>{m.privacy_traffic_cloudflare()}</p>
			<p>{m.privacy_traffic_server()}</p>
			<p>{TURNSTILE ? m.privacy_traffic_else_check() : m.privacy_traffic_else()}</p>

			<h2>{m.privacy_rights_title()}</h2>
			<p>{m.privacy_rights()}</p>
			<p>
				{m.privacy_rights_contact()} <Contact />
			</p>
			<p>{m.privacy_rights_authority()}</p>
		</>
	);
}

function Terms() {
	return (
		<>
			<p className="lede">{m.terms_lede()}</p>

			<h2>{m.terms_game_title()}</h2>
			<p>{m.terms_game()}</p>

			<h2>{m.terms_others_title()}</h2>
			<p>{m.terms_others()}</p>

			<h2>{m.terms_imagery_title()}</h2>
			<p>{m.terms_imagery()}</p>
			<p>
				<Out href={CREDITS} /> · <Out href={REPO} />
			</p>

			<h2>{m.terms_liability_title()}</h2>
			<p>{m.terms_liability()}</p>

			<h2>{m.terms_who_title()}</h2>
			<p>{m.terms_who()}</p>
			<ul>
				{HOSTS.map((host) => (
					<li key={host}>{host}</li>
				))}
			</ul>
			<p>
				{m.terms_who_contact()} <Contact />
			</p>

			<h2>{m.terms_changes_title()}</h2>
			<p>{m.terms_changes()}</p>
		</>
	);
}

export function About({ page }: { page: AboutPage }) {
	const title = aboutLabel(page);
	useEffect(() => {
		document.title = `${title} · spaceguesser`;
	}, [title]);

	const updated = new Date(UPDATED).toLocaleDateString(getLocale(), {
		dateStyle: 'long',
		timeZone: 'UTC'
	});
	return (
		<div className="about">
			<article>
				<header>
					<a className="mark" href="/">
						spaceguesser
					</a>
					<nav>
						{ABOUT.map((other) => (
							<a
								key={other}
								href={aboutPath(other)}
								aria-current={other === page ? 'page' : undefined}
							>
								{aboutLabel(other)}
							</a>
						))}
						<a href={REPO} target="_blank" rel="noopener noreferrer">
							{m.about_github()}
						</a>
					</nav>
				</header>
				<h1>{title}</h1>
				{page === 'about' ? <Game /> : page === 'privacy' ? <Privacy /> : <Terms />}
				{page !== 'about' && <footer className="note">{m.about_updated({ date: updated })}</footer>}
			</article>
		</div>
	);
}
