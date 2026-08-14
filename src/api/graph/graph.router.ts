import { Router } from 'express';
import { GraphService } from './graph.service';
import { createGraphController } from './graph.controller';

export function createGraphRouter(service: GraphService): Router {
  const router = Router();
  const controller = createGraphController(service);

  router.get('/graph', controller.getFullGraph);
  router.get('/graph/query', controller.queryGraph);

  return router;
}
