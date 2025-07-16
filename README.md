# Flowtrac-Shopify Inventory Sync

## Project Purpose
Synchronize inventory quantities for specific products from Flowtrac to Shopify. Supports thousands of products, including complex bundles where multiple Flowtrac SKUs and quantities map to individual Shopify items.

## Features
- Sync inventory for simple and bundled products
- Batch upload of new SKUs and mappings
- Fast Shopify inventory ID sync using GraphQL
- Optimized for Vercel deployment (Next.js, serverless)

## Quick Start
1. **Clone the repository:**
   ```sh
   git clone git@github.com:rebelsmuggling/flowtrac-shopify-inventory-sync.git
   cd flowtrac-shopify-inventory-sync
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Set up environment variables:**
   - Copy `.env.example` to `.env.local` and fill in your API keys and secrets.
4. **Run the development server:**
   ```sh
   npm run dev
   ```
5. **Deploy to Vercel:**
   - Connect your repo to Vercel and follow the deployment instructions.

## Vercel Deployment & Environment Setup

1. **Connect your GitHub repository to Vercel:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard) and import your project.
2. **Set environment variables in Vercel:**
   - In your Vercel project, go to **Settings > Environment Variables**.
   - Add all variables from `.env.example` with your production values.
3. **Verify scheduled syncs:**
   - The `/api/sync` endpoint will be triggered every 30 minutes by the Vercel cron job (see `vercel.json`).
   - Check Vercel logs for sync job output and errors.
4. **Redeploy as needed:**
   - Any changes to environment variables or code will require a redeploy to take effect.

## Project Checklist
See [`docs/project_checklist.md`](docs/project_checklist.md) for the full project plan and progress.

## Documentation
- Flowtrac API: See [`docs/`](docs/)
- Shopify API: See [`docs/shopify_api_reference.md`](docs/shopify_api_reference.md)

## Contributing
Pull requests and issues are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
[MIT](LICENSE) 