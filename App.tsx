
import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { KpiExceptions } from './pages/KpiExceptions';
import { WeekdayAnalysis } from './pages/WeekdayAnalysis';
import { MOCK_DELIVERIES } from './constants';
import { DeliveryRecord } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(MOCK_DELIVERIES);
  const [user] = useState({ name: 'Somsak L.', role: 'Admin' });

  const handleImport = (newItems: DeliveryRecord[]) => {
    // Basic de-duplication logic
    setDeliveries(prev => {
      const existingIds = new Set(prev.map(d => d.orderNo));
      const uniqueNewItems = newItems.filter(item => !existingIds.has(item.orderNo));
      return [...prev, ...uniqueNewItems];
    });
    setActiveTab('dashboard');
  };

  const handleUpdateDelivery = (updated: DeliveryRecord) => {
    setDeliveries(prev => prev.map(d => d.orderNo === updated.orderNo ? updated : d));
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard deliveries={deliveries} />;
      case 'import':
        return <Import onImportComplete={handleImport} />;
      case 'exceptions':
        return <KpiExceptions deliveries={deliveries} onUpdateDelivery={handleUpdateDelivery} userRole={user.role} />;
      case 'analysis':
        return <WeekdayAnalysis deliveries={deliveries} />;
      case 'settings':
        return (
          <div className="p-8 text-center text-gray-500">
            <i className="fas fa-tools text-6xl mb-4"></i>
            <h2 className="text-2xl font-bold">Master Data Configuration</h2>
            <p>Holidays, KPI Thresholds, and Store Closures management coming soon.</p>
          </div>
        );
      default:
        return <Dashboard deliveries={deliveries} />;
    }
  };

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Navbar user={user} />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 ml-64 pt-16 transition-all duration-300">
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
