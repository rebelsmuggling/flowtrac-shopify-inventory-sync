import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products } = body;
    
    if (!Array.isArray(products)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Request body must contain a "products" array' 
      }, { status: 400 });
    }

    // Validate each product
    const requiredFields = ['shopify_sku', 'flowtrac_sku', 'product_name'];
    const invalidProducts = [];
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const missingFields = requiredFields.filter(field => !product[field]);
      if (missingFields.length > 0) {
        invalidProducts.push({
          index: i,
          product,
          missingFields
        });
      }
    }
    
    if (invalidProducts.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Some products are missing required fields',
        invalidProducts 
      }, { status: 400 });
    }

    // Load existing mapping
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    const existingMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    
    // Check for duplicates
    const existingSkus = new Set(existingMapping.products.map((p: any) => p.shopify_sku));
    const duplicates = products.filter(p => existingSkus.has(p.shopify_sku));
    
    if (duplicates.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Some products already exist',
        duplicates: duplicates.map(p => p.shopify_sku)
      }, { status: 400 });
    }

    // Add new products
    existingMapping.products.push(...products);
    
    // Save updated mapping
    fs.writeFileSync(mappingPath, JSON.stringify(existingMapping, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully added ${products.length} products`,
      addedCount: products.length,
      totalProducts: existingMapping.products.length
    });

  } catch (error) {
    console.error('Bulk add failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Bulk Add endpoint',
    instructions: 'POST JSON with products array',
    example: {
      products: [
        {
          shopify_sku: 'IC-KOOL-0045',
          flowtrac_sku: 'IC-KOOL-0045',
          product_name: 'Kool Aid Cherry',
          bundle_components: []
        }
      ]
    }
  });
} 