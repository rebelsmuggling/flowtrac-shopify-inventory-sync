import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getImportedMapping } from '../../../utils/imported-mapping-store';

export async function GET(request: NextRequest) {
  try {
    // Priority order: 1. Imported mapping, 2. GitHub, 3. Local file
    let mapping;
    let source = 'file';
    
    const importedMapping = getImportedMapping();
    if (importedMapping) {
      console.log('Using imported mapping data for mapping API');
      mapping = importedMapping;
      source = 'imported';
    } else if (process.env.GITHUB_TOKEN) {
      // Try GitHub if token is available
      try {
        const githubRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/github-mapping`);
        if (githubRes.ok) {
          const githubData = await githubRes.json();
          if (githubData.success) {
            console.log('Using GitHub mapping data for mapping API');
            mapping = githubData.mapping;
            source = 'github';
          }
        }
      } catch (githubError) {
        console.log('GitHub mapping not available, falling back to file');
      }
    }
    
    // Fallback to file system
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