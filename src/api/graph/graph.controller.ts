import { Request, Response } from 'express';
import { FilterPosition } from '../../graph/types';
import { GraphService } from './graph.service';

const POSITIONS: FilterPosition[] = ['start', 'end', 'any'];

function toArray(value: unknown): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * Thin HTTP adapter: parses the request, calls the service, serializes the
 * result. No filter-building or graph logic lives here - see graph.service.ts.
 */
export function createGraphController(service: GraphService) {
  return {
    getFullGraph(_req: Request, res: Response): void {
      res.json(service.getFullGraph());
    },

    queryGraph(req: Request, res: Response): void {
      const rawFilters: Partial<Record<FilterPosition, string[]>> = {};
      for (const position of POSITIONS) {
        rawFilters[position] = toArray(req.query[position]);
      }
      res.json(service.queryGraph(rawFilters));
    },
  };
}
