import { DataSource } from 'typeorm';
import { AppController } from './app.controller';

describe('AppController', () => {
  const mockDataSource = {
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  const appController = new AppController(mockDataSource as unknown as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('root', () => {
    it('should return the API status message', () => {
      expect(appController.getHello()).toEqual({
        message: 'Appliances.lk backend is running',
      });
    });
  });

  describe('health/database', () => {
    it('should return ok when database is connected', async () => {
      const result = await appController.checkDatabase();
      expect(result).toEqual({
        status: 'ok',
        database: 'connected',
      });
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });
  });
});
