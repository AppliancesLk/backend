import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProductImagesController } from './product-images.controller';

describe('ProductImagesController authorization', () => {
  it('requires the existing ADMIN role on upload and delete operations', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProductImagesController.prototype.upload)).toEqual([UserRole.ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, ProductImagesController.prototype.remove)).toEqual([UserRole.ADMIN]);
  });
});
