import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import { getMapping } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    // Priority order: 1. Database, 2. Imported mapping, 3. Local file
    let mapping;
    let source = 'file';
    
    // 1. Try database first
    const dbResult = await getMapping();
    if (dbResult.success) {
      console.log('Using database mapping data for mapping API');
      mapping = dbResult.data;
      source = 'database';
    } else {
      console.log('Database mapping not available, trying imported mapping');
    }
    
    // 2. Try imported mapping
    if (!mapping) {
      const importedMapping = getImportedMapping();
      if (importedMapping) {
        console.log('Using imported mapping data for mapping API');
        mapping = importedMapping;
        source = 'imported';
      }
    }
    
    // 3. Fallback to file system
    if (!mapping) {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('Using file mapping data for mapping API');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
    
    return NextResponse.json({
      success: true,
      mapping,
      source,
      productCount: mapping.products.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to load mapping:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 