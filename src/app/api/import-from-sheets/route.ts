import { NextRequest, NextResponse } from 'next/server';
import { updateMapping } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: 'No file provided' 
      }, { status: 400 });
    }

    // Read the CSV content
    const csvContent = await file.text();
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'CSV file must have at least a header and one data row' 
      }, { status: 400 });
    }

    // Parse CSV (simple parser - assumes quoted values)
    const parseCSVLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Parse header and data
    const header = parseCSVLine(lines[0]);
    const products = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < header.length) continue; // Skip incomplete rows
      
      const product: any = {};
      
      // Map CSV columns to product properties
      for (let j = 0; j < header.length; j++) {
        const columnName = header[j].toLowerCase().replace(/\s+/g, '_');
        const value = values[j];
        
        switch (columnName) {
          case 'shopify_sku':
            product.shopify_sku = value;
            break;
          case 'flowtrac_sku':
            product.flowtrac_sku = value;
            break;
          case 'product_name':
            product.product_name = value;
            break;
          case 'amazon_sku':
            product.amazon_sku = value;
            break;
          case 'shopify_variant_id':
            product.shopify_variant_id = value;
            break;
          case 'shopify_inventory_item_id':
            product.shopify_inventory_item_id = value;
            break;
          case 'bundle_components_(simple_format)':
            if (value && value.trim()) {
              try {
                // Parse simple format: "SKU1:2; SKU2:1; SKU3:3"
                const components = value.split(';').map(comp => comp.trim()).filter(comp => comp);
                const bundleComponents = components.map(comp => {
                  const [flowtrac_sku, quantity] = comp.split(':').map(s => s.trim());
                  return {
                    flowtrac_sku,
                    quantity: parseInt(quantity) || 1
                  };
                });
                product.bundle_components = bundleComponents;
              } catch (e) {
                console.warn(`Failed to parse bundle components for row ${i}:`, value);
              }
            }
            break;
        }
      }
      
      // Only add products that have at least a Shopify SKU or Flowtrac SKU
      if (product.shopify_sku || product.flowtrac_sku) {
        products.push(product);
      }
    }

    // Save to database
    const mapping = { products };
    const result = await updateMapping(mapping, 'sheets-import');
    
    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully imported ${products.length} products from Google Sheets to database.`,
      productCount: products.length,
      version: result.data.version,
      updatedAt: result.data.last_updated
    });

  } catch (error) {
    console.error('Import from sheets failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 