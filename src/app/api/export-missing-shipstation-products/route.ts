import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProductDescriptions } from '../../../../services/flowtrac';
import { getImportedMapping } from '../../../utils/imported-mapping-store';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY!;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET!;
const SHIPSTATION_API_BASE = 'https://ssapi.shipstation.com';

function getAuthHeader() {
  const creds = Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64');
  return `Basic ${creds}`;
}

// Helper to check if a product exists in ShipStation
async function checkShipStationProductExists(sku: string): Promise<boolean> {
  try {
    const url = `${SHIPSTATION_API_BASE}/products?sku=${encodeURIComponent(sku)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    return data.products && data.products.length > 0;
  } catch (error) {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('Exporting missing ShipStation products CSV...');

    // 1. Load mapping
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data');
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('Using file mapping data');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }

    // 2. Collect all SKUs (simple and bundle components)
    const skus = new Set<string>();
    for (const product of mapping.products) {
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }

    // 3. Check which SKUs exist in ShipStation
    console.log(`Checking ${skus.size} SKUs in ShipStation...`);
    const missingSkus: string[] = [];
    const existingSkus: string[] = [];

    for (const sku of skus) {
      const exists = await checkShipStationProductExists(sku);
      if (exists) {
        existingSkus.push(sku);
      } else {
        missingSkus.push(sku);
      }
    }

    console.log(`Found ${existingSkus.length} existing products, ${missingSkus.length} missing products`);

    // 4. Get product descriptions for missing SKUs
    let productDescriptions: Record<string, { description: string, product_name: string }> = {};
    if (missingSkus.length > 0) {
      console.log('Fetching product descriptions for missing SKUs...');
      productDescriptions = await getProductDescriptions(missingSkus);
    }

    // 5. Generate CSV content
    const headers = [
      'SKU',
      'Product Name',
      'Description',
      'Tag1',
      'Notes'
    ];

    const csvData = missingSkus.map(sku => {
      const productInfo = productDescriptions[sku];
      return [
        sku,
        productInfo?.product_name || sku,
        productInfo?.description || `Product ${sku}`,
        'Finished Chocolate',
        'Product needs to be created in ShipStation'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => [
        `"${row[0]}"`,
        `"${row[1]}"`,
        `"${row[2]}"`,
        `"${row[3]}"`,
        `"${row[4]}"`
      ].join(','))
    ].join('\n');

    // 6. Return CSV file
    const filename = `missing-shipstation-products-${new Date().toISOString().split('T')[0]}.csv`;
    
    console.log(`CSV export completed: ${missingSkus.length} missing products`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Export missing ShipStation products failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // For testing, return a summary
  return NextResponse.json({
    success: true,
    message: 'Missing ShipStation products export endpoint is ready. Use GET to export CSV.',
    example: {
      method: 'GET',
      description: 'Returns CSV of products that exist in mapping but not in ShipStation'
    }
  });
} 