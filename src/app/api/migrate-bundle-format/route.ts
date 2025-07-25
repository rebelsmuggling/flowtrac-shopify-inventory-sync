import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    // Load mapping.json
    const mappingPath = path.join(process.cwd(), 'mapping.json');
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
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    
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