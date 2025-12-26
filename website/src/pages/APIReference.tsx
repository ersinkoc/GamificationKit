import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui';
import { ExternalLink } from 'lucide-react';

export const APIReference: React.FC = () => {
  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            API Reference
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Complete TypeDoc-generated API documentation
          </p>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>TypeDoc Documentation</CardTitle>
              <CardDescription>
                Our API is fully documented with TypeDoc. The complete reference includes all classes, interfaces, methods, and type definitions.
              </CardDescription>
              <div className="mt-4">
                <a
                  href="/docs/api"
                  className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Full API Documentation
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </div>
            </CardHeader>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Core Classes</CardTitle>
                <ul className="mt-4 space-y-2 text-gray-600">
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">GamificationKit</code> - Main orchestrator class</li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">EventManager</code> - Event bus for module communication</li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">RuleEngine</code> - Condition evaluation engine</li>
                </ul>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Module Classes</CardTitle>
                <ul className="mt-4 space-y-2 text-gray-600">
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">PointsModule</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">BadgeModule</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">LevelModule</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">LeaderboardModule</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">StreakModule</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">QuestModule</code></li>
                </ul>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Storage Adapters</CardTitle>
                <ul className="mt-4 space-y-2 text-gray-600">
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">MemoryStorage</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">RedisStorage</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">MongoStorage</code></li>
                  <li>• <code className="text-sm bg-gray-100 px-2 py-1 rounded">PostgresStorage</code></li>
                </ul>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
