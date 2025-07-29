import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { setImportedMapping } from '../../../utils/imported-mapping-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mapping } = body;
    
    if (!mapping) {
      return NextResponse.json({ 
        success: false, 
        error: 'No mapping data provided' 
      }, { status: 400 });
    }

    // Store the mapping data in memory and persist it
    setImportedMapping(mapping);
    
    // Also persist to the cache for longer-term storage
    try {
      const persistRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/persist-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping })
      });
      if (persistRes.ok) {
        console.log('Mapping data persisted successfully');
      }
    } catch (persistError) {
      console.log('Could not persist mapping (this is okay for local development):', persistError);
    }

    // Also update GitHub if token is available
    if (process.env.GITHUB_TOKEN) {
      try {
        const githubRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/github-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping })
        });
        if (githubRes.ok) {
          const githubData = await githubRes.json();
          console.log('Mapping data updated on GitHub successfully');
        }
      } catch (githubError) {
        console.log('Could not update GitHub mapping:', githubError);
      }
    }
    
    // Also try to write to file system (for local development)
    try {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    } catch (fileError) {
      console.log('Could not write to file system (expected in Vercel):', fileError);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully updated mapping with ${mapping.products?.length || 0} products`,
      productCount: mapping.products?.length || 0
    });

  } catch (error) {
    console.error('Update mapping failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 