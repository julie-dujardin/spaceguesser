import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { acceptTerms } from './game/host';
import './styles/app.css';

acceptTerms();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
