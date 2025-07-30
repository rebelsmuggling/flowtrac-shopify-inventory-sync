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
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const persistRes = await fetch(`${baseUrl}/api/persist-mapping`, {
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
    let githubUpdateSuccess = false;
    let githubErrorDetails = null;
    
    if (process.env.GITHUB_TOKEN) {
      try {
        console.log('Attempting to update GitHub mapping directly...');
        console.log('Token available, length:', process.env.GITHUB_TOKEN.length);
        
        // First get the current file to get the SHA
        const currentFileResponse = await fetch(
          'https://api.github.com/repos/rebelsmuggling/flowtrac-shopify-inventory-sync/contents/mapping.json',
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        );

        if (!currentFileResponse.ok) {
          throw new Error(`Failed to get current file SHA: ${currentFileResponse.status}`);
        }

        const fileData = await currentFileResponse.json();
        const sha = fileData.sha;

        // Update the file directly
        const updateResponse = await fetch(
          'https://api.github.com/repos/rebelsmuggling/flowtrac-shopify-inventory-sync/contents/mapping.json',
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `Update mapping.json - ${new Date().toISOString()}`,
              content: Buffer.from(JSON.stringify(mapping, null, 2)).toString('base64'),
              sha: sha,
            }),
          }
        );
        
        console.log('GitHub API response status:', updateResponse.status);
        
        if (updateResponse.ok) {
          const githubData = await updateResponse.json();
          console.log('Mapping data updated on GitHub successfully:', githubData);
          githubUpdateSuccess = true;
        } else {
          const errorText = await updateResponse.text();
          console.error('GitHub update failed:', updateResponse.status, errorText);
          githubErrorDetails = {
            status: updateResponse.status,
            statusText: updateResponse.statusText,
            errorText: errorText.substring(0, 500) // First 500 chars
          };
        }
      } catch (githubError) {
        console.error('Could not update GitHub mapping:', githubError);
        githubErrorDetails = {
          error: (githubError as Error).message,
          stack: (githubError as Error).stack
        };
      }
    } else {
      console.log('GITHUB_TOKEN not available, skipping GitHub update');
      githubErrorDetails = 'No GITHUB_TOKEN configured';
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
      productCount: mapping.products?.length || 0,
      githubUpdated: githubUpdateSuccess,
      githubError: githubErrorDetails
    });

  } catch (error) {
    console.error('Update mapping failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 