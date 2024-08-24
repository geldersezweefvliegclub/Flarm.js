import { Test, TestingModule } from '@nestjs/testing';
import { PegasusService } from './pegasus.service';

describe('PegasusService', () => {
  let service: PegasusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PegasusService],
    }).compile();

    service = module.get<PegasusService>(PegasusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
