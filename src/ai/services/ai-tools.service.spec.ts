import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from '../../products/services/products.service';
import { ProductCatalogService } from '../../products/services/product-catalog.service';
import { AiToolsService } from './ai-tools.service';

const first = 'a0dc4924-bce1-4043-a7de-7515f14646d2';
const second = 'a0dc4924-bce1-4043-a7de-7515f14646d3';
describe('AI catalog tool boundary', () => {
  const product = {
    productID: first,
    name: 'Washer',
    SKU: 'W1',
    category: { categoryID: second, name: 'Washers' },
    price: '100.00',
    stockQty: 3,
    specifications: { Capacity: '8 kg' },
    isActive: true,
  };
  const products = {
    findById: jest.fn(),
    findRelatedPublicProducts: jest.fn(),
  };
  const catalog = { find: jest.fn() };
  const tools = new AiToolsService(
    products as unknown as ProductsService,
    catalog as unknown as ProductCatalogService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    products.findById.mockResolvedValue(product);
    catalog.find.mockResolvedValue({ items: [product] });
    products.findRelatedPublicProducts.mockResolvedValue([
      { ...product, productID: second },
    ]);
  });
  it('returns current stock and price without private fields', async () => {
    const result = await tools.execute('getProductDetails', {
      productId: first,
    });
    expect(result).toMatchObject({
      price: '100.00',
      stockQty: 3,
      available: true,
    });
    expect(result).not.toHaveProperty('isActive');
  });
  it('propagates unknown/inactive products', async () => {
    products.findById.mockRejectedValue(new NotFoundException());
    await expect(
      tools.execute('getProductDetails', { productId: first }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('validates search constraints and uses a bounded existing catalog query', async () => {
    await tools.execute('searchProducts', {
      brand: 'Samsung',
      maxPrice: 99,
      inStock: true,
    });
    expect(catalog.find).toHaveBeenCalledWith(
      expect.objectContaining({
        brands: ['Samsung'],
        maxPrice: 99,
        inStock: true,
        limit: 5,
        sort: 'price-asc',
      }),
    );
    await expect(
      tools.execute('searchProducts', { maxPrice: '99' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      tools.execute('searchProducts', { sql: 'DROP TABLE products' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('delegates related-product visibility and bounds to ProductsService', async () => {
    const result = await tools.execute('getRelatedProducts', {
      productId: first,
    });
    expect(products.findRelatedPublicProducts).toHaveBeenCalledWith(first);
    expect(result).toMatchObject([{ productId: second }]);
  });
  it('loads both comparison products using public product rules', async () => {
    await tools.execute('compareProducts', {
      productId: first,
      otherProductId: second,
    });
    expect(products.findById.mock.calls).toEqual([[first], [second]]);
  });
  it('rejects unsupported tools, invalid IDs, and same-product comparisons', async () => {
    for (const [name, args] of [
      ['addToCart', {}],
      ['getProductDetails', { productId: 'invalid' }],
      ['compareProducts', { productId: first, otherProductId: first }],
    ] as const) {
      await expect(tools.execute(name, args)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(products.findById).not.toHaveBeenCalled();
  });
});
