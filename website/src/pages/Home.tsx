import React from 'react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Shield,
  Layers,
  Code,
  Database,
  Award,
  TrendingUp,
  Target,
  Users,
  CheckCircle,
  ArrowRight,
  Github,
  Download
} from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '../components/ui';

export const Home: React.FC = () => {
  const features = [
    {
      icon: <Award className="w-6 h-6" />,
      title: 'Complete Gamification',
      description: 'Points, badges, levels, leaderboards, streaks, quests, and achievements - all in one package.'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Production Ready',
      description: 'Battle-tested with comprehensive testing, error handling, and security measures built-in.'
    },
    {
      icon: <Database className="w-6 h-6" />,
      title: 'Multiple Storage Options',
      description: 'Support for Memory, Redis, MongoDB, and PostgreSQL with easy-to-implement adapter interface.'
    },
    {
      icon: <Code className="w-6 h-6" />,
      title: 'Framework Agnostic',
      description: 'Works with Express, Fastify, Koa, or any Node.js framework with middleware support.'
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: 'Modular Architecture',
      description: 'Event-driven design with loosely coupled modules that can be used independently.'
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'TypeScript First',
      description: 'Written in TypeScript with full type safety and comprehensive type definitions.'
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Real-time Updates',
      description: 'Built-in WebSocket support for real-time event broadcasting to connected clients.'
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: 'Advanced Rules Engine',
      description: 'Complex condition evaluation for automated rewards and dynamic gameplay mechanics.'
    },
  ];

  const stats = [
    { label: 'NPM Downloads', value: '10K+' },
    { label: 'GitHub Stars', value: '500+' },
    { label: 'Production Users', value: '100+' },
    { label: 'Test Coverage', value: '95%' },
  ];

  const modules = [
    { name: 'Points', description: 'Award and manage user points with limits and decay' },
    { name: 'Badges', description: 'Achievement system with progress tracking' },
    { name: 'Levels', description: 'XP-based leveling with prestige support' },
    { name: 'Leaderboards', description: 'Rankings with multiple time periods' },
    { name: 'Streaks', description: 'Track consecutive actions with freeze protection' },
    { name: 'Quests', description: 'Daily/weekly challenges with objectives' },
    { name: 'Achievements', description: 'Milestone-based rewards system' },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="gradient-bg py-20 md:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="primary" className="mb-6">
              v2.0.0 - Now with TypeScript!
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 animate-fade-in">
              Production-Ready
              <span className="gradient-text"> Gamification</span>
              <br />
              for Node.js
            </h1>
            <p className="text-xl text-gray-600 mb-8 animate-slide-up">
              A comprehensive, modular gamification system with points, badges, levels, leaderboards, and more.
              Built with TypeScript, designed for production, ready for scale.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
              <Link to="/getting-started">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  Get Started
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="https://github.com/ersinkoc/GamificationKit" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  <Github className="w-5 h-5 mr-2" />
                  View on GitHub
                </Button>
              </a>
            </div>

            {/* Installation */}
            <div className="mt-12 bg-white/80 backdrop-blur rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-600">Quick Install</span>
                <Badge variant="success">
                  <Download className="w-3 h-3 mr-1" />
                  NPM
                </Badge>
              </div>
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm text-left overflow-x-auto">
                npm install @oxog/gamification-kit
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-b border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-600 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need for Gamification
            </h2>
            <p className="text-xl text-gray-600">
              Comprehensive features designed for production use cases with scalability and performance in mind.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover:scale-105 transition-transform">
                <div className="text-primary-600 mb-4">{feature.icon}</div>
                <CardTitle className="text-lg mb-2">{feature.title}</CardTitle>
                <CardDescription className="text-sm">{feature.description}</CardDescription>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Powerful Gamification Modules
            </h2>
            <p className="text-xl text-gray-600">
              Each module is independently usable, fully tested, and production-ready.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module, index) => (
              <Card key={index}>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <CardTitle className="text-lg mb-1">{module.name}</CardTitle>
                    <CardDescription className="text-sm">{module.description}</CardDescription>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Simple to Use, Powerful to Scale
              </h2>
              <p className="text-xl text-gray-600">
                Get started in minutes with our intuitive API.
              </p>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="bg-gray-900 text-gray-100 p-6 overflow-x-auto">
                  <pre className="font-mono text-sm">
{`import { GamificationKit } from '@oxog/gamification-kit';

// Initialize the kit
const gamification = new GamificationKit({
  storage: {
    type: 'redis',
    url: 'redis://localhost:6379'
  }
});

await gamification.initialize();

// Award points
await gamification.points.award('user123', {
  points: 100,
  reason: 'Completed tutorial'
});

// Check for new badges
await gamification.badges.checkProgress('user123');

// Get leaderboard
const leaderboard = await gamification.leaderboard
  .getLeaderboard({ period: 'weekly', limit: 10 });`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-bg">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Ready to Gamify Your Application?
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Start building engaging user experiences today with GamificationKit.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/getting-started">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  Get Started Now
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Read Documentation
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
