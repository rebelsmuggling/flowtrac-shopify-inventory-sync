import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getImportedMapping } from '../../../utils/imported-mapping-store';

export async function GET(request: NextRequest) {
  try {
    // Load mapping.json (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data for export');
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('Using file mapping data for export');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }

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