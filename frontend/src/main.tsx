import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { aboutPage } from './game/about';
import { setHost } from './game/host';
import { getLocale, getTextDirection } from './paraglide/runtime.js';
import { About } from './ui/About';
import './styles/app.css';

setHost();
// The page is served as English, whatever it turns out to be read in.
document.documentElement.lang = getLocale();
document.documentElement.dir = getTextDirection();

/** Read once: the page is the game, or one of the pages beside it. */
const ABOUT = aboutPage(location.pathname);

createRoot(document.getElementById('root')!).render(
	<StrictMode>{ABOUT ? <About page={ABOUT} /> : <App />}</StrictMode>
);
