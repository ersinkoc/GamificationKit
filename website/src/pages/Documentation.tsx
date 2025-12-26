import React from 'react';
import { Book, Award, TrendingUp, Target, Zap, Database, Code, Shield } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui';
import { Link } from 'react-router-dom';

export const Documentation: React.FC = () => {
  const sections = [
    {
      title: 'Core Concepts',
      icon: <Book className="w-6 h-6" />,
      items: [
        { name: 'Architecture Overview', href: '#architecture' },
        { name: 'Event System', href: '#events' },
        { name: 'Storage Adapters', href: '#storage' },
        { name: 'Module System', href: '#modules' },
      ]
    },
    {
      title: 'Gamification Modules',
      icon: <Award className="w-6 h-6" />,
      items: [
        { name: 'Points Module', href: '#points' },
        { name: 'Badge Module', href: '#badges' },
        { name: 'Level Module', href: '#levels' },
        { name: 'Leaderboard Module', href: '#leaderboard' },
        { name: 'Streak Module', href: '#streaks' },
        { name: 'Quest Module', href: '#quests' },
        { name: 'Achievement Module', href: '#achievements' },
      ]
    },
    {
      title: 'Advanced Features',
      icon: <Zap className="w-6 h-6" />,
      items: [
        { name: 'Rule Engine', href: '#rules' },
        { name: 'WebSocket Server', href: '#websocket' },
        { name: 'Webhook Manager', href: '#webhooks' },
        { name: 'Metrics & Monitoring', href: '#metrics' },
      ]
    },
    {
      title: 'Production Guide',
      icon: <Shield className="w-6 h-6" />,
      items: [
        { name: 'Best Practices', href: '#best-practices' },
        { name: 'Security Considerations', href: '#security' },
        { name: 'Performance Optimization', href: '#performance' },
        { name: 'Deployment', href: '#deployment' },
      ]
    },
  ];

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Documentation
          </h1>
          <p className="text-xl text-gray-600">
            Comprehensive guides and references for GamificationKit
          </p>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {sections.map((section, index) => (
            <Card key={index} className="hover:scale-105 transition-transform">
              <CardHeader>
                <div className="text-primary-600 mb-3">{section.icon}</div>
                <CardTitle className="text-lg mb-4">{section.title}</CardTitle>
                <div className="space-y-2">
                  {section.items.map((item, itemIndex) => (
                    <a
                      key={itemIndex}
                      href={item.href}
                      className="block text-sm text-gray-600 hover:text-primary-600 transition-colors"
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto space-y-16">
          {/* Architecture Section */}
          <section id="architecture">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Architecture Overview</h2>
            <Card>
              <CardHeader>
                <CardDescription>
                  GamificationKit follows an event-driven, modular architecture designed for scalability and maintainability.
                </CardDescription>
              </CardHeader>
              <div className="p-6">
                <div className="code-block">
                  <pre>{`┌─────────────────────────────────────────────┐
│         GamificationKit (Core)              │
├─────────────────────────────────────────────┤
│                                             │
│  ┌────────────────┐   ┌─────────────────┐  │
│  │  EventManager  │◄─►│   RuleEngine    │  │
│  └────────────────┘   └─────────────────┘  │
│          ▲                                  │
│          │                                  │
│  ┌───────┴──────────────────────────────┐  │
│  │         Module System                │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  │  │
│  │  │ Points │  │ Badges │  │ Levels │  │  │
│  │  └────────┘  └────────┘  └────────┘  │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  │  │
│  │  │Streaks │  │ Quests │  │ Leader │  │  │
│  │  └────────┘  └────────┘  └────────┘  │  │
│  └──────────────────────────────────────┘  │
│          │                                  │
│          ▼                                  │
│  ┌──────────────────────────────────────┐  │
│  │      Storage Interface               │  │
│  └──────────────────────────────────────┘  │
│          │                                  │
└──────────┼──────────────────────────────────┘
           │
    ┌──────┴──────┐
    │  Adapters   │
    ├─────────────┤
    │ Redis       │
    │ MongoDB     │
    │ PostgreSQL  │
    │ Memory      │
    └─────────────┘`}</pre>
                </div>
              </div>
            </Card>
          </section>

          {/* Points Module */}
          <section id="points">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Points Module</h2>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Award Points</CardTitle>
                <CardDescription>
                  Award points to users with optional limits, multipliers, and decay
                </CardDescription>
              </CardHeader>
              <div className="p-6">
                <div className="code-block">
                  <pre>{`// Award points
await gamification.points.award('user123', {
  points: 100,
  reason: 'Completed tutorial',
  metadata: { tutorial_id: 'intro' }
});

// Get user points
const points = await gamification.points.getPoints('user123');

// Deduct points
await gamification.points.deduct('user123', {
  points: 50,
  reason: 'Redeemed reward'
});`}</pre>
                </div>
              </div>
            </Card>
          </section>

          {/* Badges Module */}
          <section id="badges">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Badge Module</h2>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Create and Award Badges</CardTitle>
                <CardDescription>
                  Define badges with progress tracking and automatic unlocking
                </CardDescription>
              </CardHeader>
              <div className="p-6">
                <div className="code-block">
                  <pre>{`// Define a badge
await gamification.badges.defineBadge({
  id: 'first-quest',
  name: 'Quest Beginner',
  description: 'Complete your first quest',
  criteria: {
    type: 'quest_completed',
    target: 1
  }
});

// Check badge progress
await gamification.badges.checkProgress('user123');

// Get user badges
const badges = await gamification.badges.getUserBadges('user123');`}</pre>
                </div>
              </div>
            </Card>
          </section>

          {/* More sections would go here */}

          {/* Best Practices */}
          <section id="best-practices">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Best Practices</h2>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Use Production Storage</CardTitle>
                  <CardDescription>
                    Always use Redis, MongoDB, or PostgreSQL in production. Memory storage is only for development.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Handle Events Asynchronously</CardTitle>
                  <CardDescription>
                    Use event handlers for side effects like notifications and logging. Don't block main operations.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Monitor Performance</CardTitle>
                  <CardDescription>
                    Use the built-in MetricsCollector to track performance and identify bottlenecks.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Implement Rate Limiting</CardTitle>
                  <CardDescription>
                    Use the built-in RateLimiter middleware to prevent abuse and ensure fair play.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 text-center">
          <Card className="max-w-2xl mx-auto bg-gradient-to-br from-primary-50 to-secondary-50">
            <CardHeader>
              <CardTitle className="text-2xl">Need More Help?</CardTitle>
              <CardDescription className="text-base">
                Check out our API reference for detailed information on all methods and options
              </CardDescription>
              <div className="mt-4">
                <Link to="/api" className="text-primary-600 hover:text-primary-700 font-medium">
                  View API Reference →
                </Link>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
};
