import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'No GitHub token configured' 
      });
    }

    // Test GitHub authentication by calling the user API
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    console.log('GitHub auth test response status:', response.status);

    if (response.ok) {
      const userData = await response.json();
      return NextResponse.json({ 
        success: true, 
        message: 'GitHub authentication successful',
        user: {
          login: userData.login,
          id: userData.id,
          name: userData.name
        }
      });
    } else {
      const errorText = await response.text();
      console.log('GitHub auth error response:', errorText);
      
      return NextResponse.json({ 
        success: false, 
        error: `GitHub authentication failed: ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500)
        }
      });
    }

  } catch (error) {
    console.error('GitHub auth test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 