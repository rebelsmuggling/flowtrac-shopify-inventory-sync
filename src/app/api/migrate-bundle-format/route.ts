import { NextRequest, NextResponse } from 'next/server';
export async function POST(request: NextRequest) {
  try {
    // Load mapping.json
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    
    let migratedCount = 0;
    
    // Convert bundle components to simple format
    for (const product of mapping.products) {
      if (product.bundle_components && Array.isArray(product.bundle_components)) {
        // Convert from JSON format to simple format
        const simpleFormat = product.bundle_components
          .map((comp: any) => `${comp.flowtrac_sku}:${comp.quantity}`)
          .join('; ');
        
        // Store the simple format in a temporary field for reference
        product.bundle_components_simple = simpleFormat;
        migratedCount++;
        
        console.log(`Migrated ${product.shopify_sku}: ${JSON.stringify(product.bundle_components)} → "${simpleFormat}"`);
      }
    }
    
    // Add migration timestamp
    mapping.lastMigration = new Date().toISOString();
    
    // Write back to mapping.json
    const result = await mappingService.updateMapping(mapping, 'api_update');
      if (!result.success) {
        throw new Error(`Failed to update mapping: ${result.error}`);
      }
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully migrated ${migratedCount} bundle components to simple format`,
      migratedCount,
      mapping
    });

  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 