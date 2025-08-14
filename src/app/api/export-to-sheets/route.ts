import { NextRequest, NextResponse } from 'next/server';
import { getMapping } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    // Load mapping from database
    const mappingResult = await getMapping();
    
    if (!mappingResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: mappingResult.error 
      }, { status: 404 });
    }
    
    const mapping = mappingResult.data;
    console.log('Using database mapping data for export');

    // Convert to CSV format for Google Sheets
    const csvRows = [];
    
    // Add header row
    csvRows.push([
      'Shopify SKU',
      'Flowtrac SKU', 
      'Product Name',
      'Amazon SKU',
      'Shopify Variant ID',
      'Shopify Inventory Item ID',
      'Bundle Components (Simple Format)'
    ]);

    // Add data rows
    for (const product of mapping.products) {
      let bundleComponentsText = '';
      if (product.bundle_components_simple) {
        // Use pre-migrated simple format
        bundleComponentsText = product.bundle_components_simple;
      } else if (product.bundle_components && Array.isArray(product.bundle_components)) {
        // Convert from JSON format to simple format on-the-fly
        bundleComponentsText = product.bundle_components
          .map((comp: any) => `${comp.flowtrac_sku}:${comp.quantity}`)
          .join('; ');
      }
      
      csvRows.push([
        product.shopify_sku || '',
        product.flowtrac_sku || '',
        product.product_name || '',
        product.amazon_sku || '',
        product.shopify_variant_id || '',
        product.shopify_inventory_item_id || '',
        bundleComponentsText
      ]);
    }

    // Convert to CSV string
    const csvContent = csvRows.map(row => 
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="mapping-export-${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Export to sheets failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 