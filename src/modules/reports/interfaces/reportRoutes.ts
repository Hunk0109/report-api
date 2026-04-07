import { Router } from 'express';
import multer from 'multer';
import { appConfig } from '../../../config';
import type { ReportController } from './reportController';

export function createReportRouter(controller: ReportController): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: appConfig.uploadMaxSize }
  });

  router.get('/:id', (req, res, next) => void controller.getById(req, res, next));
  router.post('/', (req, res, next) => void controller.create(req, res, next));
  router.put('/:id', (req, res, next) => void controller.update(req, res, next));
  router.post('/:id/attachment', upload.single('file'), (req, res, next) =>
    void controller.upload(req, res, next)
  );

  return router;
}
