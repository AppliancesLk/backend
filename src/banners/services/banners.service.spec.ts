import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BannerSection } from '../entities/banner-section.entity';
import { UpdateBannerSectionDto } from '../dto/update-banner-section.dto';
import { BannersService } from './banners.service';

const slide = {
  imageUrl: 'https://example.com/banner.webp',
  alt: 'Kitchen appliances',
  title: '',
  description: '',
  buttonText: 'Shop now',
  href: '/products',
};
describe('BannersService', () => {
  const repository = new Repository<BannerSection>();
  const service = new BannersService(repository);
  beforeEach(() => {
    jest
      .spyOn(repository, 'create')
      .mockImplementation((input) => input as BannerSection);
    jest
      .spyOn(repository, 'save')
      .mockImplementation(async (input) => input as BannerSection);
  });
  afterEach(() => jest.restoreAllMocks());
  it('allows four top slides but rejects five', async () => {
    await expect(
      service.update('top', { visible: true, slides: Array(4).fill(slide) }),
    ).resolves.toMatchObject({ position: 'top' });
    await expect(
      service.update('top', { visible: true, slides: Array(5).fill(slide) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['middle', 'bottom-one', 'bottom-two'])(
    'limits %s to one image',
    async (position) => {
      await expect(
        service.update(position, { visible: true, slides: [slide] }),
      ).resolves.toMatchObject({ position });
      await expect(
        service.update(position, { visible: true, slides: [slide, slide] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('rejects unknown positions, visible empty sections, and incomplete buttons', async () => {
    await expect(
      service.update('unknown', { visible: false, slides: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('top', { visible: true, slides: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update('top', {
        visible: true,
        slides: [{ ...slide, href: '' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update('top', { visible: false, slides: [] }),
    ).resolves.toMatchObject({ visible: false });
  });
  it('filters hidden sections out of public reads', async () => {
    const find = jest.spyOn(repository, 'find').mockResolvedValue([]);
    await service.findAll();
    expect(find).toHaveBeenLastCalledWith({
      where: { visible: true },
      order: { position: 'ASC' },
    });
    await service.findAll(true);
    expect(find).toHaveBeenLastCalledWith({ order: { position: 'ASC' } });
  });
  it.each([
    'javascript:alert(1)',
    '//example.com',
    '/\\example.com',
    'http://example.com',
    'data:text/html,test',
  ])('rejects unsafe destination %s', async (href) => {
    const dto = plainToInstance(UpdateBannerSectionDto, {
      visible: true,
      slides: [{ ...slide, href }],
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
