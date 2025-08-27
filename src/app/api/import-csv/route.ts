import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const csvText = await file.text();
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ success: false, error: 'CSV must have at least a header and one data row' }, { status: 400 });
    }

    // Parse CSV header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['shopify_sku', 'flowtrac_sku', 'product_name'];
    const optionalHeaders = ['season', 'amazon_sku', 'bundle_components'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `Missing required headers: ${missingHeaders.join(', ')}` 
      }, { status: 400 });
    }

    // Load existing mapping using the mapping service
    const { mapping: existingMapping, source } = await mappingService.getMapping();
    console.log(`Using ${source} mapping data for CSV import`);
    
    // Parse CSV data
    const newProducts = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < headers.length) continue;
      
      const product: any = {};
      headers.forEach((header, index) => {
        product[header] = values[index];
      });
      
      // Handle bundle components (optional)
      if (product.bundle_components) {
        try {
          product.bundle_components = JSON.parse(product.bundle_components);
        } catch {
          product.bundle_components = [];
        }
      }
      
      // Ensure season is included if present
      if (!product.season && headers.includes('season')) {
        product.season = '';
      }
      
      newProducts.push(product);
    }

    // Add new products to existing mapping
    existingMapping.products.push(...newProducts);
    
    // Save updated mapping using the mapping service
    const result = await mappingService.updateMapping(existingMapping, 'csv_import');
    if (!result.success) {
      throw new Error(`Failed to update mapping: ${result.error}`);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully imported ${newProducts.length} products`,
      importedCount: newProducts.length,
      totalProducts: existingMapping.products.length
    });

  } catch (error) {
    console.error('CSV import failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'CSV Import endpoint',
    instructions: 'Upload a CSV file with columns: shopify_sku, flowtrac_sku, product_name, season, amazon_sku, [bundle_components]',
    example: {
      shopify_sku: 'IC-KOOL-0045',
      flowtrac_sku: 'IC-KOOL-0045',
      product_name: 'Kool Aid Cherry',
      season: 'Summer',
      amazon_sku: 'IC-KOOL-0045-AMZ',
      bundle_components: '[]'
    }
  });
} 