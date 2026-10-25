import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorefrontTheme } from '../entities/storefront-theme.entity';
import { SeasonalTheme } from '../enums/seasonal-theme.enum';
import { defaultThemeSettings, resolveTheme } from '../helpers/resolve-theme';
import { UpdateStorefrontThemeDto } from '../dto/update-storefront-theme.dto';

@Injectable()
export class StorefrontThemeService {
  private readonly logger = new Logger(StorefrontThemeService.name);
  constructor(private readonly dataSource: DataSource) {}
  async settings() {
    try {
      return (
        (await this.dataSource.manager.findOneBy(StorefrontTheme, { id: 1 })) ??
        defaultThemeSettings()
      );
    } catch {
      this.logger.warn({ operation: 'storefront.theme.read.failed' });
      throw new ServiceUnavailableException(
        'Seasonal settings are temporarily unavailable',
      );
    }
  }
  async publicTheme() {
    return resolveTheme(await this.settings());
  }
  async adminSettings() {
    const settings = await this.settings();
    return {
      theme: settings.theme,
      headline: settings.headline,
      message: settings.message,
      showGreeting: settings.showGreeting,
      decorations: settings.decorations,
      animations: settings.animations,
      startsAt: settings.startsAt,
      endsAt: settings.endsAt,
      version: settings.version,
      updatedAt: settings.updatedAt,
      active: resolveTheme(settings),
    };
  }
  async update(actorId: string, input: UpdateStorefrontThemeDto) {
    const isDefault = input.theme === SeasonalTheme.DEFAULT;
    const startsAt =
      !isDefault && input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = !isDefault && input.endsAt ? new Date(input.endsAt) : null;
    if (
      (startsAt && !Number.isFinite(startsAt.getTime())) ||
      (endsAt && !Number.isFinite(endsAt.getTime()))
    )
      throw new BadRequestException('Choose valid dates with a timezone');
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime())
      throw new BadRequestException('The end must be after the start');
    if (endsAt && endsAt.getTime() <= Date.now())
      throw new BadRequestException('Choose an end time in the future');
    try {
      await this.dataSource.transaction(async (manager) => {
        const settings = await manager.findOne(StorefrontTheme, {
          where: { id: 1 },
          lock: { mode: 'pessimistic_write' },
        });
        if (!settings || settings.version !== input.version)
          throw new ConflictException(
            'Theme settings changed in another session. Reload the settings before saving',
          );
        Object.assign(settings, {
          theme: input.theme,
          headline: isDefault ? '' : input.headline,
          message: isDefault ? '' : input.message,
          showGreeting: isDefault ? true : input.showGreeting,
          decorations: isDefault ? true : input.decorations,
          animations: isDefault ? true : (input.animations ?? true),
          startsAt,
          endsAt,
          version: settings.version + 1,
          updatedBy: actorId,
        });
        await manager.save(StorefrontTheme, settings);
      });
      this.logger.log({
        operation: 'storefront.theme.updated',
        actorId,
        theme: input.theme,
        scheduled: Boolean(startsAt),
      });
      return this.adminSettings();
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error({
        operation: 'storefront.theme.update.failed',
        actorId,
      });
      throw new ServiceUnavailableException(
        'Unable to save the seasonal theme. Please try again',
      );
    }
  }
}
