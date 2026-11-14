import { useEffect, useState } from 'react';
import App from './App';
import { loadBuildings } from './data';
import type { Building } from './model';

type State = { status: 'loading' } | { status: 'ready'; buildings: Building[] } | { status: 'error'; message: string };

export default function PortfolioLoader() {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    void loadBuildings(controller.signal).then(
      (buildings) => { if (!controller.signal.aborted) setState({ status: 'ready', buildings }); },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[données]', error);
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Échec du chargement des données bâtiments.' });
      },
    );
    return () => controller.abort();
  }, []);

  if (state.status === 'ready') return <App buildings={state.buildings} />;
  return <main className="data-status">
    {state.status === 'loading' ? <p role="status">Chargement des données bâtiments…</p> : <section role="alert">
      <h1>Données bâtiments indisponibles</h1>
      <p>{state.message}</p>
      <p>Configurez votre clé QuantHome dans le fichier .env local, puis générez les données avec :</p>
      <pre><code>npm run data</code></pre>
      <button className="primary-button" onClick={() => window.location.reload()}>Réessayer</button>
    </section>}
  </main>;
}
