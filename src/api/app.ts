import express, { Express } from 'express';
import { GraphStore } from '../graph/store';
import { GraphService } from './graph/graph.service';
import { createGraphRouter } from './graph/graph.router';

export function createApp(store: GraphStore): Express {
  const app = express();
  const graphService = new GraphService(store);
  app.use('/api', createGraphRouter(graphService));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}
