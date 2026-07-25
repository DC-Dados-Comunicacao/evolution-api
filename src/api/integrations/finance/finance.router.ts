import { Router } from 'express';

import { SupermarketRouter } from './supermarket/routes/supermarket.router';

export class FinanceRouter {
  public readonly router: Router;

  constructor(...guards: any[]) {
    this.router = Router();

    this.router.use('/supermarket', new SupermarketRouter(...guards).router);
  }
}
