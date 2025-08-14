import { getMapping, updateMapping } from '../lib/database';
import { getImportedMapping } from '../utils/imported-mapping-store';
import fs from 'fs';
import path from 'path';

export interface MappingProduct {
  shopify_sku: string;
  flowtrac_sku?: string;
  product_name?: string;
  amazon_sku?: string;
  shopify_variant_id?: string;
  shopify_inventory_item_id?: string;
  flowtrac_product_id?: string;
  bundle_components?: Array<{
    flowtrac_sku: string;
    quantity: number;
    flowtrac_product_id?: string;
  }>;
}

export interface MappingFile {
  products: MappingProduct[];
}

/**
 * Centralized mapping service that prioritizes database over file system
 */
export class MappingService {
  private static instance: MappingService;

  private constructor() {}

  public static getInstance(): MappingService {
    if (!MappingService.instance) {
      MappingService.instance = new MappingService();
    }
    return MappingService.instance;
  }

  /**
   * Get mapping data with priority: Database > Imported > File (always fresh, no cache)
   */
  public async getMapping(): Promise<{ mapping: MappingFile; source: string }> {
    // 1. Try database first (always fresh)
    try {
      const dbResult = await getMapping();
      if (dbResult.success && dbResult.data) {
        return { mapping: dbResult.data, source: 'database' };
      }
    } catch (error) {
      console.warn('Failed to get mapping from database:', error);
    }

    // 2. Try imported mapping
    try {
      const importedMapping = getImportedMapping();
      if (importedMapping) {
        return { mapping: importedMapping, source: 'imported' };
      }
    } catch (error) {
      console.warn('Failed to get imported mapping:', error);
    }

    // 3. Fallback to file system
    try {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      const fileContent = fs.readFileSync(mappingPath, 'utf-8');
      const mapping = JSON.parse(fileContent);
      return { mapping, source: 'file' };
    } catch (error) {
      throw new Error(`Failed to load mapping from any source: ${error}`);
    }
  }

  /**
   * Update mapping in database
   */
  public async updateMapping(mapping: MappingFile, updatedBy: string = 'system'): Promise<{ success: boolean; version?: number; error?: string }> {
    try {
      const result = await updateMapping(mapping, updatedBy);
      if (result.success) {
        return { success: true, version: result.data?.version };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get all mapped SKUs (both direct and bundle components)
   */
  public async getMappedSkus(): Promise<Set<string>> {
    const { mapping } = await this.getMapping();
    const mappedSkus = new Set<string>();
    
    for (const product of mapping.products) {
      if (product.flowtrac_sku) {
        mappedSkus.add(product.flowtrac_sku);
      }
      if (product.bundle_components) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) {
            mappedSkus.add(comp.flowtrac_sku);
          }
        }
      }
    }
    
    return mappedSkus;
  }

  /**
   * Get product by Shopify SKU
   */
  public async getProductByShopifySku(shopifySku: string): Promise<MappingProduct | null> {
    const { mapping } = await this.getMapping();
    return mapping.products.find(p => p.shopify_sku === shopifySku) || null;
  }

  /**
   * Get product by Flowtrac SKU
   */
  public async getProductByFlowtracSku(flowtracSku: string): Promise<MappingProduct | null> {
    const { mapping } = await this.getMapping();
    
    for (const product of mapping.products) {
      if (product.flowtrac_sku === flowtracSku) {
        return product;
      }
      if (product.bundle_components) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku === flowtracSku) {
            return product;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Get Flowtrac product ID for a SKU
   */
  public async getFlowtracProductId(sku: string): Promise<string | undefined> {
    const { mapping } = await this.getMapping();
    
    for (const product of mapping.products) {
      if (product.flowtrac_sku === sku && product.flowtrac_product_id) {
        return product.flowtrac_product_id;
      }
      if (product.bundle_components) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku === sku && comp.flowtrac_product_id) {
            return comp.flowtrac_product_id;
          }
        }
      }
    }
    
    return undefined;
  }

  /**
   * Set Flowtrac product ID for a SKU
   */
  public async setFlowtracProductId(sku: string, productId: string): Promise<boolean> {
    const { mapping } = await this.getMapping();
    let updated = false;
    
    for (const product of mapping.products) {
      if (product.flowtrac_sku === sku) {
        if (product.flowtrac_product_id !== productId) {
          product.flowtrac_product_id = productId;
          updated = true;
        }
      }
      if (product.bundle_components) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku === sku) {
            if (comp.flowtrac_product_id !== productId) {
              comp.flowtrac_product_id = productId;
              updated = true;
            }
          }
        }
      }
    }
    
    if (updated) {
      const result = await this.updateMapping(mapping, 'flowtrac_service');
      if (result.success) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get mapping data (always fresh, no cache)
   */
  public async getMappingFresh(): Promise<{ mapping: MappingFile; source: string }> {
    // Always fetch fresh data (no cache)
    return this.getMapping();
  }
}

// Export singleton instance
export const mappingService = MappingService.getInstance();
