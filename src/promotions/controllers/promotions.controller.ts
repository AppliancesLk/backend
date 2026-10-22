import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import {
  PromotionContentDto,
  PromotionListDto,
  SendPromotionDto,
  UpdatePromotionDto,
} from '../dto/promotion.dto';
import { PromotionsService } from '../services/promotions.service';
@Controller('admin/promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}
  @Get() list(@Query() query: PromotionListDto) {
    return this.promotions.list(query);
  }
  @Post('preview') @HttpCode(200) preview(@Body() input: PromotionContentDto) {
    return this.promotions.preview(input);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Body() input: PromotionContentDto,
  ) {
    return this.promotions.create(req.user!.sub, input);
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotions.detail(id);
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() input: UpdatePromotionDto,
  ) {
    return this.promotions.update(id, req.user!.sub, input);
  }
  @Post(':id/send') @HttpCode(202) send(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() input: SendPromotionDto,
  ) {
    return this.promotions.send(id, req.user!.sub, input);
  }
  @Get(':id/runs/:runId') run(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() query: PromotionListDto,
  ) {
    return this.promotions.runDetail(id, runId, query.page);
  }
}
