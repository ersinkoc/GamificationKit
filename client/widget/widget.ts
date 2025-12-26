// @ts-nocheck
/// <reference lib="dom" />
(function() {
  'use strict';

  class GamificationWidget {
    constructor(options: any = {}) {
      this.options = {
        userId: null,
        apiUrl: '/gamification',
        position: 'bottom-right',
        theme: 'light',
        autoRefresh: true,
        refreshInterval: 30000,
        modules: ['points', 'level', 'badges', 'streaks'],
        expandable: true,
        animations: true,
        ...options
      };

      this.container = null;
      this.widget = null;
      this.refreshTimer = null;
      this.expanded = false;
      this.data = {};
      this.ws = null;
    }

    init() {
      if (!this.options.userId) {
        console.error('GamificationWidget: userId is required');
        return;
      }

      this.createStyles();
      this.createWidget();
      this.attachEventListeners();
      this.fetchData();
      
      if (this.options.autoRefresh) {
        this.startAutoRefresh();
      }

      if (this.options.websocket) {
        this.connectWebSocket();
      }
    }

    createStyles() {
      if (document.getElementById('gamification-widget-styles')) return;

      const style = document.createElement('style');
      style.id = 'gamification-widget-styles';
      style.textContent = `
        .gk-widget {
          position: fixed;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          z-index: 9999;
          transition: all 0.3s ease;
        }

        .gk-widget.bottom-right {
          bottom: 20px;
          right: 20px;
        }

        .gk-widget.bottom-left {
          bottom: 20px;
          left: 20px;
        }

        .gk-widget.top-right {
          top: 20px;
          right: 20px;
        }

        .gk-widget.top-left {
          top: 20px;
          left: 20px;
        }

        .gk-widget-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .gk-widget.dark .gk-widget-container {
          background: #1a1a1a;
          color: white;
        }

        .gk-widget-header {
          padding: 12px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gk-widget-title {
          font-weight: 600;
          font-size: 16px;
        }

        .gk-widget-toggle {
          width: 20px;
          height: 20px;
          cursor: pointer;
          transition: transform 0.3s ease;
        }

        .gk-widget.expanded .gk-widget-toggle {
          transform: rotate(180deg);
        }

        .gk-widget-body {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease;
        }

        .gk-widget.expanded .gk-widget-body {
          max-height: 400px;
          overflow-y: auto;
        }

        .gk-widget-section {
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .gk-widget.dark .gk-widget-section {
          border-color: #374151;
        }

        .gk-widget-section:last-child {
          border-bottom: none;
        }

        .gk-section-title {
          font-weight: 600;
          margin-bottom: 8px;
          color: #6b7280;
        }

        .gk-widget.dark .gk-section-title {
          color: #9ca3af;
        }

        .gk-points {
          font-size: 24px;
          font-weight: 700;
          color: #10b981;
        }

        .gk-level {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .gk-level-badge {
          background: #fbbf24;
          color: #78350f;
          padding: 4px 12px;
          border-radius: 20px;
          font-weight: 600;
        }

        .gk-progress-bar {
          flex: 1;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .gk-widget.dark .gk-progress-bar {
          background: #374151;
        }

        .gk-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
          transition: width 0.3s ease;
        }

        .gk-badge-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
          gap: 8px;
        }

        .gk-badge {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          position: relative;
        }

        .gk-widget.dark .gk-badge {
          background: #374151;
        }

        .gk-badge.earned {
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        }

        .gk-streak {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .gk-streak-count {
          font-size: 20px;
          font-weight: 700;
          color: #ef4444;
        }

        .gk-streak-freeze {
          background: #dbeafe;
          color: #1e40af;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }

        .gk-widget.dark .gk-streak-freeze {
          background: #1e3a8a;
          color: #dbeafe;
        }

        .gk-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
        }

        .gk-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid #e5e7eb;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: gk-spin 0.8s linear infinite;
        }

        @keyframes gk-spin {
          to { transform: rotate(360deg); }
        }

        .gk-notification {
          position: absolute;
          top: -40px;
          left: 50%;
          transform: translateX(-50%);
          background: #10b981;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 12px;
          white-space: nowrap;
          opacity: 0;
          transition: all 0.3s ease;
          pointer-events: none;
        }

        .gk-notification.show {
          opacity: 1;
          top: -50px;
        }
      `;

      document.head.appendChild(style);
    }

    createWidget() {
      this.container = document.createElement('div');
      this.container.className = `gk-widget ${this.options.position} ${this.options.theme}`;
      
      this.widget = document.createElement('div');
      this.widget.className = 'gk-widget-container';
      
      this.widget.innerHTML = `
        <div class="gk-widget-header">
          <div class="gk-widget-title">Your Progress</div>
          <svg class="gk-widget-toggle" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="gk-widget-body">
          <div class="gk-loading">
            <div class="gk-spinner"></div>
          </div>
        </div>
        <div class="gk-notification"></div>
      `;
      
      this.container.appendChild(this.widget);
      document.body.appendChild(this.container);
    }

    attachEventListeners() {
      const header = this.widget.querySelector('.gk-widget-header');
      header.addEventListener('click', () => this.toggle());

      // Close on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.expanded) {
          this.toggle();
        }
      });
    }

    toggle() {
      this.expanded = !this.expanded;
      this.container.classList.toggle('expanded');
      
      if (this.expanded) {
        this.fetchData();
      }
    }

    async fetchData() {
      try {
        const requests = [];
        
        if (this.options.modules.includes('points')) {
          requests.push(this.fetch(`/points/${this.options.userId}`));
        }
        
        if (this.options.modules.includes('level')) {
          requests.push(this.fetch(`/level/${this.options.userId}`));
        }
        
        if (this.options.modules.includes('badges')) {
          requests.push(this.fetch(`/badges/${this.options.userId}`));
        }
        
        if (this.options.modules.includes('streaks')) {
          requests.push(this.fetch(`/streaks/${this.options.userId}`));
        }
        
        const results = await Promise.all(requests);
        
        this.data = {
          points: results[0]?.points || 0,
          level: results[1] || {},
          badges: results[2]?.badges || [],
          streaks: results[3]?.streaks || {}
        };
        
        this.render();
      } catch (error) {
        console.error('Failed to fetch gamification data:', error);
        this.renderError();
      }
    }

    async fetch(endpoint) {
      const response = await fetch(`${this.options.apiUrl}${endpoint}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }

    render() {
      const body = this.widget.querySelector('.gk-widget-body');
      let html = '';
      
      if (this.options.modules.includes('points')) {
        html += `
          <div class="gk-widget-section">
            <div class="gk-section-title">Points</div>
            <div class="gk-points">${this.formatNumber(this.data.points)}</div>
          </div>
        `;
      }
      
      if (this.options.modules.includes('level') && this.data.level) {
        const progress = this.data.level.progress || {};
        html += `
          <div class="gk-widget-section">
            <div class="gk-section-title">Level</div>
            <div class="gk-level">
              <div class="gk-level-badge">Lvl ${this.data.level.level}</div>
              <div class="gk-progress-bar">
                <div class="gk-progress-fill" style="width: ${progress.percentage || 0}%"></div>
              </div>
            </div>
          </div>
        `;
      }
      
      if (this.options.modules.includes('badges') && this.data.badges.length > 0) {
        html += `
          <div class="gk-widget-section">
            <div class="gk-section-title">Recent Badges</div>
            <div class="gk-badge-grid">
              ${this.data.badges.slice(0, 6).map(badge => `
                <div class="gk-badge earned" title="${this.escapeHtml(badge.name)}">
                  ${this.escapeHtml(badge.icon) || '🏆'}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      
      if (this.options.modules.includes('streaks') && this.data.streaks.daily) {
        const streak = this.data.streaks.daily;
        html += `
          <div class="gk-widget-section">
            <div class="gk-section-title">Daily Streak</div>
            <div class="gk-streak">
              <div class="gk-streak-count">${streak.currentStreak} days</div>
              ${streak.frozen ? '<div class="gk-streak-freeze">Frozen</div>' : ''}
            </div>
          </div>
        `;
      }
      
      body.innerHTML = html;
    }

    renderError() {
      const body = this.widget.querySelector('.gk-widget-body');
      body.innerHTML = `
        <div class="gk-widget-section">
          <div style="text-align: center; color: #ef4444;">
            Failed to load data
          </div>
        </div>
      `;
    }

    formatNumber(num) {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return num.toLocaleString();
    }

    // Fix: Add HTML escaping to prevent XSS attacks
    escapeHtml(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    showNotification(message, type = 'success') {
      const notification = this.widget.querySelector('.gk-notification');
      notification.textContent = message;
      notification.style.background = type === 'success' ? '#10b981' : '#ef4444';
      notification.classList.add('show');
      
      setTimeout(() => {
        notification.classList.remove('show');
      }, 3000);
    }

    startAutoRefresh() {
      this.refreshTimer = setInterval(() => {
        if (this.expanded) {
          this.fetchData();
        }
      }, this.options.refreshInterval);
    }

    connectWebSocket() {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${this.options.apiUrl}/ws?userId=${this.options.userId}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle real-time updates
        if (data.type === 'points.awarded') {
          this.showNotification(`+${data.points} points!`);
          this.fetchData();
        } else if (data.type === 'badge.awarded') {
          this.showNotification('New badge earned!');
          this.fetchData();
        } else if (data.type === 'level.up') {
          this.showNotification(`Level ${data.newLevel} reached!`);
          this.fetchData();
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      this.ws.onclose = () => {
        // Reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    }

    destroy() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
      
      if (this.ws) {
        this.ws.close();
      }
      
      if (this.container) {
        this.container.remove();
      }
    }
  }

  // Expose to global scope
  window.GamificationWidget = GamificationWidget;
})();