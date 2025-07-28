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
      console.log('Using imported mapping data for mapping API');
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('Using file mapping data for mapping API');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
    
    return NextResponse.json({
      success: true,
      mapping,
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