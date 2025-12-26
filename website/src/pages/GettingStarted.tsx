import React from 'react';
import { CheckCircle, Terminal, Code, Rocket } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '../components/ui';

export const GettingStarted: React.FC = () => {
  const steps = [
    {
      icon: <Terminal className="w-6 h-6" />,
      title: 'Install the Package',
      description: 'Install GamificationKit via npm or yarn',
      code: 'npm install @oxog/gamification-kit'
    },
    {
      icon: <Code className="w-6 h-6" />,
      title: 'Initialize the Kit',
      description: 'Create and configure your gamification instance',
      code: `import { GamificationKit } from '@oxog/gamification-kit';

const gamification = new GamificationKit({
  storage: {
    type: 'memory' // Start with memory storage
  }
});

await gamification.initialize();`
    },
    {
      icon: <Rocket className="w-6 h-6" />,
      title: 'Start Using',
      description: 'Award points, badges, and more',
      code: `// Award points to a user
await gamification.points.award('user123', {
  points: 100,
  reason: 'Welcome bonus'
});

// Check for badge unlocks
await gamification.badges.checkProgress('user123');`
    }
  ];

  const storageOptions = [
    {
      name: 'Memory Storage',
      code: `storage: { type: 'memory' }`,
      description: 'Perfect for development and testing'
    },
    {
      name: 'Redis',
      code: `storage: {
  type: 'redis',
  url: 'redis://localhost:6379'
}`,
      description: 'Recommended for production use'
    },
    {
      name: 'MongoDB',
      code: `storage: {
  type: 'mongodb',
  url: 'mongodb://localhost:27017/gamification'
}`,
      description: 'Document-based storage'
    },
    {
      name: 'PostgreSQL',
      code: `storage: {
  type: 'postgres',
  host: 'localhost',
  database: 'gamification'
}`,
      description: 'Relational database storage'
    }
  ];

  const frameworks = [
    {
      name: 'Express',
      code: `import express from 'express';

const app = express();
app.use(gamification.express());

app.listen(3000);`
    },
    {
      name: 'Fastify',
      code: `import Fastify from 'fastify';

const fastify = Fastify();
await fastify.register(gamification.fastify());

await fastify.listen({ port: 3000 });`
    },
    {
      name: 'Koa',
      code: `import Koa from 'koa';

const app = new Koa();
app.use(gamification.koa());

app.listen(3000);`
    }
  ];

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Getting Started
          </h1>
          <p className="text-xl text-gray-600">
            Get up and running with GamificationKit in just a few minutes
          </p>
        </div>

        {/* Quick Start Steps */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Quick Start</h2>
          <div className="space-y-8">
            {steps.map((step, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold">
                      {index + 1}
                    </div>
                    <div className="text-primary-600">{step.icon}</div>
                    <CardTitle>{step.title}</CardTitle>
                  </div>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="code-block">
                    <pre>{step.code}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Storage Options */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Storage Options</h2>
          <p className="text-gray-600 mb-8">
            Choose the storage backend that fits your needs. All adapters implement the same interface.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {storageOptions.map((option, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{option.name}</CardTitle>
                  <CardDescription>{option.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="code-block">
                    <pre>{option.code}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Framework Integration */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Framework Integration</h2>
          <p className="text-gray-600 mb-8">
            GamificationKit provides middleware for popular Node.js frameworks.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {frameworks.map((framework, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{framework.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="code-block">
                    <pre className="text-xs">{framework.code}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Next Steps */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Next Steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="hover:scale-105 transition-transform">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <CardTitle>Explore Modules</CardTitle>
                </div>
                <CardDescription>
                  Learn about points, badges, levels, leaderboards, streaks, and quests
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:scale-105 transition-transform">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <CardTitle>View Examples</CardTitle>
                </div>
                <CardDescription>
                  Check out our comprehensive examples for common use cases
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:scale-105 transition-transform">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <CardTitle>API Reference</CardTitle>
                </div>
                <CardDescription>
                  Dive deep into the complete API documentation
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:scale-105 transition-transform">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <CardTitle>Production Guide</CardTitle>
                </div>
                <CardDescription>
                  Best practices for deploying to production
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* Requirements */}
        <section className="mt-16">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <span>Node.js 16.0.0 or higher</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <span>TypeScript 5.0+ (if using TypeScript)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <span>Storage backend (Redis, MongoDB, or PostgreSQL for production)</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};
