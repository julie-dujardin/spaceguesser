import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setHost } from './game/host';
import { getLocale, getTextDirection } from './paraglide/runtime.js';
import './styles/app.css';

setHost();
// The page is served as English, whatever it turns out to be read in.
document.documentElement.lang = getLocale();
document.documentElement.dir = getTextDirection();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
