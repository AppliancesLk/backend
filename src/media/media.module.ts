import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaController } from './controllers/media.controller';
import { ImageStorageService } from './services/image-storage.service';
@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [ImageStorageService],
  exports: [ImageStorageService],
})
export class MediaModule {}
