import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BANNER_POSITIONS,
  BannerSection,
  type BannerPosition,
} from '../entities/banner-section.entity';
import { UpdateBannerSectionDto } from '../dto/update-banner-section.dto';

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);
  constructor(
    @InjectRepository(BannerSection)
    private readonly sections: Repository<BannerSection>,
  ) {}

  findAll(admin = false) {
    return this.sections.find({
      ...(admin ? {} : { where: { visible: true } }),
      order: { position: 'ASC' },
    });
  }

  async update(position: string, input: UpdateBannerSectionDto) {
    if (!BANNER_POSITIONS.includes(position as BannerPosition))
      throw new NotFoundException('Banner position not found');
    const limit = position === 'top' ? 4 : 1;
    if (input.slides.length > limit)
      throw new BadRequestException(
        `This section supports at most ${limit} image(s)`,
      );
    if (input.visible && !input.slides.length)
      throw new BadRequestException('Add an image before showing this section');
    if (
      input.slides.some(
        (slide) => Boolean(slide.buttonText) !== Boolean(slide.href),
      )
    )
      throw new BadRequestException(
        'Button text and destination must be provided together',
      );
    try {
      const section = await this.sections.save(
        this.sections.create({
          position: position as BannerPosition,
          visible: input.visible,
          slides: input.slides,
        }),
      );
      this.logger.log(
        `Banner section updated: position=${position}, visible=${input.visible}, slides=${input.slides.length}`,
      );
      return section;
    } catch (error) {
      this.logger.error(`Banner section update failed: position=${position}`);
      throw error;
    }
  }
}
