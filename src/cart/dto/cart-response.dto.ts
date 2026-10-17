export interface CartResponseDto {
  id: string | null;
  currency: 'LKR';
  items: {
    id: string;
    productId: string;
    name: string;
    SKU: string;
    images: string[];
    quantity: number;
    stockQty: number;
    isAvailable: boolean;
    unitPrice: string;
    lineTotal: string;
  }[];
  itemCount: number;
  subtotal: string;
}
