import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');

    // Get the latest mapping with version info
    const result = await sql`
      SELECT id, version, products, last_updated, updated_by 
      FROM mapping 
      ORDER BY version DESC, last_updated DESC 
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ 
        error: 'No mapping found in database',
        databaseInfo: {
          tableExists: false,
          totalRecords: 0
        }
      });
    }

    const mapping = result.rows[0];
    const products = mapping.products || [];

    // Search for specific SKU if provided
    let foundProduct = null;
    if (sku) {
      foundProduct = products.find((p: any) => 
        p.shopify_sku === sku || 
        p.flowtrac_sku === sku || 
        p.amazon_sku === sku
      );
    }

    // Get some sample SKUs for verification
    const sampleSkus = products.slice(0, 5).map((p: any) => ({
      shopify_sku: p.shopify_sku,
      flowtrac_sku: p.flowtrac_sku,
      amazon_sku: p.amazon_sku
    }));

    // Check if the specific SKU exists
    const skuExists = sku ? products.some((p: any) => 
      p.shopify_sku === sku || 
      p.flowtrac_sku === sku || 
      p.amazon_sku === sku
    ) : null;

    return NextResponse.json({
      databaseInfo: {
        version: mapping.version,
        lastUpdated: mapping.last_updated,
        updatedBy: mapping.updated_by,
        totalProducts: products.length,
        tableExists: true
      },
      searchResults: {
        sku: sku,
        found: skuExists,
        product: foundProduct
      },
      sampleSkus: sampleSkus,
      totalProducts: products.length
    });

  } catch (error) {
    console.error('Error testing mapping:', error);
    return NextResponse.json({ 
      error: 'Failed to test mapping',
      details: (error as Error).message 
    });
  }
}
