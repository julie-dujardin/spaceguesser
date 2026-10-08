import { useEffect } from 'react';
import { ABOUT, CONTACT, HOSTS, UPDATED, aboutPath, type AboutPage } from '../game/about';
import { REPO } from '../game/links';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { TURNSTILE } from './useProof';

const CREDITS = 'https://spacemap.co/credits';
const TURNSTILE_TERMS = 'https://www.cloudflare.com/turnstile-privacy-policy/';

export function aboutLabel(page: AboutPage): string {
	return page === 'privacy' ? m.about_privacy() : m.about_terms();
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
					</nav>
				</header>
				<h1>{title}</h1>
				{page === 'privacy' ? <Privacy /> : <Terms />}
				<footer className="note">{m.about_updated({ date: updated })}</footer>
			</article>
		</div>
	);
}
