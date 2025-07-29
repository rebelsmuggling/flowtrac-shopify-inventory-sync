# GitHub Token Setup for Permanent Mapping Storage

## 🔑 **Step 1: Create GitHub Personal Access Token**

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name like "Flowtrac Mapping Storage"
4. Select these scopes:
   - ✅ `repo` (Full control of private repositories)
5. Click "Generate token"
6. **Copy the token** (you won't see it again!)

## 🌍 **Step 2: Add Token to Environment**

### For Local Development:
Add to your `.env.local` file:
```
GITHUB_TOKEN=ghp_your_token_here
```

### For Vercel Production:
1. Go to your Vercel project dashboard
2. Go to Settings > Environment Variables
3. Add:
   - **Name**: `GITHUB_TOKEN`
   - **Value**: `ghp_your_token_here`
4. Click "Save"

## ✅ **Step 3: Test the Setup**

1. Restart your development server
2. Go to your app
3. Check the "Mapping Status" - should show "🔗 GitHub" if working
4. Try importing/exporting - changes will be saved to GitHub permanently

## 🔄 **How It Works**

- **Export to Sheets**: Downloads current mapping from GitHub
- **Import from Sheets**: Updates both local cache AND GitHub
- **Apply Imported Mapping**: Saves to GitHub permanently
- **Sync**: Uses GitHub as the source of truth

## 🛡️ **Security Notes**

- The token only has access to your specific repository
- You can revoke it anytime from GitHub settings
- The token is stored securely in environment variables

## 🚨 **Troubleshooting**

If you see "⚠️ Using original mapping.json":
1. Check that `GITHUB_TOKEN` is set correctly
2. Verify the token has `repo` permissions
3. Make sure the repository name is correct in the code 