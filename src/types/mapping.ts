export interface SimpleProductMapping {
  shopify_product_id: string;
  shopify_variant_id: string;
  flowtrac_sku: string;
}

export interface BundleComponent {
  flowtrac_sku: string;
  quantity: number;
}

export interface BundleProductMapping {
  shopify_product_id: string;
  shopify_variant_id: string;
  bundle_components: BundleComponent[];
}

export type ProductMapping = SimpleProductMapping | BundleProductMapping;

export interface MappingFile {
  products: ProductMapping[];
} 