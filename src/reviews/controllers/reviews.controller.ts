import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { ReviewsService } from '../services/reviews.service';
import { ReviewQueryDto, SaveReviewDto } from '../dto/review.dto';
@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get() list(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviews.list(productId, query.page);
  }
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  admin(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviews.list(productId, query.page, true);
  }
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  mine(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.mine(productId, req.user!.sub);
  }
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: SaveReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.save(productId, req.user!.sub, input, false);
  }
  @Put('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: SaveReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.save(productId, req.user!.sub, input, true);
  }
  @Delete(':reviewId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.remove(
      productId,
      reviewId,
      req.user!.sub,
      req.user!.role,
    );
  }
}
