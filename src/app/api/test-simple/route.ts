import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test GitHub repository access
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ 
        success: true, 
        message: 'Simple test endpoint is working (updated)',
        timestamp: new Date().toISOString(),
        github: 'No token configured'
      });
    }

    // Test GitHub repository access
    const response = await fetch('https://api.github.com/repos/rebelsmuggling/flowtrac-shopify-inventory-sync', {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.ok) {
      const repoData = await response.json();
      
      // Also test the mapping file access
      try {
        const mappingResponse = await fetch(
          `https://api.github.com/repos/rebelsmuggling/flowtrac-shopify-inventory-sync/contents/mapping.json`,
          {
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        );
        
        let mappingStatus = 'unknown';
        if (mappingResponse.ok) {
          const mappingData = await mappingResponse.json();
          mappingStatus = `File found (${mappingData.size} bytes)`;
        } else {
          mappingStatus = `File not found: ${mappingResponse.status}`;
        }
        
        return NextResponse.json({ 
          success: true, 
          message: 'Simple test endpoint is working',
          timestamp: new Date().toISOString(),
          github: {
            status: 'success',
            repository: repoData.name,
            full_name: repoData.full_name,
            private: repoData.private,
            mapping_file: mappingStatus
          }
        });
      } catch (mappingError) {
        return NextResponse.json({ 
          success: true, 
          message: 'Simple test endpoint is working',
          timestamp: new Date().toISOString(),
          github: {
            status: 'success',
            repository: repoData.name,
            full_name: repoData.full_name,
            private: repoData.private,
            mapping_file: `Error: ${(mappingError as Error).message}`
          }
        });
      }
    } else {
      return NextResponse.json({ 
        success: true, 
        message: 'Simple test endpoint is working',
        timestamp: new Date().toISOString(),
        github: {
          status: 'error',
          error: `Repository access failed: ${response.status}`
        }
      });
    }

  } catch (error) {
    return NextResponse.json({ 
      success: true, 
      message: 'Simple test endpoint is working',
      timestamp: new Date().toISOString(),
      github: {
        status: 'error',
        error: (error as Error).message
      }
    });
  }
} 