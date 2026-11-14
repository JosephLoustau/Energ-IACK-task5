// Vérifie que les données générées localement existent avant dev/build.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../src/buildings.generated.json', import.meta.url));
if (!existsSync(file)) {
  console.error(`Données absentes : ${file}
Elles ne sont pas versionnées et doivent être générées localement :
  1. cp .env.example .env   (renseigner API_KEY ; QBUILDINGS_* optionnel)
  2. pip install -r pipeline/requirements.txt
  3. npm run data
Voir la section « Données » du README.`);
  process.exit(1);
}
