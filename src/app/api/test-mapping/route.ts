import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import { getCachedMapping } from '../../../utils/mapping-cache';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');

    // Test all three mapping sources
    const results = {
      database: null as any,
      imported: null as any,
      file: null as any,
      cache: null as any
    };

    // 1. Test Database
    try {
      const dbResult = await sql`
        SELECT id, version, products, last_updated, updated_by 
        FROM mapping 
        ORDER BY version DESC, last_updated DESC 
        LIMIT 1
      `;
      
      if (dbResult.rows.length > 0) {
        results.database = {
          version: dbResult.rows[0].version,
          lastUpdated: dbResult.rows[0].last_updated,
          updatedBy: dbResult.rows[0].updated_by,
          totalProducts: dbResult.rows[0].products?.length || 0,
          skuFound: sku ? dbResult.rows[0].products?.some((p: any) => 
            p.shopify_sku === sku || p.flowtrac_sku === sku || p.amazon_sku === sku
          ) : null
        };
      }
    } catch (error) {
      results.database = { error: (error as Error).message };
    }

    // 2. Test Imported Mapping
    try {
      const importedMapping = getImportedMapping();
      if (importedMapping) {
        results.imported = {
          totalProducts: importedMapping.products?.length || 0,
          skuFound: sku ? importedMapping.products?.some((p: any) => 
            p.shopify_sku === sku || p.flowtrac_sku === sku || p.amazon_sku === sku
          ) : null
        };
      } else {
        results.imported = { available: false };
      }
    } catch (error) {
      results.imported = { error: (error as Error).message };
    }

    // 3. Test Cache
    try {
      const cachedMapping = getCachedMapping();
      if (cachedMapping) {
        results.cache = {
          totalProducts: cachedMapping.products?.length || 0,
          skuFound: sku ? cachedMapping.products?.some((p: any) => 
            p.shopify_sku === sku || p.flowtrac_sku === sku || p.amazon_sku === sku
          ) : null
        };
      } else {
        results.cache = { available: false };
      }
    } catch (error) {
      results.cache = { error: (error as Error).message };
    }

    // 4. Test File System
    try {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      if (fs.existsSync(mappingPath)) {
        const fileContent = fs.readFileSync(mappingPath, 'utf-8');
        const fileMapping = JSON.parse(fileContent);
        results.file = {
          totalProducts: fileMapping.products?.length || 0,
          skuFound: sku ? fileMapping.products?.some((p: any) => 
            p.shopify_sku === sku || p.flowtrac_sku === sku || p.amazon_sku === sku
          ) : null
        };
      } else {
        results.file = { exists: false };
      }
    } catch (error) {
      results.file = { error: (error as Error).message };
    }

    // Determine which source the mapping service would use
    let recommendedSource = 'database';
    if (results.database?.error) {
      if (results.imported?.totalProducts) {
        recommendedSource = 'imported';
      } else if (results.file?.totalProducts) {
        recommendedSource = 'file';
      }
    }

    return NextResponse.json({
      sku: sku,
      mappingSources: results,
      recommendedSource,
      analysis: {
        databaseAvailable: !results.database?.error && results.database?.totalProducts > 0,
        importedAvailable: results.imported?.totalProducts > 0,
        fileAvailable: results.file?.totalProducts > 0,
        cacheAvailable: results.cache?.totalProducts > 0,
        skuInDatabase: results.database?.skuFound,
        skuInImported: results.imported?.skuFound,
        skuInFile: results.file?.skuFound,
        skuInCache: results.cache?.skuFound
      }
    });

  } catch (error) {
    console.error('Error testing mapping sources:', error);
    return NextResponse.json({ 
      error: 'Failed to test mapping sources',
      details: (error as Error).message 
    });
  }
}
