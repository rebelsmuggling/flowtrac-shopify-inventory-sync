# Project Checklist: Flowtrac-Shopify Inventory Sync

- [ ] Initialize Git repository and set up .gitignore
- [ ] Set up Prettier and ESLint for code formatting and linting
- [ ] Initialize TypeScript support in Next.js
- [ ] Add a basic README.md with project purpose, setup, and checklist reference
- [ ] Plan and document required environment variables (e.g., .env.local, Vercel)
- [ ] Research and list required dependencies (HTTP client, YAML/JSON parser, Shopify SDK, etc.)
- [ ] Plan for security: never commit secrets, basic rate limiting for public API routes

- [ ] Scaffold Next.js project structure optimized for Vercel
- [ ] Set up environment variables for API keys/secrets using Vercel’s system
- [ ] Implement API routes for Flowtrac and Shopify sync logic
- [ ] Design mapping file/config for product and bundle relationships
- [ ] Add functionality to batch upload new SKUs with their mapping (simple or bundle)
- [ ] Implement fast syncing of Shopify inventory IDs using GraphQL
- [ ] Plan for batching/parallelization to fit Vercel’s serverless limits
- [ ] Set up Vercel Cron Job for scheduled sync every 30 minutes
- [ ] Implement a sync API route/handler for the cron job
- [ ] Add logging/monitoring for scheduled syncs
- [ ] Set up Vercel Cron Jobs for scheduled syncs
- [ ] Document Vercel deployment and environment setup
- [ ] (Optional) Plan for external database if mapping/config grows large

- [ ] Define data model for products and bundles, including mapping between Flowtrac SKUs and Shopify products/variants
- [ ] Identify authentication and API access requirements for Flowtrac and Shopify
- [ ] Determine sync frequency (real-time, scheduled, manual trigger)
- [ ] Set up project structure and configuration, including secure storage of API credentials
- [ ] Implement authentication and inventory fetch from Flowtrac API
- [ ] Implement authentication and inventory update to Shopify API
- [ ] Design and implement mapping system for simple products and bundles
- [ ] Develop sync logic: fetch from Flowtrac, calculate bundle quantities, update Shopify
- [ ] Optimize for scalability and performance (batching, parallelization, rate limits)
- [ ] Implement logging, monitoring, and alerting for sync process
- [ ] Write unit and end-to-end tests for integrations and sync logic
- [ ] Document setup, configuration, usage, and provide mapping examples 