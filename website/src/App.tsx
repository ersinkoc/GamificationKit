import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Documentation } from './pages/Documentation';
import { APIReference } from './pages/APIReference';
import { Examples } from './pages/Examples';
import { GettingStarted } from './pages/GettingStarted';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Documentation />} />
            <Route path="/api" element={<APIReference />} />
            <Route path="/examples" element={<Examples />} />
            <Route path="/getting-started" element={<GettingStarted />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
