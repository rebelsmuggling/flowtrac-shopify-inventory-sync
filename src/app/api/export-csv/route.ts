import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';

export async function GET(request: NextRequest) {
  try {
    // Load current mapping using the mapping service
    const { mapping, source } = await mappingService.getMapping();
    console.log(`Using ${source} mapping data for CSV export`);
    
    // Convert to CSV format
    const headers = ['shopify_sku', 'flowtrac_sku', 'product_name', 'season', 'amazon_sku', 'bundle_components'];
    const csvRows = [headers.join(',')];
    
    mapping.products.forEach((product: any) => {
      const row = [
        product.shopify_sku || '',
        product.flowtrac_sku || '',
        product.product_name || '',
        product.season || '',
        product.amazon_sku || '',
        product.bundle_components ? JSON.stringify(product.bundle_components) : '[]'
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    // Create response with CSV file
    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="mapping-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
    
    return response;

  } catch (error) {
    console.error('CSV export failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 