import path from 'path';
import { loadGraphFromFile } from './graph/loader';
import { GraphStore } from './graph/store';
import { createApp } from './api/app';

const DATA_PATH = path.join(__dirname, '..', 'data', 'train-ticket.json');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const graph = loadGraphFromFile(DATA_PATH);
const store = new GraphStore(graph);
const app = createApp(store);

app.listen(PORT, () => {
  console.log(`Graph API listening on http://localhost:${PORT}`);
});
