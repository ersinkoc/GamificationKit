# GamificationKit Website

Official website for GamificationKit - A production-ready gamification system for Node.js.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Lucide React** - Icon library

## Structure

```
website/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── ui/        # shadcn-style components
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── pages/         # Page components
│   │   ├── Home.tsx
│   │   ├── Documentation.tsx
│   │   ├── APIReference.tsx
│   │   ├── Examples.tsx
│   │   └── GettingStarted.tsx
│   ├── styles/        # Global styles
│   ├── App.tsx        # Main app component
│   └── main.tsx       # Entry point
├── public/            # Static assets
└── dist/             # Build output (generated)
```

## Deployment

The website is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

- **URL**: https://gamificationkit.oxog.dev
- **Workflow**: `.github/workflows/deploy-website.yml`

## License

MIT
