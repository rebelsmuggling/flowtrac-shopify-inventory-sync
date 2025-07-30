import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || 'rebelsmuggling/flowtrac-shopify-inventory-sync';
    
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'No GitHub token configured' 
      });
    }

    // Test repository access by trying to get repository info
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    console.log('Repository access test response status:', response.status);

    if (response.ok) {
      const repoData = await response.json();
      return NextResponse.json({ 
        success: true, 
        message: 'Repository access successful',
        repository: {
          name: repoData.name,
          full_name: repoData.full_name,
          private: repoData.private,
          permissions: repoData.permissions
        }
      });
    } else {
      const errorText = await response.text();
      console.log('Repository access error response:', errorText);
      
      return NextResponse.json({ 
        success: false, 
        error: `Repository access failed: ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500),
          repository: GITHUB_REPO
        }
      });
    }

  } catch (error) {
    console.error('Repository access test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 