import { NextRequest, NextResponse } from 'next/server';
import { getMapping } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku');
    
    console.log('Testing mapping database...');
    
    const result = await getMapping();
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        message: 'Failed to get mapping from database'
      });
    }
    
    const mapping = result.data;
    const totalProducts = mapping.products.length;
    
    console.log(`Found ${totalProducts} products in mapping`);
    
    // If a specific SKU was requested, search for it
    if (sku) {
      const product = mapping.products.find((p: any) => 
        p.flowtrac_sku === sku || p.shopify_sku === sku || p.amazon_sku === sku
      );
      
      if (product) {
        return NextResponse.json({
          success: true,
          sku,
          product,
          totalProducts,
          message: 'Product found in mapping'
        });
      } else {
        // Show some sample SKUs to help debug
        const sampleSkus = mapping.products.slice(0, 5).map((p: any) => ({
          shopify_sku: p.shopify_sku,
          flowtrac_sku: p.flowtrac_sku,
          amazon_sku: p.amazon_sku
        }));
        
        return NextResponse.json({
          success: false,
          sku,
          error: 'Product not found in mapping',
          totalProducts,
          sampleSkus,
          message: 'Here are some sample SKUs from the mapping'
        });
      }
    }
    
    // Return summary
    const sampleSkus = mapping.products.slice(0, 10).map((p: any) => ({
      shopify_sku: p.shopify_sku,
      flowtrac_sku: p.flowtrac_sku,
      amazon_sku: p.amazon_sku
    }));
    
    return NextResponse.json({
      success: true,
      totalProducts,
      sampleSkus,
      message: 'Mapping loaded successfully'
    });
    
  } catch (error) {
    console.error('Error testing mapping:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
